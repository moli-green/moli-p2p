import type { SignalMessage } from './types';
import { PeerIdentity } from './PeerIdentity';

interface FileOffer {
    type: 'offer-file';
    transferId: string;
    name: string;
    size: number;
    mime: string;
    hash: string;
    isPinned?: boolean;
    tributeTag?: string;
    receipt?: any;
    ttl?: number; // Gossip V1
}

interface FileMetadata {
    type: 'meta';
    transferId: string;
    name: string;
    size: number;
    mime: string;
    hash: string;
    publicKey?: string; // Base64 SPKI
    signature?: string; // Base64
    identityCreatedAt?: number;
    isPinned?: boolean;
    tributeTag?: string;
    receipt?: any;
    ttl?: number; // Gossip V1
}

export class PeerSession {
    private pc: RTCPeerConnection;
    private dc: RTCDataChannel | null = null;
    private realPeerId: string;

    public get isConnected(): boolean {
        return this.dc?.readyState === 'open';
    }

    public get peerId(): string {
        return this.realPeerId;
    }

    public get sessionPeerId(): string {
        return this._peerId;
    }

    // Receiver State
    private receivedBuffers: ArrayBuffer[] = [];
    private receivedSize = 0;
    private currentMeta: FileMetadata | null = null;
    private sendQueue: Blob[] = [];

    private isSending = false;
    private currentOfferedTransferId: string | null = null;
    private pullResolver: (() => void) | null = null;
    private transferTimeout: any = null; // Timeout Handle

    // ICE Buffering
    private candidateQueue: RTCIceCandidateInit[] = [];
    private incomingQueue: MessageEvent[] = [];
    private isProcessingIncoming = false;

    // State for Pull Enforcement
    private pendingPullRequests = new Set<string>();

    constructor(
        private myId: string, // SessionID
        private _peerId: string, // SessionID
        private identity: PeerIdentity,
        private sendSignal: (msg: SignalMessage) => void,
        private onImage: (blob: Blob, peerId: string, isPinned?: boolean, publicKey?: string, name?: string, tributeTag?: string, receipt?: any, ttl?: number) => void,
        private onTransferError: (transferId: string) => void, // NEW: Error Feedback
        private network: { canReceiveFrom: (peerId: string) => boolean },
        private onSessionEvent?: (type: 'connected' | 'sync-request' | 'inventory' | 'offer-file' | 'verified-image' | 'burn', session: PeerSession, data?: any) => void,
        realPeerId?: string, // Deterministic Cryptographic ID
        activeIceServers?: RTCIceServer[] // Dynamic ICE Configuration
    ) {
        this.realPeerId = realPeerId || _peerId;
        // Enhanced STUN configuration & Logging
        this.pc = new RTCPeerConnection({
            iceServers: activeIceServers || [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
            ]
        });

        // Diagnostic Listeners
        this.pc.oniceconnectionstatechange = () => {
            console.log(`[${this.myId}] ICE Connection State: ${this.pc.iceConnectionState}`);
        };

        this.pc.onicegatheringstatechange = () => {
            console.log(`[${this.myId}] ICE Gathering State: ${this.pc.iceGatheringState}`);
        };

        this.pc.onconnectionstatechange = () => {
            console.log(`[${this.myId}] Peer Connection State: ${this.pc.connectionState}`);
        };

        // Send ICE Candidate
        this.pc.onicecandidate = ({ candidate }) => {
            if (candidate) {
                const isIPv6 = candidate.candidate.toLowerCase().includes('ip6') ||
                    (candidate.candidate.includes(':') && !candidate.candidate.includes('.'));
                console.log(`[${this.myId}] Gathered Candidate (${candidate.type})${isIPv6 ? ' [IPv6]' : ''}:`, candidate.candidate.substring(0, 50) + "...");
                this.sendSignal({
                    type: 'candidate',
                    senderId: this.myId,
                    targetId: this._peerId, // Target SessionID
                    candidate
                });
            } else {
                console.log(`[${this.myId}] ICE Gathering Complete.`);
            }
        };

        // (Answerer side) DataChannel received
        this.pc.ondatachannel = ({ channel }) => {
            console.log(`[${this.myId}] Received DataChannel from ${this.peerId} (Label: ${channel.label})`);
            this.setupDataChannel(channel);
        };
    }


