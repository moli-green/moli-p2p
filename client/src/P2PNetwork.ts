import { SignalSchema, type SignalMessage } from './types';
// Unused Vault import removed
import { PeerSession } from './PeerSession';
import { PeerIdentity } from './PeerIdentity';
import { v4 as uuidv4 } from 'uuid';
import { MAX_PEERS, GOSSIP_TTL, CACHE_SIZE } from './constants';

export class P2PNetwork {
    public myId: string = ''; // This is PeerID
    public sessionId: string = uuidv4(); // Unique per tab
    private ws!: WebSocket;
    public sessions = new Map<string, PeerSession>(); // Map<SessionID, PeerSession>
    private sessionToPeer = new Map<string, string>(); // SessionID -> PeerID
    public identity: PeerIdentity;
    private bucketRegistry = new Map<string, { tokens: number, lastRefill: number }>();
    private blacklist = new Set<string>(); // Image hashes
    private seenMessages = new Set<string>(); // Gossip V1 Deduplication (Content Hash)
    private activeIceServers: RTCIceServer[] | undefined;

    constructor(
        private onImage: (blob: Blob, peerId: string, isPinned?: boolean, name?: string, ttl?: number, originalSenderId?: string) => void,
        private onEvent: (type: 'connected' | 'sync-request' | 'inventory' | 'offer-file' | 'verified-image' | 'burn', session: PeerSession, data?: any) => void,
        private onPeerCountChange: (count: number) => void,
        private onTransferError: (session: PeerSession, transferId: string) => void,
        private onInventory: (peerId: string, hashes: string[]) => void,
        private onOfferFile: (session: PeerSession, data: any) => void,
        private onFileRequested: (session: PeerSession, hash: string) => void,
    ) {
        this.identity = new PeerIdentity();
        this.loadBlacklist();
    }

    private loadBlacklist() {
        try {
            const raw = localStorage.getItem('moli_blacklist');
            if (raw) {
                const list = JSON.parse(raw);
                if (Array.isArray(list)) {
                    this.blacklist = new Set(list);
                    console.log(`[Guard] Loaded ${this.blacklist.size} blacklisted items.`);
                }
            }
        } catch (e) {
            console.error('Failed to load blacklist', e);
        }
    }

    private saveBlacklist() {
        try {
            localStorage.setItem('moli_blacklist', JSON.stringify(Array.from(this.blacklist)));
        } catch (e) {
            console.error('Failed to save blacklist', e);
        }
    }

    private handleTransferError(peerId: string, transferId: string) {
        const session = this.sessions.get(peerId);
        if (session) {
            console.warn(`[Network] Transfer error feedback for ${peerId} (Transfer: ${transferId})`);
            this.onTransferError?.(session, transferId);
        }
    }

    private handleFileRequest(peerId: string, hash: string) {
        const session = this.sessions.get(peerId);
        if (session) {
            this.onFileRequested?.(session, hash);
        }
    }

    // Wrapper to handle Relay + UI Callback
    private onImageReceived = (blob: Blob, pId: string, pinned?: boolean, name?: string, ttl?: number, originalSenderId?: string) => {
        // Gossip V1: Relay Logic
        const hash = (blob as any).fileHash as string | undefined;
        if (hash && this.seenMessages.has(hash)) {
            console.log(`[Gossip] Duplicate image ignored: ${hash.substring(0, 8)}`);
            return;
        }
        if (hash) {
            this.seenMessages.add(hash);
            if (this.seenMessages.size > CACHE_SIZE) {
                const iter = this.seenMessages.values();
                const val = iter.next().value;
                if (val) this.seenMessages.delete(val);
            }
        }

        // Trigger UI (Simplified)
        this.onImage(blob, pId, pinned, name, ttl, originalSenderId);

        // Relay
        const currentTtl = typeof ttl === 'number' ? ttl : 0;
        if (currentTtl > 0) {
            // Trust No One: Clamp TTL to prevent amplification attacks
            // If neighbor sends 999, we treat it as max GOSSIP_TTL (3)
            const clampedTtl = Math.min(currentTtl, GOSSIP_TTL);
            const nextTtl = clampedTtl - 1;

            const safeHash = hash || '';
            console.log(`[Gossip] Relaying ${name || 'image'} to mesh (TTL: ${nextTtl}, Orig: ${currentTtl})`);

            // Relay to all except sender (handled by hash check mostly, but optimize?)
            // We don't have sender SessionID here easily without tracking it up stack.
            // But 'hash' check handles cycles.
            this.broadcastImage(blob, safeHash, pinned, name, nextTtl, undefined, originalSenderId);
        }
    }

    public isBlacklisted(hash: string): boolean {
        return this.blacklist.has(hash);
    }

    public addToBlacklist(hash: string): void {
        this.blacklist.add(hash);
        this.saveBlacklist();
        console.log(`[Guard] Added ${hash} to blacklist (Total: ${this.blacklist.size})`);
    }

