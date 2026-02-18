import type { SignalMessage } from './types';
import { PeerIdentity } from './PeerIdentity';
import { blobHashRegistry } from './blobRegistry';



interface FileOffer {
    type: 'offer-file';
    transferId: string;
    name: string;
    size: number;
    mime: string;
    hash: string;
    isPinned?: boolean;
    ttl?: number; // Gossip V1
}

interface FileMetadata {
    type: 'meta';
    transferId: string;
    name: string;
    size: number;
    mime: string;
    hash: string;
    originalSenderId?: string; // Phase 31: Relay Integrity
    identityCreatedAt?: number;
    isPinned?: boolean;
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

    public get isConnectionFailed(): boolean {
        return this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'closed';
    }

    public close() {
        console.log(`[${this.myId}] Closing session with ${this.peerId}`);
        this.dc?.close();
        this.pc.close();
        this.stopTransferTimeout();
    }

    // Receiver State
    private receivedBuffers: ArrayBuffer[] = [];
    private receivedSize = 0;
    private currentMeta: FileMetadata | null = null;
    // Old sendQueue removed in Phase 46 Refactor
    // pullResolver removed (Phase 46)
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
        private onImage: (blob: Blob, peerId: string, isPinned?: boolean, name?: string, ttl?: number, originalSenderId?: string) => void,
        private onTransferError: (transferId: string) => void, // NEW: Error Feedback
        private network: { canReceiveFrom: (peerId: string) => boolean },
        private onSessionEvent?: (type: 'connected' | 'sync-request' | 'inventory' | 'offer-file' | 'verified-image' | 'burn', session: PeerSession, data?: any) => void,
        private onFileRequested?: (hash: string) => void, // NEW: Pull Request Callback
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

                    // NEW: Clear Pull Timeout (Success)
                    if (this.pullTimeouts.has(msg.transferId)) {
                        clearTimeout(this.pullTimeouts.get(msg.transferId));
                        this.pullTimeouts.delete(msg.transferId);
                    }

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

                    // 3. Cryptographic Identity Check (Simplified to just Age/Pin)
                    // We removed signature verification as part of Phase 30 Cleanup.
                    // We still pass identityCreatedAt for trust age, but don't verify it cryptographically per-file.
                    // This is a trade-off for simplicity.
                    // The PeerIdentity still exists for stable IDs.