    // ★ Unidirectional Logic: Only the smaller Signaling ID initiates
    public async start() {
        // Compare Session IDs (myId vs _peerId) NOT Peer IDs
        const isOfferer = this.myId < this._peerId;
        console.log(`[${this.myId}] Determining Role vs Session [${this._peerId}]: MySession < PeerSession = ${isOfferer}`);

        if (isOfferer) {
            console.log(`[${this.myId}] I am Offerer for ${this.peerId}`);
            // Offerer creates DataChannel
            const dc = this.pc.createDataChannel('moli-images');
            this.setupDataChannel(dc);

            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            console.log(`[${this.myId}] Sending OFFER to ${this.peerId}`);
            this.sendSignal({
                type: 'offer',
                senderId: this.myId,
                targetId: this._peerId, // Target SessionID
                sdp: offer
            });
        } else {
            console.log(`[${this.myId}] I am Answerer for ${this.peerId} (Waiting)`);
        }
    }

    public async handleSignal(msg: SignalMessage) {
        console.log(`[${this.myId}] Handling Signal from ${msg.senderId}: ${msg.type}`);
        try {
            if (msg.type === 'offer') {
                console.log(`[${this.myId}] Received OFFER`);
                // Technically only Answerer should receive this
                await this.pc.setRemoteDescription(msg.sdp);
                // Flush Candidates
                await this.flushCandidates();

                const answer = await this.pc.createAnswer();
                await this.pc.setLocalDescription(answer);
                console.log(`[${this.myId}] Sending ANSWER to ${msg.senderId}`);
                this.sendSignal({
                    type: 'answer',
                    senderId: this.myId,
                    targetId: this._peerId, // Target SessionID
                    sdp: answer
                });

            } else if (msg.type === 'answer') {
                console.log(`[${this.myId}] Received ANSWER`);
                await this.pc.setRemoteDescription(msg.sdp);
                // Flush Candidates
                await this.flushCandidates();

            } else if (msg.type === 'candidate') {
                console.log(`[${this.myId}] Received CANDIDATE`);
                if (this.pc.remoteDescription) {
                    await this.pc.addIceCandidate(msg.candidate);
                } else {
                    console.log(`[${this.myId}] Buffering CANDIDATE (RemoteDesc not set)`);
                    this.candidateQueue.push(msg.candidate);
                    // Sort queue to prioritize IPv6
                    this.candidateQueue.sort((a, b) => {
                        const aIsV6 = a.candidate?.toLowerCase().includes('ip6') || false;
                        const bIsV6 = b.candidate?.toLowerCase().includes('ip6') || false;
                        return aIsV6 === bIsV6 ? 0 : (aIsV6 ? -1 : 1);
                    });
                }
            }
        } catch (err) {
            console.error('Signaling Error:', err);
        }
    }

    private async flushCandidates() {
        if (this.candidateQueue.length > 0) {
            console.log(`[${this.myId}] Flushing ${this.candidateQueue.length} buffered candidates`);
            while (this.candidateQueue.length > 0) {
                const cand = this.candidateQueue.shift();
                if (cand) {
                    try {
                        await this.pc.addIceCandidate(cand);
                    } catch (e) {
                        console.error("Failed to add buffered candidate", e);
                    }
                }
            }
        }
    }

    private setupDataChannel(dc: RTCDataChannel) {
        this.dc = dc;
        dc.binaryType = 'arraybuffer';
        dc.onmessage = (ev) => {
            this.incomingQueue.push(ev);
            this.processIncomingQueue();
        };
        dc.onopen = () => {
            console.log(`DC Open! (Label: ${dc.label}, ID: ${dc.id})`);
            this.onSessionEvent?.('connected', this);
        };
        dc.onclose = () => console.warn(`DC Closed! (Label: ${dc.label})`);
        dc.onerror = (err) => console.error('DC Error', err);
    }

    private async processIncomingQueue() {
        if (this.isProcessingIncoming || this.incomingQueue.length === 0) return;
        this.isProcessingIncoming = true;

        while (this.incomingQueue.length > 0) {
            const ev = this.incomingQueue.shift()!;
            await this.handleDataMessage(ev);
        }

        this.isProcessingIncoming = false;
    }