    public canReceiveFrom(peerId: string): boolean {
        const now = Date.now();
        // Stability Tuning: Increase burst limit for Initial Sync (Gallery Size)
        const MAX_TOKENS = 100;
        // Refill 1 token every 10 seconds (Sustainable 6 msg/min)
        const REFILL_RATE = 10 * 1000;

        let state = this.bucketRegistry.get(peerId);
        if (!state) {
            state = { tokens: MAX_TOKENS, lastRefill: now };
        } else {
            // Refill tokens based on time passed
            const elapsed = now - state.lastRefill;
            const newTokens = Math.floor(elapsed / REFILL_RATE);
            if (newTokens > 0) {
                state.tokens = Math.min(MAX_TOKENS, state.tokens + newTokens);
                state.lastRefill = state.lastRefill + (newTokens * REFILL_RATE);
            }
        }

        if (state.tokens <= 0) {
            const nextTokenIn = Math.ceil((REFILL_RATE - (now - state.lastRefill)) / 1000);
            console.warn(`[Guard] Rate limit hit for ${peerId}. Tokens: 0. Next in ${nextTokenIn}s`);
            return false;
        }

        state.tokens--;
        this.bucketRegistry.set(peerId, state);
        console.log(`[Guard] Token accepted for ${peerId}. Remaining: ${state.tokens}`);
        return true;
    }

    public getPublicKey(): string | null {
        if (!this.identity.publicKeySpki) return null;
        return btoa(String.fromCharCode(...new Uint8Array(this.identity.publicKeySpki)));
    }

    public async init(config?: { iceServers?: RTCIceServer[] }): Promise<void> {
        this.activeIceServers = config?.iceServers;
        // Pre-load locally (legacy/fallback)
        await this.identity.init();

        let attempt = 0;
        const maxAttempts = 5;

        while (attempt < maxAttempts) {
            try {
                if (attempt > 0) console.log(`[P2P] Initialization attempt ${attempt + 1}/${maxAttempts}`);
                await this.connect();
                console.log('[P2P] Initialization Successful');
                return;
            } catch (e: any) {
                attempt++;
                if (attempt >= maxAttempts) throw e;
                const delay = 1000 * attempt;
                console.warn(`[P2P] Connection failed: ${e.message || e}. Retrying in ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    private connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.hostname === 'localhost' ? 'localhost:9090' : window.location.host;
            const path = window.location.hostname === 'localhost' ? '/ws' : '/api/ws';

            console.log(`[P2P] Connecting to Signaling Server: ${protocol}//${host}${path}`);
            this.ws = new WebSocket(`${protocol}//${host}${path}`);

            // Safety Timeout
            const timeout = setTimeout(() => {
                if (this.ws) this.ws.close();
                reject(new Error("Signaling Handshake Timed Out"));
            }, 5000);

            this.ws.onopen = () => {
                console.log('WS Connected. Waiting for Identity...');
            };

            this.ws.onmessage = (event) => {
                try {
                    const raw = JSON.parse(event.data);

                    // --- HANDSHAKE: Identity Assignment ---
                    if (raw.type === 'identity') {
                        console.log('[P2P] Server assigned Identity:', raw.senderId);
                        this.myId = raw.senderId;
                        this.sessionId = raw.senderId; // Sync SessionID with NetworkID for consistency

                        clearTimeout(timeout);
                        resolve(); // Ready to start

                        // Start Broadcast Loop & Health Check
                        this.broadcastJoin();
                        setInterval(() => {
                            this.broadcastJoin();

                            // Periodic Health Check & Heartbeat
                            const now = Date.now();
                            this.sessions.forEach((session, id) => {
                                // 1. Connection State Check
                                if (session.isConnectionFailed) {
                                    console.log(`[P2P] Health Check: Pruning failed session ${id}`);
                                    session.close();
                                    this.sessions.delete(id);
                                    return;
                                }

                                // 2. Application Heartbeat Check
                                // If we haven't seen a PONG/Message in 45s, kill it.
                                if (now - session.lastSeen > 45000) {
                                    console.warn(`[P2P] Heartbeat Timeout: No activity from ${id} in 45s. Closing.`);
                                    session.close();
                                    this.sessions.delete(id);
                                    return;
                                }

                                // 3. Keep-Alive Ping
                                session.sendPing();
                            });
                        }, 10000);
                        return;
                    }
                    // --------------------------------------

                    const parsed = SignalSchema.safeParse(raw);
                    if (parsed.success) {
                        this.handleSignal(parsed.data);
                    }
                } catch (e) {
                    console.error('WS Parse Error', e);
                }
            };

            this.ws.onerror = (e) => {
                console.error("WS Error", e);
            };

            this.ws.onclose = () => {
                console.log('[P2P] WS Closed');
                // Auto-reject if trying to connect
                if (!this.myId) {
                    // If we haven't got ID yet, it's a failure.
                }
            };

            window.addEventListener('beforeunload', () => {
                this.broadcast({ type: 'leave', senderId: this.sessionId });
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.close();
                }
            });
        });
    }