                    console.log(`[${this.myId}] Starting Receive: ${msg.name} (${msg.size} bytes)`);
                    this.currentMeta = msg;
                    this.receivedBuffers = [];
                    this.receivedSize = 0;
                    this.startTransferTimeout(); // START TIMER
                } else if (msg.type === 'offer-file') {
                    // Physical Defense: Offer Size Guard
                    if (msg.size > MAX_FILE_SIZE) {
                        console.warn(`[${this.myId}] Ignoring oversized file offer: ${msg.name} (${msg.size} bytes)`);
                        return;
                    }
                    console.log(`[${this.myId}] Received FILE OFFER from ${this.peerId}: ${msg.name} Pinned: ${msg.isPinned}`);
                    this.onSessionEvent?.('offer-file', this, msg);

                } else if (msg.type === 'pull-request') {
                    // Phase 46: Async Pull Trigger
                    const upload = this.pendingUploads.get(msg.transferId);
                    if (upload) {
                        console.log(`[${this.myId}] Received PULL REQUEST for ${msg.transferId}. Queueing transfer...`);
                        this.transferQueue.push({ transferId: msg.transferId, upload });
                        this.pendingUploads.delete(msg.transferId); // Consumed
                        this.processTransferQueue();
                    } else {
                        console.warn(`[${this.myId}] Received PULL REQUEST for unknown/expired ID: ${msg.transferId}`);
                    }
                } else if (msg.type === 'sync-request') {
                    console.log(`[${this.myId}] Received SYNC REQUEST from ${this.peerId}`);
                    this.onSessionEvent?.('sync-request', this);

                } else if (msg.type === 'inventory') {
                    console.log(`[${this.myId}] Received INVENTORY from ${this.peerId}: ${(msg.hashes || []).length} images`);
                    this.onSessionEvent?.('inventory', this, msg.hashes);

                } else if (msg.type === 'request-file') {
                    console.log(`[${this.myId}] Received FILE REQUEST for hash ${msg.hash} from ${this.peerId}`);
                    this.onFileRequested?.(msg.hash);

                } else if (msg.type === 'burn') {
                    // POLICY: Sakoku (Lockdown)
                    console.log(`[Burn] IGNORED external burn signal from ${this.peerId}. (Sakoku Policy)`);
                    return;
                } else if (msg.type === 'ping') {
                    this.handlePing();
                } else if (msg.type === 'pong') {
                    this.handlePong();
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
                const blob = new Blob(this.receivedBuffers, { type: this.currentMeta.mime });
                const buffer = await blob.arrayBuffer();
                const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

                if (computedHash !== this.currentMeta.hash) {
                    console.error(`[${this.myId}] SECURITY ALERT: Hash Mismatch! Declared: ${this.currentMeta.hash}, Computed: ${computedHash}. Discarding data.`);
                    this.onTransferError(this.currentMeta.transferId); // NOTIFY
                    this.cleanupTransfer();
                    return;
                }

                console.log(`[${this.myId}] Integrity Verified. Hash matches.`);
                // CRITICAL FOR RELAY: Attach hash to blob so P2PNetwork can read it for Gossip
                blobHashRegistry.set(blob, this.currentMeta.hash);

                // Phase 31: Pass Original Sender
                const originalSender = this.currentMeta.originalSenderId || this.peerId;

                this.onImage(blob, this.peerId, this.currentMeta.isPinned, this.currentMeta.name, this.currentMeta.ttl, originalSender);

                // Reset
                this.cleanupTransfer();
            }
        }
    }

    // State for Async Transfers
    private pendingUploads = new Map<string, {
        blob: Blob;
        metadata: FileMetadata;
        timestamp: number;
    }>();
    private transferQueue: { transferId: string; upload: { blob: Blob; metadata: FileMetadata } }[] = [];
    private isTransferring = false;


    private cleanupPendingUploads() {
        const now = Date.now();
        this.pendingUploads.forEach((upload, id) => {
            if (now - upload.timestamp > 300000) { // 5 minutes TTL
                this.pendingUploads.delete(id);
            }
        });
    }

    // NEW: Request File via Hash (Pull) - Restored for Inventory Sync
    public requestFile(hash: string) {
        if (this.dc && this.dc.readyState === 'open') {
            console.log(`[${this.myId}] Requesting file ${hash.substring(0, 8)}... from ${this.peerId}`);
            this.dc.send(JSON.stringify({ type: 'request-file', hash }));
        }
    }

    public sendImage(blob: Blob, hash: string, isPinned: boolean = false, name?: string, ttl?: number, originalSenderId?: string) {
        if (!this.dc || this.dc.readyState !== 'open') return;

        const transferId = Math.random().toString(36).substring(2, 11);
        const fileName = name || (blob as File).name || 'image.png';
        const totalSize = blob.size;

        // 1. Store State
        const metadata: FileMetadata = {
            type: 'meta',
            transferId,
            name: fileName,
            size: totalSize,
            mime: blob.type,
            hash,
            isPinned,
            ttl,
            originalSenderId, // Phase 31
            identityCreatedAt: this.identity.createdAt,
        };

        this.pendingUploads.set(transferId, {
            blob,
            metadata,
            timestamp: Date.now()
        });

        // 2. Send Offer Immediately (Fire-and-Forget)
        const offer: FileOffer = {
            type: 'offer-file',
            transferId,
            name: fileName,
            size: totalSize,
            mime: blob.type,
            hash,
            isPinned,
            ttl,
        };
        console.log(`[${this.myId}] Offering Image to ${this.peerId}: ${totalSize} bytes (${transferId}) Pinned: ${isPinned} Orig: ${originalSenderId}`);
        this.dc.send(JSON.stringify(offer));

        this.cleanupPendingUploads();
    }


    // Replaces processQueue/executeSend
    private async processTransferQueue() {
        if (this.isTransferring || this.transferQueue.length === 0) return;
        if (!this.dc || this.dc.readyState !== 'open') return;

        this.isTransferring = true;
        const item = this.transferQueue.shift()!;

        try {
            await this.transferFile(item.transferId, item.upload);
        } catch (e) {
            console.error(`[${this.myId}] Transfer failed for ${item.transferId}`, e);
        } finally {
            this.isTransferring = false;
            // Process next item
            this.processTransferQueue();
        }
    }

    private async transferFile(transferId: string, upload: { blob: Blob; metadata: FileMetadata }) {
        console.log(`[${this.myId}] Starting Transfer for ${transferId} (${upload.metadata.name})`);

        // 1. Send Metadata
        this.dc?.send(JSON.stringify(upload.metadata));

        if (this.dc) {
            this.dc.bufferedAmountLowThreshold = 65536; // 64KB
        }

        const totalSize = upload.blob.size;
        const CHUNK_SIZE = 16 * 1024; // 16KB
        let offset = 0;

        // Optimized Loop (Memory Efficient: Chunked Read)
        while (offset < totalSize) {
            if (!this.dc || this.dc.readyState !== 'open') {
                throw new Error('DC closed during transfer');
            }

            if (this.dc.bufferedAmount > this.dc.bufferedAmountLowThreshold) {
                // Wait for buffer to drain
                await new Promise<void>((resolve, reject) => {
                    const dc = this.dc!;
                    const onLow = () => { cleanup(); resolve(); };
                    const onClose = () => { cleanup(); reject(new Error('DC Closed')); };
                    const onError = () => { cleanup(); reject(new Error('DC Error')); };

                    const cleanup = () => {
                        dc.removeEventListener('bufferedamountlow', onLow);
                        dc.removeEventListener('close', onClose);
                        dc.removeEventListener('error', onError);
                    };

                    dc.addEventListener('bufferedamountlow', onLow);
                    dc.addEventListener('close', onClose);
                    dc.addEventListener('error', onError);
                });
            }

            // Double check after await
            if (!this.dc || this.dc.readyState !== 'open') {
                throw new Error('DC closed during transfer');
            }

            // Read Chunk from Blob (Memory Optimization)
            const chunkBlob = upload.blob.slice(offset, offset + CHUNK_SIZE);
            const chunkBuffer = await chunkBlob.arrayBuffer();

            this.dc.send(chunkBuffer);
            offset += chunkBuffer.byteLength;
            console.log(`[${this.myId}] Send Chunk (${offset}/${totalSize})`);
        }
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

    // State for Pull Timeouts (Receiver Side)
    private pullTimeouts = new Map<string, any>();

    // NEW: Request File via Hash (Pull)
    public pullFile(transferId: string) {
        if (this.dc && this.dc.readyState === 'open') {
            console.log(`[${this.myId}] Sending PULL REQUEST for ${transferId} to ${this.peerId}`);

            // Set Timeout to release slot if peer ignores request
            if (this.pullTimeouts.has(transferId)) clearTimeout(this.pullTimeouts.get(transferId));

            const timeout = setTimeout(() => {
                console.warn(`[${this.myId}] Pull Request TIMEOUT for ${transferId}. Peer did not respond.`);
                this.onTransferError(transferId); // Release Slot
                this.pullTimeouts.delete(transferId);
            }, 15000); // 15s Timeout

            this.pullTimeouts.set(transferId, timeout);

            this.pendingPullRequests.add(transferId);
            this.dc.send(JSON.stringify({ type: 'pull-request', transferId }));
        } else {
            // Immediate error if DC not open
            this.onTransferError(transferId);
        }
    }

    // Heartbeat Logic
    public lastSeen: number = Date.now();

    public sendPing() {
        if (this.dc && this.dc.readyState === 'open') {
            try {
                this.dc.send(JSON.stringify({ type: 'ping' }));
            } catch (e) {
                console.warn(`[${this.myId}] Failed to send PING to ${this.peerId}`, e);
            }
        }
    }

    private handlePing() {
        if (this.dc && this.dc.readyState === 'open') {
            try {
                this.dc.send(JSON.stringify({ type: 'pong' }));
                this.lastSeen = Date.now(); // Update on ping too
            } catch (e) {
                console.warn(`[${this.myId}] Failed to send PONG to ${this.peerId}`, e);
            }
        }
    }

    private handlePong() {
        this.lastSeen = Date.now();
        // console.log(`[${this.myId}] Pong received from ${this.peerId}`);
    }

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