    private async handleDataMessage(ev: MessageEvent) {
        const data = ev.data;
        const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB hard limit

        // 1. Handle Metadata (Text)
        if (typeof data === 'string') {
            try {
                const msg = JSON.parse(data);
                if (msg.type === 'meta') {
                    // SECURITY: Enforce "Pull" Semantics
                    // Block unrequested transfers to prevent DoS (Flood)
                    if (!this.pendingPullRequests.has(msg.transferId)) {
                        console.warn(`[${this.myId}] SECURITY ALERT: Blocked unrequested transfer: ${msg.transferId} (Pull Enforcement)`);
                        return;
                    }
                    this.pendingPullRequests.delete(msg.transferId); // Consume the token

                    // Physical Defense: Metadata Size Guard
                    if (msg.size > MAX_FILE_SIZE) {
                        console.error(`[${this.myId}] SECURITY ALERT: Rejected meta for ${msg.name} (declared ${msg.size} > ${MAX_FILE_SIZE})`);
                        this.currentMeta = null;
                        this.onTransferError(msg.transferId || 'unknown'); // NOTIFY
                        return;
                    }

                    // 1. Rate Limiting (10-min cooldown)
                    if (!this.network.canReceiveFrom(this.peerId)) {
                        this.currentMeta = null;
                        this.onTransferError(msg.transferId || 'unknown'); // NOTIFY
                        return;
                    }

                    // 2. Maturity Gate (Identity Age) - REMOVED (Deregulation v1.7.5)
                    const identityAge = msg.identityCreatedAt ? Date.now() - msg.identityCreatedAt : 0;


                    // 3. Cryptographic Identity Check (v12.0)
                    if (msg.publicKey && msg.signature && msg.identityCreatedAt) {
                        try {
                            const spki = Uint8Array.from(atob(msg.publicKey), c => c.charCodeAt(0)).buffer;
                            const pubKey = await this.identity.importPublicKey(spki);
                            const isValid = await this.identity.verifyMetadata(pubKey, msg.signature, msg.name, msg.size, msg.hash, msg.identityCreatedAt, msg.isPinned || false);

                            if (!isValid) {
                                console.error(`[${this.myId}] CRYPTO ALERT: Invalid signature from ${this.peerId} for ${msg.name}`);
                                this.currentMeta = null;
                                this.onTransferError(msg.transferId || 'unknown'); // NOTIFY
                                return;
                            }
                            console.log(`[${this.myId}] Identity Verified (Age: ${Math.floor(identityAge / 3600000)}h): ${msg.name} Pinned: ${msg.isPinned}`);
                        } catch (err) {
                            console.error(`[${this.myId}] Crypto error during verification:`, err);
                            this.currentMeta = null;
                            this.onTransferError(msg.transferId || 'unknown'); // NOTIFY
                            return;
                        }
                    } else {
                        console.warn(`[${this.myId}] Unsigned or un-dated metadata received from ${this.peerId} (v12.0 requirement missing)`);
                        this.currentMeta = null;
                        this.onTransferError(msg.transferId || 'unknown'); // NOTIFY
                        return;
                    }

                    // Safety check: if already receiving, previous one was interrupted
                    if (this.currentMeta && this.receivedSize < this.currentMeta.size) {
                        console.error(`[${this.myId}] INTERRUPTED: Received new meta while ${this.currentMeta.name} was incomplete (${this.receivedSize}/${this.currentMeta.size})`);
                        this.onTransferError(this.currentMeta.transferId); // NOTIFY OLD
                    }

                    console.log(`[${this.myId}] Starting Receive: ${msg.name} (${msg.size} bytes)`);
                    this.currentMeta = msg;
                    this.receivedBuffers = [];
                    this.receivedSize = 0;
                    this.startTransferTimeout(); // START TIMER
                } else if (msg.type === 'offer-file') {
                    // Physical Defense: Offer Size Guard
                    if (msg.size > MAX_FILE_SIZE) {
                        console.warn(`[${this.myId}] Ignoring oversized file offer: ${msg.name} (${msg.size} bytes)`);
                        // Note: offer-file doesn't consume a slot yet in the new Pull model (?)
                        // Actually it does NOT consume a slot until Pull Request is sent.
                        // But if we reject here, we should probably ignore it silently or notify if logic demanded.
                        // For now, silent ignore is fine as no slot is held.
                        return;
                    }
                    console.log(`[${this.myId}] Received FILE OFFER from ${this.peerId}: ${msg.name} Pinned: ${msg.isPinned}`);
                    this.onSessionEvent?.('offer-file', this, msg);
                } else if (msg.type === 'pull-request') {
                    if (this.currentOfferedTransferId === msg.transferId && this.pullResolver) {
                        console.log(`[${this.myId}] Received PULL REQUEST for ${msg.transferId}, starting send...`);
                        this.pullResolver();
                        this.pullResolver = null;
                    }
                } else if (msg.type === 'sync-request') {
                    console.log(`[${this.myId}] Received SYNC REQUEST from ${this.peerId}`);
                    this.onSessionEvent?.('sync-request', this);
                } else if (msg.type === 'inventory') {
                    console.log(`[${this.myId}] Received INVENTORY from ${this.peerId}: ${(msg.hashes || []).length} images`);
                    this.onSessionEvent?.('inventory', this, msg.hashes);
                } else if (msg.type === 'burn') {
                    // POLICY: Sakoku (Lockdown)
                    // We ignore all external burn commands. My Computer, My Castle.
                    console.log(`[Burn] IGNORED external burn signal from ${this.peerId}. (Sakoku Policy)`);
                    return;
                }
            } catch (e) {
                console.error(`[${this.myId}] Error handling data message from ${this.peerId}:`, e, data);
                if (this.currentMeta) { // If error occurs during parsing while active
                    this.onTransferError(this.currentMeta.transferId);
                    this.currentMeta = null;
                }
            }
            return;
        }

        // 2. Handle Binary Chunk
        if (data instanceof ArrayBuffer && this.currentMeta) {
            this.receivedBuffers.push(data);
            this.receivedSize += data.byteLength;
            this.startTransferTimeout(); // RESET TIMER (keep alive)

            // Physical Defense: Chunk Overflow Protection
            // DeclaredSize + 16KB (slack) OR Global Hard Limit
            const overflowLimit = Math.min(this.currentMeta.size + 16384, MAX_FILE_SIZE + 16384);
            if (this.receivedSize > overflowLimit) {
                console.error(`[${this.myId}] SECURITY ALERT: Chunk overflow detected for ${this.currentMeta.name}. Aborting transfer. (Received ${this.receivedSize} > Limit ${overflowLimit})`);
                this.onTransferError(this.currentMeta.transferId); // NOTIFY
                this.cleanupTransfer();
                return;
            }

            // Progress logging
            if (Math.floor((this.receivedSize - data.byteLength) / (256 * 1024)) < Math.floor(this.receivedSize / (256 * 1024))) {
                console.log(`[${this.myId}] Progress: ${this.receivedSize} / ${this.currentMeta.size} bytes`);
            }

            if (this.receivedSize >= this.currentMeta.size) {
                console.log(`[${this.myId}] File Receive Complete! ${this.receivedSize} bytes. TTL: ${this.currentMeta.ttl}`);
                this.stopTransferTimeout(); // STOP TIMER

                // SECURITY: Integrity Check (Hash-on-Receive)
                // Prevent Bait-and-Switch attacks by relays
                const blob = new Blob(this.receivedBuffers, { type: this.currentMeta.mime });
                const buffer = await blob.arrayBuffer();
                const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

                if (computedHash !== this.currentMeta.hash) {
                    console.error(`[${this.myId}] SECURITY ALERT: Hash Mismatch! Declared: ${this.currentMeta.hash}, Computed: ${computedHash}. Discarding data.`);
                    // We DO NOT call onImage. The data is compromised or corrupted.
                    this.onTransferError(this.currentMeta.transferId); // NOTIFY
                    this.cleanupTransfer();
                    return;
                }

                console.log(`[${this.myId}] Integrity Verified. Hash matches.`);
                this.onImage(blob, this.peerId, this.currentMeta.isPinned, this.currentMeta.publicKey, this.currentMeta.name, this.currentMeta.tributeTag, this.currentMeta.receipt, this.currentMeta.ttl);

                // Reset
                this.cleanupTransfer();
            }
        }
    }