    private broadcast(msg: SignalMessage) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    private handleSignal(msg: SignalMessage) {
        if (msg.senderId === this.sessionId) return;

        if (msg.type === 'leave') {
            console.log(`Peer ${msg.senderId} left.`);
            this.sessions.delete(msg.senderId);
            return;
        }

        if (msg.type === 'join') {
            if (msg.targetId && msg.targetId !== this.sessionId) return;
        } else {
            if (msg.targetId !== this.sessionId) return;
        }

        const { senderId } = msg;

        if (msg.type === 'join') {
            this.sessionToPeer.set(msg.senderId, msg.peerId);
            if (!msg.targetId) {
                console.log(`Received broadcast JOIN from ${senderId} (Peer: ${msg.peerId}), announcing self.`);
                this.broadcast({ type: 'join', senderId: this.sessionId, peerId: this.myId, targetId: senderId });
            }
        }

        let session = this.sessions.get(senderId);

        // Self-Healing
        if (session && msg.type === 'join') {
            if (session.isConnectionFailed) {
                console.log(`[P2P] Self-Healing: Detected zombie session for ${senderId}. Closing and resetting.`);
                session.close();
                this.sessions.delete(senderId);
                session = undefined; // Force recreation
            } else if (!session.isConnected) {
                // Also handle case where ICE is checking/new but maybe stuck?
            }
        }

        if (!session) {
            // Gossip V1: Connection Limiter
            const isTargeted = !!msg.targetId;
            if (!isTargeted && this.connectedPeerCount >= MAX_PEERS) {
                return;
            }

            session = new PeerSession(
                this.sessionId,
                senderId,
                this.identity,
                (m) => this.broadcast(m),
                this.onImageReceived,
                (tId) => this.handleTransferError(senderId, tId),
                this,
                (type, s, d) => this.handleSessionEvent(type, s, d),
                (hash) => this.handleFileRequest(senderId, hash),
                undefined,
                this.activeIceServers
            );
            this.sessions.set(senderId, session);
            session.start();
        }

        if (msg.type !== 'join') {
            session.handleSignal(msg);
        }
    }

    private broadcastJoin() {
        this.broadcast({ type: 'join', senderId: this.sessionId, peerId: this.myId });
    }

    public get connectedPeerCount(): number {
        let count = 0;
        this.sessions.forEach(s => { if (s.isConnected) count++; });
        return count;
    }

    public broadcastImage(blob: Blob, hash: string, isPinned: boolean = false, name?: string, ttl: number = GOSSIP_TTL, excludePeerId?: string, originalSenderId?: string) {
        // Add to own seen messages to prevent reflection
        if (!this.seenMessages.has(hash)) {
            this.seenMessages.add(hash);
            if (this.seenMessages.size > CACHE_SIZE) {
                const iter = this.seenMessages.values();
                const val = iter.next().value;
                if (val) this.seenMessages.delete(val);
            }
        }

        let sentCount = 0;
        // Logic: Pass originalSenderId. If undefined (origin), use myId in peerSession.sendImage?
        // Actually PeerSession.sendImage will handle it if we pass it. 
        // We should pass myId as originalSenderId if it's new.
        const effectiveSender = originalSenderId || this.myId;

        this.sessions.forEach(session => {
            if (session.isConnected && session.sessionPeerId !== excludePeerId) {
                // Pass TTL to Send
                session.sendImage(blob, hash, isPinned, name, ttl, effectiveSender);
                sentCount++;
            }
        });

        if (sentCount === 0) {
            console.warn('No active peers connected (or all excluded). Image not sent.');
        } else {
            console.log(`Sending image to ${sentCount} peers (TTL: ${ttl}).`);
        }

        return sentCount;
    }

    private handleSessionEvent(type: 'connected' | 'sync-request' | 'inventory' | 'offer-file' | 'verified-image' | 'burn', session: PeerSession, data?: any) {
        if (type === 'connected') {
            this.onPeerCountChange?.(this.connectedPeerCount);
            console.log(`[Sync] DataChannel connected with ${session.sessionPeerId} (Peer: ${session.peerId}), requesting sync...`);
            session.requestSync();
        } else if (type === 'sync-request') {
            this.onEvent?.('sync-request', session);
        } else if (type === 'inventory') {
            const hashes = data as string[];
            this.onEvent?.('inventory', session, hashes);
            this.onInventory?.(session.peerId, hashes);
        } else if (type === 'offer-file') {
            this.onEvent?.('offer-file', session, data);
            this.onOfferFile?.(session, data); // Specific Callback
        } else if (type === 'burn') {
            // POLICY: Sakoku (Local Only)
            console.log(`[Network] Burn event for ${data.hash} handled locally. NOT broadcasting.`);
        }
    }

    public close() {
        console.log("[P2P] Closing Network...");
        this.sessions.forEach(session => session.close());
        this.sessions.clear();
        if (this.ws) {
            this.ws.close();
        }
    }
}
