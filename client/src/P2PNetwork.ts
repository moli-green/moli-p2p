import { SignalSchema, type SignalMessage, type BurnSignal } from './types';
// Unused Vault import removed
import { PeerSession } from './PeerSession';
import { PeerIdentity } from './PeerIdentity';
import { v4 as uuidv4 } from 'uuid';

export class P2PNetwork {
    public myId: string = ''; // This is PeerID
    public sessionId: string = uuidv4(); // Unique per tab
    private ws!: WebSocket;
    public sessions = new Map<string, PeerSession>(); // Map<SessionID, PeerSession>
    private sessionToPeer = new Map<string, string>(); // SessionID -> PeerID
    public identity: PeerIdentity;
    private bucketRegistry = new Map<string, { tokens: number, lastRefill: number }>();
    private blacklist = new Set<string>(); // Image hashes
    private activeIceServers: RTCIceServer[] | undefined;

    constructor(
        private onImage: (blob: Blob, peerId: string, isPinned?: boolean, publicKey?: string, name?: string, tributeTag?: string, receipt?: any) => void,
        private onSyncRequest?: (session: PeerSession) => void,
        private onPeerCountChange?: (count: number) => void
    ) {
        this.identity = new PeerIdentity();
    }

    public isBlacklisted(hash: string): boolean {
        return this.blacklist.has(hash);
    }

    public addToBlacklist(hash: string): void {
        this.blacklist.add(hash);
    }

    public canReceiveFrom(peerId: string): boolean {
        const now = Date.now();
        const MAX_TOKENS = 15;
        const REFILL_RATE = 10 * 60 * 1000; // 1 token every 10 minutes

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

    public async init(config?: { iceServers?: RTCIceServer[] }) {
        this.activeIceServers = config?.iceServers;
        this.myId = await this.identity.init();

        // Connect to Server
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname === 'localhost' ? 'localhost:9090' : window.location.host;
        const path = window.location.hostname === 'localhost' ? '/ws' : '/api/ws';

        console.log(`[P2P] Connecting to Signaling Server: ${protocol}//${host}${path}`);
        this.ws = new WebSocket(`${protocol}//${host}${path}`);

        this.ws.onopen = () => {
            console.log('WS Connected. Session ID:', this.sessionId, 'Peer ID:', this.myId);
            this.broadcastJoin();
            setInterval(() => {
                this.broadcastJoin();
            }, 10000);
        };

        this.ws.onmessage = (event) => {
            try {
                const raw = JSON.parse(event.data);
                const parsed = SignalSchema.safeParse(raw);
                if (parsed.success) {
                    this.handleSignal(parsed.data);
                }
            } catch (e) {
                console.error('WS Parse Error', e);
            }
        };

        window.addEventListener('beforeunload', () => {
            this.broadcast({ type: 'leave', senderId: this.sessionId });
            this.ws.close();
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
        if (!session) {
            // const peerId = this.sessionToPeer.get(senderId) || senderId; // Unused
            session = new PeerSession(
                this.sessionId,
                senderId,
                this.identity,
                (m) => this.broadcast(m),
                this.onImage,
                this,           // Sovereign Guard Registry interface
                (type, s, d) => this.handleSessionEvent(type, s, d),
                undefined,
                this.activeIceServers // Inject Config
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

    public broadcastImage(blob: Blob, hash: string, isPinned: boolean = false, name?: string, tributeTag?: string, receipt?: any) {
        let sentCount = 0;
        this.sessions.forEach(session => {
            if (session.isConnected) {
                session.sendImage(blob, hash, isPinned, name, tributeTag, receipt);
                sentCount++;
            }
        });
        if (sentCount === 0) {
            console.warn('No active peers connected. Image not sent.');
        } else {
            console.log(`Sending image to ${sentCount} peers.`);
        }
    }

    public async broadcastBurn(hash: string) {
        this.blacklist.add(hash);
        const signature = await this.identity.signBurn(hash);
        const publicKeyB64 = this.identity.publicKeySpki ? btoa(String.fromCharCode(...new Uint8Array(this.identity.publicKeySpki))) : '';

        const signal: BurnSignal = {
            type: 'burn',
            hash,
            publicKey: publicKeyB64,
            signature,
            identityCreatedAt: this.identity.createdAt
        };

        this.sessions.forEach(s => {
            if (s.isConnected) s.sendBurnSignal(signal);
        });
    }

    private handleSessionEvent(type: 'connected' | 'sync-request' | 'inventory' | 'offer-file' | 'verified-image' | 'burn', session: PeerSession, data?: any) {
        if (type === 'connected') {
            this.onPeerCountChange?.(this.connectedPeerCount);
            console.log(`[Sync] DataChannel connected with ${session.sessionPeerId} (Peer: ${session.peerId}), requesting sync...`);
            session.requestSync();
        } else if (type === 'sync-request') {
            this.onSyncRequest?.(session);
        } else if (type === 'inventory') {
            const hashes = data as string[];
            this.onInventoryReceived?.(session.peerId, hashes);
        } else if (type === 'offer-file') {
            this.onOfferFile?.(session, data);
        } else if (type === 'burn') {
            const signal = data as BurnSignal;
            // Sovereign Guard: Principle of Non-Interference
            // We log the signal for debugging but DO NOT execute any local deletion or blacklisting based on external triggers.
            // My computer is my castle.
            console.log(`[Sovereign Guard] Advisory Burn Signal received for ${signal.hash.substring(0, 8)}. Ignoring action.`);
            this.onBurnReceived?.(signal.hash); // Added to silence unused variable warning and notify UI of advisory signal
        }
    }

    private onInventoryReceived?: (peerId: string, hashes: string[]) => void;
    public setInventoryCallback(cb: (peerId: string, hashes: string[]) => void) {
        this.onInventoryReceived = cb;
    }

    private onOfferFile?: (session: PeerSession, data: any) => void;
    public setOfferFileCallback(cb: (session: PeerSession, data: any) => void) {
        this.onOfferFile = cb;
    }

    private onBurnReceived?: (hash: string) => void;
    public setBurnCallback(cb: (hash: string) => void) {
        this.onBurnReceived = cb;
    }
}