    public sendImage(blob: Blob, hash: string, isPinned: boolean = false, name?: string, tributeTag?: string, receipt?: any, ttl?: number) {
        (blob as any).fileHash = hash;
        (blob as any).isPinned = isPinned;
        (blob as any).fileName = name || (blob as File).name || 'image.png';
        (blob as any).tributeTag = tributeTag;
        (blob as any).receipt = receipt;
        (blob as any).ttl = ttl;
        this.sendQueue.push(blob);
        this.processQueue();
    }

    private async processQueue() {
        if (this.isSending || this.sendQueue.length === 0) return;
        if (!this.dc || this.dc.readyState !== 'open') return;

        this.isSending = true;
        const blob = this.sendQueue.shift()!;

        try {
            await this.executeSend(blob);
        } catch (e) {
            console.error(`[${this.myId}] Failed to send image to ${this.peerId}`, e);
        } finally {
            this.isSending = false;
            // Process next image in queue
            this.processQueue();
        }
    }

    private async executeSend(blob: Blob) {
        const CHUNK_SIZE = 16 * 1024; // 16KB safe limit
        const totalSize = blob.size;
        const transferId = Math.random().toString(36).substring(2, 11);
        const hash = (blob as any).fileHash || '';
        const isPinned = (blob as any).isPinned || false;
        const tributeTag = (blob as any).tributeTag;
        const receipt = (blob as any).receipt;
        const ttl = (blob as any).ttl; // Could be undefined (new broadcast) or number (relay)
        console.log(`[${this.myId}] Offering Image to ${this.peerId}: ${totalSize} bytes (${transferId}) Pinned: ${isPinned}`);

        // 1. Send Offer
        const offer: FileOffer = {
            type: 'offer-file',
            transferId,
            name: (blob as any).fileName || (blob as File).name || 'image.png',
            size: totalSize,
            mime: blob.type,
            hash,
            isPinned,
            tributeTag,
            receipt,
            ttl,
        };
        this.currentOfferedTransferId = transferId;
        this.dc?.send(JSON.stringify(offer));

        // 2. Wait for Pull Request (with 10-second timeout)
        await Promise.race([
            new Promise<void>(resolve => { this.pullResolver = resolve; }),
            new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Pull Timeout')), 10000))
        ]).catch(err => {
            this.pullResolver = null;
            this.currentOfferedTransferId = null;
            throw err;
        });

        // 3. Send Metadata (Actual start of binary)
        const signature = await this.identity.signMetadata(offer.name, totalSize, hash, isPinned);
        const publicKeyB64 = this.identity.publicKeySpki ? btoa(String.fromCharCode(...new Uint8Array(this.identity.publicKeySpki))) : undefined;

        const meta: FileMetadata = {
            type: 'meta',
            transferId,
            name: offer.name,
            size: totalSize,
            mime: offer.mime,
            hash,
            publicKey: publicKeyB64,
            signature,
            identityCreatedAt: this.identity.createdAt,
            isPinned,
            tributeTag,
            receipt,
            ttl,
        };
        this.dc?.send(JSON.stringify(meta));

        // 4. Send Chunks
        const buffer = await blob.arrayBuffer();
        let offset = 0;

        return new Promise<void>((resolve, reject) => {
            const sendChunk = () => {
                try {
                    while (offset < totalSize) {
                        if (this.dc?.bufferedAmount && this.dc.bufferedAmount > 64 * 1024) {
                            setTimeout(sendChunk, 50);
                            return;
                        }

                        if (!this.dc || this.dc.readyState !== 'open') {
                            reject(new Error('DC closed during transfer'));
                            return;
                        }

                        const length = Math.min(CHUNK_SIZE, totalSize - offset);
                        const chunk = new Uint8Array(buffer, offset, length);
                        this.dc.send(chunk);
                        offset += length;
                    }
                    console.log(`[${this.myId}] Send Complete to ${this.peerId}`);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            };
            sendChunk();
        });
    }

    public requestSync() {
        if (this.dc && this.dc.readyState === 'open') {
            this.dc.send(JSON.stringify({ type: 'sync-request' }));
        }
    }

    public sendInventory(hashes: string[]) {
        if (this.dc && this.dc.readyState === 'open') {
            this.dc.send(JSON.stringify({ type: 'inventory', hashes }));
        }
    }

    public pullFile(transferId: string) {
        if (this.dc && this.dc.readyState === 'open') {
            console.log(`[${this.myId}] Sending PULL REQUEST for ${transferId} to ${this.peerId}`);
            this.pendingPullRequests.add(transferId); // Register expectation
            this.dc.send(JSON.stringify({ type: 'pull-request', transferId }));
        }
    }

    // Burn Signal removed (Sakoku Policy)
    // public sendBurnSignal(...) {}

    private startTransferTimeout() {
        this.stopTransferTimeout();
        this.transferTimeout = setTimeout(() => {
            console.error(`[${this.myId}] Transfer TIMEOUT for ${this.currentMeta?.name}. Aborting.`);
            if (this.currentMeta) {
                this.onTransferError(this.currentMeta.transferId);
            }
            this.cleanupTransfer();
        }, 30000); // 30 seconds stall limit
    }

    private stopTransferTimeout() {
        if (this.transferTimeout) {
            clearTimeout(this.transferTimeout);
            this.transferTimeout = null;
        }
    }

    private cleanupTransfer() {
        this.stopTransferTimeout();
        this.currentMeta = null;
        this.receivedBuffers = [];
        this.receivedSize = 0;
    }
}
