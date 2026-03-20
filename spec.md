# moli-p2p Specification (Master v1.7.7)

> **Version:** 1.7.7
> **Codename:** "Sovereign Resilience"
> **Focus:** Security Hardening, DoS Protection, Client Resilience
> **Environment:** 
>    - **Production**: `https://moli-green.is` (VPS / x86_64) - Node.js Gateway (Integrated Signaling).
>    - **Development**: Localhost / Raspberry Pi Zero 2.
> **Last Updated:** 2026-02-06 (v1.7.7 Release)

## 1. プロジェクト概要

*   **Goal:** Raspberry Pi Zero 2 をサーバーとする、軽量なP2P画像ギャラリー。
*   **Architecture:**
    *   **Server:** Rust (Axum) - Static File Serving & WebSocket Signaling (Fully Restored v1.7).
    *   **Client:** Vanilla TypeScript (Vite) - Pure P2P logic.

## 2. サーバーサイド仕様 (`/server`)

*   **Language:** Rust (Axum)
    *   **WebSocket Signaling (`/ws`)**: Replaced Node.js Gateway. Pure Rust implementation.
    *   **Broadcaster Logic**:
        *   Receives JSON messages and broadcasts to **all other connected clients**.
        *   No logic, no storage, no verification. Pure "Dumb Pipe".

## 3. クライアントサイド仕様 (`/client`)

### A. 通信戦略 (Core Strategy)

#### 1. Unidirectional Offer (片側発信)
Glare（衝突）を避けるため、接続時の役割をIDの大小で厳格に決定する。
*   `My ID < Peer ID`: **Offerer**
*   `My ID > Peer ID`: **Answerer**

#### 2. Targeted Signaling (宛先制御)
シグナリングメッセージの混線（Cross-talk）を防ぐため、ブロードキャスト以外のメッセージには必ず `targetId` を付与する。
*   受信側は `targetId` が自分宛てでないメッセージを無視する。

#### 3. Discovery Protocol (Join-Reply)
全メッシュ接続を確立するため、新規参加者と既存参加者の相互認識手順を定める。
1.  **新規参加者 (Joiner):** 全員に向けて `join` をブロードキャストする。
2.  **既存参加者 (Existing):** `join` を受信したら、その相手(Joiner)に向けて **ユニキャストで `join` を返信する**。
3.  双方が `join` を認識した時点で、`1. Unidirectional Offer` のロジックに従い `start()` を実行する。

### B. データ転送仕様 (Data Chunking)

WebRTC DataChannel のメッセージサイズ制限（約16KB～64KB）を回避するため、独自のチャンク転送プロトコルを使用する。
`dc.binaryType` は `'arraybuffer'` に設定する。

#### 1. Metadata Message (JSON string)
ファイル転送の開始時に送信する。
```json
{
  "type": "meta",
  "name": "image.png",
  "size": 1350000,
  "mime": "image/png"
}
```

#### 2. Binary Chunk (ArrayBuffer)
*   **Chunk Size:** 16KB (16 * 1024 bytes)
*   **Flow Control:** `dc.bufferedAmount` を監視し、バックプレッシャー制御を行う（バッファが溢れそうな場合は送信を一時待機）。

### C. データ構造 (Zod Schema)

```typescript
export const SignalSchema = z.discriminatedUnion('type', [
  // Joinはブロードキャスト(targetIdなし)とユニキャスト(targetIdあり)の両方がある
  z.object({ type: z.literal('join'), senderId: z.string(), targetId: z.string().optional() }),
  
  // 以降は全てユニキャスト必須
  z.object({ type: z.literal('offer'), senderId: z.string(), targetId: z.string(), sdp: z.any() }),
  z.object({ type: z.literal('answer'), senderId: z.string(), targetId: z.string(), sdp: z.any() }),
  z.object({ type: z.literal('candidate'), senderId: z.string(), targetId: z.string(), candidate: z.any() }),
]);
```

### D. クラス設計 (PeerSession.ts)

以下の実装パターンを順守する。

```typescript
// Unidirectional Start Logic
public async start() {
    const isOfferer = this.myId < this.peerId;
    if (isOfferer) {
        // Create DC, Create Offer
    } else {
        // Wait for Offer
    }
}
```

### F. Reliability & Queue (v9.6)

To prevent data interleaving and image corruption during concurrent sync/broadcasts:
1. **Sequential Send Queue**: Each `PeerSession` maintains a FIFO queue of `Blobs`. The next image only starts sending after the current one's `Promise` resolves.
2. **Backpressure Awareness**: The sender monitors `dc.bufferedAmount` and pauses if it exceeds 64KB.
3. **Receiver Protection**: If a new `meta` message arrives before the previous image is fully received, the receiver logs an error and aborts the corrupted transfer.
4. **Gossip-Ready Design**: The `PeerSession` class is decoupled from network topology. By ensuring point-to-point reliability at the session level, the system can migrate to a Gossip Protocol (v10) by simply re-routing buffers between sessions without modifying the core transfer logic.

### G. Visibility & Survival (v9.7)

To implement the "Digital Natural Selection" philosophy, we introduce the **Survival Index**:
1. **Holder Count**: Every image displays a badge (👤 N) representing how many peers in the mesh currently hold that image.
2. **Inventory Sharing**: 
   - Peers periodically exchange `inventory` messages containing SHA-256 hashes of their images.
   - P2PNetwork propagates these hashes to the UI via `onInventoryReceived`.
3. **Survival Visuals (Aura)**:
   - **Local Selection (Pin)**: Indicated by a **Gold Border** and shadow (`#ffd700`).
   - **Global Selection (Survival)**: Images with >1 holders display a **Green Aura** (box-shadow).
   - This allows users to see which images are "winning" the competition for storage in the mesh.
4. **Deduplication**: SHA-256 hashing prevents duplicate image entries. If a received image exists, its holder count increases instead of creating a new gallery item.

### H. Concurrency & Pull-Model (v9.8)

To prevent UI freezes and memory crashes during "Join Bursts," the transfer model shifted from Push to **Pull**:
1. **Offer-File Handshake**: 
   - Sender sends an `offer-file` JSON with `transferId`.
   - Receiver puts the offer into a **Global Pending Queue**.
2. **Concurrency Scheduler**: 
   - A global manager maintains an `Active Count` (Max = 3).
   - Only when a slot is free, the receiver sends a `pull-request` for the next file in the queue.
   - Slot is released after successful display or rejection.

### I. Sovereign Guard: Identity Maturation (v12.0)

Automatic mesh protection using community trust and "Proof of Time":
1. **Identity Aging (Maturation)**: 
   - A peer's "Age" is calculated as `now - identityCreatedTime`.
   - **Maturity Gates**:
     - *Infant (< 1h)*: Allowed only small images (< 1MB) and limited resolution.
     - *Mature (> 24h)*: Full protocol privileges unlocked.
2. **Rate Limiting (Physical Cost)**:
   - **Post Cooldown**: Identites are restricted to one broadcast every **10 minutes**.
   - **Enforcement**: Peers locally drop incoming `meta` messages from IDs that violate the cooldown.

### J. Community Filtering: Burn Protocol (v12.0)

Social immunity through decentralized consensus:
1. **Burn Signal**: A signed message `{"type": "burn", "hash": "..."}` broadcasted to the mesh.
2. **Weighted Voting**:
   - Burns from "Infant" IDs are ignored.
   - Burns from "Mature" IDs trigger immediate local deletion and blacklisting of the hash.
   - High-trust peers act as "Guardians" of the mesh's visual quality.
3. **Blacklist Persistence**: Hashed entries are stored in IndexedDB to prevent re-display of purged content.

### K. Physical Defense Layer (v9.10+)

Strict hardware-level protections:
1. **Hard Size Limit**: Metadata or Offers claiming >15MB are instantly ignored.
2. **Chunk Overflow Protection**: Transfer is aborted if `receivedBytes > declaredSize + 16KB`.
3. **Static Resource Guard**: Maximum image resolution capped at 5000x5000 pixels to prevent memory exhaustion (checked via image header).

### K. Connectivity Optimization (v9.7+)

1. **IPv6 Prioritization**: ICE candidates are sorted to move IPv6 addresses to the front of the gathering process, bypassing NAT in modern mobile (4G/5G) networks.

### L. Join Burst Handling (v9.7+)
The system is validated to handle 30+ concurrent image transfers (leveraging the v9.8 Scheduler).

### M. Cryptographic Identity & Signing (v11.0)

To move beyond anonymous UUIDs and establish verifiable authorship:
1. **Permanent Identity**: 
   - Uses Web Crypto API to generate an **ECDSA (P-256)** key pair on first launch.
   - **Privacy**: The private key is stored in IndexedDB with `extractable: false`, ensuring it never leaves the browser.
2. **Deterministic PeerID**: `PeerID` is derived from the SHA-256 hash of the Public Key.
3. **Metadata Signing**:
   - Every `meta` message contains a `signature` field.
   - The signature covers high-level metadata (name, size, hash).
4. **Verification**: 
   - Receivers verify the signature before adding an image to the gallery or queue.
   - If verification fails, the file is rejected as "Spoofed."
5. **The "Burn" Mechanism (Reincarnation)**:
   - A UI option allows users to "Regenerate Identity."
   - Action: Deletes the key from IndexedDB and reloads the page. This allows users to voluntarily shed their history and start as a fresh identity.

### N. Anti-Spam Roadmap (Future v12.0+)

To prevent "Burn-and-Spam" attacks where a user regenerates identities to bypass bans:
1. **Case A: Identity Proof of Work (PoW)**:
   - Generating a new key requires a CPU-intensive calculation (finding a hash leading with N zeros).
   - This adds a physical "cost" to reincarnation, making rapid identity switching expensive.
2. **Case B: Trust Accumulation (Age Gate)**:
   - Freshly generated identities are marked as "Newcomers."
   - High-throughput broadcasting or high-resolution uploads are restricted for the first X minutes.
   - Only "Mature" identities (verified locally by peers over time) gain full protocol privileges.

### O. Safe Sovereign Honor (v1.4 - Pivot 2026-02)

To protect the Gateway infrastructure and align with platform policies while retaining protocol autonomy:

1.  **AI Verification Removal**:
    -   The risk of AI API key suspension due to user-uploaded content (e.g., hate symbols) is unacceptable.
    -   **Action**: Removed `verifyReceipt` (Gemini Multimodal). The "Golden Windmill" is now an Honor-based badge.
2.  **Sovereign Guard for Gateway**:
    -   **Identity Gating**: The Gateway (`/investigate`) REJECTS all requests from identities younger than **24 hours**. This imposes a time-cost on attackers.
    -   **Structural Sanitization**:
        -   Input tags are mechanically sanitized (Length < 60 chars, Block System/Control tokens).
        -   No cultural discrimination (Unicode/Arabic allowed).
    -   **Offline Investigator**:
        -   **No AI / No External API**: Replaced Gemini 2.0 with a local, deterministic Keyword Dictionary.
        -   **Zero Risk**: Removes all possibility of API key abuse or account bans.
        -   **Privacy**: Tag investigation happens entirely within the Gateway's local memory.
3.  **Global Circuit Breaker (The Final Fuse)**:
    -   To prevent wallet draining and mass safety violations:
        -   **Cost Guard**: Max **500 API calls/hour** server-wide. If exceeded -> `503 Service Unavailable`.


## 4. Dream (The Philosophy)

### Motivation: The "Success Penalty" of Federation
既存の分散型SNS（Mastodon/ActivityPub等）は、コミュニティが盛り上がり参加者が増えるほど、管理者（Admin）のサーバーリソースと金銭的負担が増大する構造的欠陥を抱えている。
「誰もが参加できる場所」を目指しても、物理的なコストの限界により、結局は参加者を絞らざるを得なくなる。

### Vision: Sustainable Scaling
ユーザー数の増加が、負荷ではなく「力」になるネットワークを目指す。
サーバー（Raspberry Pi Zero 2）は単なる「出会いの場」であり、コンテンツの責任を持たない。

### Solution: Ephemeral by Design
*   **Browser as Infrastructure:** 参加者全員がノードとなり、負荷を分散する（IPFSの思想）。
*   **No Persistence (No Pinning):** データの永続化（Pinning）にはコストがかかるため、これを排除する。
*   **"Presence is Storage":**
    *   データは「誰かがブラウザを開いている間」だけ存在する。
    *   「残したいなら、開けておく」。データの生存は、コミュニティの能動的な意志（Presence）に依存する。
    *   誰も見なくなったデータは自然に消滅する。これはバグではなく「仕様（Feature）」である。

### Roadmap: Gossip & Natural Selection
*   **From Full-Mesh to Gossip:**
    *   現在は検証のためFull Mesh（全員と接続）を採用しているが、スケールに伴いGossip Protocolへ移行する。
*   **Organic Replication:**
    *   Gossipによる情報の拡散が、自然な冗長性（Redundancy）を生む。
    *   **"Digital Natural Selection":** 人気のある画像は多くのノードに保持されて長く残り、関心を持たれない画像は自然に消えていく。情報の寿命がコミュニティの関心度によって動的に決まるエコシステムを目指す。

## 5. Deployment Strategy

The project maintains a dual-deployment strategy to balance stability and hardware-specific development.

### A. Production (Stable Node)
- **Host**: `https://moli-green.is` (1984 hosting / VPS)
- **Architecture**: `x86_64-unknown-linux-gnu`
- **Purpose**: A reliable, always-on mesh node for monitoring protocol stability and "Survival Index" dynamics over long durations.
- **Stack**: Nginx (Reverse Proxy + SSL via Certbot) -> Rust Server (Axum).

### B. Development (Local Lab)
- **Host**: `pi.local` (Raspberry Pi Zero 2)
- **Architecture**: `aarch64-unknown-linux-gnu`
- **Purpose**: Testing performance on low-resource hardware, verifying IPv6/NAT behavior in local networks, and rapid prototyping of new features (e.g., Gossip Protocol).
- **Stack**: Cloudflare Tunnel (for external access) -> Rust Server (Axum).

### A. Pre-requisites (on Mac)
- `cargo-zigbuild` installed.
- Rust toolchain and Zig installed.

### B. Build & Transfer
1. **Cross-Compile Server**: `cargo zigbuild --release --target aarch64-unknown-linux-gnu`
2. **Build Client**: `npm run build`
3. **Transfer**:
   ```bash
   ssh moli@pi.local "mkdir -p ~/moli-p2p/server_bin ~/moli-p2p/client"
   rsync -avz server/target/aarch64-unknown-linux-gnu/release/server moli@pi.local:~/moli-p2p/server_bin/
   rsync -avz client/dist/ moli@pi.local:~/moli-p2p/client/dist/
   ```

### C. System Configuration (on Pi)
1. **Systemd Service**: Create `/etc/systemd/system/moli-p2p.service` to point to `/home/moli/moli-p2p/server_bin/server`.
2. **Reload & Start**: `sudo systemctl daemon-reload && sudo systemctl enable --now moli-p2p`.

### D. Connectivity (Cloudflare Tunnel)
Ensure `/etc/cloudflared/config.yml` maps your public domain to port **9090**.
Restart tunnel: `sudo systemctl restart cloudflared`.

## 6. Troubleshooting & Browser Compatibility

### Chrome "ICE Failed" Issue
Modern browsers (especially Chrome) anonymize local IP addresses using mDNS for privacy. Without a TURN server, this can block direct P2P connections on the same network.
- **Problem:** `RTCPeerConnection` fails with `ICE Connection State: failed`.
- **Workaround:** In Chrome, go to `chrome://flags` and set **Anonymize local IP addresses exposed by WebRTC** to **Disabled**.
- **Future Solution:** Deploy a TURN server to relay traffic when direct paths are hidden.

### 4G/LTE (Mobile Network) Issue
- **Problem:** Connections fail when one or both peers are on 4G/5G mobile data.
- **Cause:** Mobile networks use **Symmetric NAT** or **Carrier-Grade NAT (CGNAT)**. STUN (hole punching) is mathematically impossible in these environments.
- **Solution:** A **TURN Server** (Traversal Using Relays around NAT) is mandatory for 100% connectivity. This project currently operates on a "Best Effort / STUN Only" model to avoid server bandwidth costs.

## 7. Massive Scaling Economics (Towards 1 Billion Users)

If `moli-p2p` scales to 1 billion users, a centralized TURN server would cost millions of dollars in bandwidth. To maintain **Zero Cost to the Owner**, the architecture must shift:

### A. The "Skype-Style" Community Relay
- **Concept:** Users with "Open" NAT types (Global IP, IPv6) automatically become temporary relays for peers stuck behind Symmetric NAT.
- **Cost:** Distributed across users' own home internet connections.
- **Privacy:** Data remains E2EE; community relays only see encrypted blobs.

### B. Distributed Signaling (DHT)
- **Concept:** Replace the single Raspberry Pi WebSocket server with a Distributed Hash Table (DHT).
- **Benefit:** Scaling from 100 to 1,000,000,000 users doesn't increase the central server's load because the users themselves handle discovery.

### C. IPv6 First Policy
- **Concept:** Prioritize IPv6 ICE candidates. Most mobile 4G/5G carriers support IPv6, which often bypasses NAT entirely, making STUN/TURN unnecessary for those connections.

## 8. AI Localization Report (2026-01-31)

### 経緯と現状の報告
ブラウザ上での完全オフライン AI 検知（zero-CDN）の実現に向けた試行を実施。

1. **実施内容:**
   - `@huggingface/transformers` (v3.x) 用の全モデル資産および ONNX Runtime WASM バイナリのローカライズ。
   - モデル取得および正規化を自動化するための **CLI ツール (`/cli`) の新規作成**。
   - Vite プレビューおよび専用の Node.js プロキシサーバーによる COOP/COEP ヘッダーの強制適用。
   - モデルファイルの不整合（量子化名とベース名の不一致）および `.mjs` の MIME タイプ問題の特定と修正。

2. **直面した課題:**
   - **アーキテクチャの摩擦:** `window.crossOriginIsolated` を必須とするセキュリティ制約が、P2P アプリとしての軽量さや他機能との親和性を著しく損なう。
   - **資産の持続性:** 数百MBに及ぶ巨大な ONNX モデルの維持、および Hugging Face 依存の学習データ探索に多大なコストがかかることが判明。
   - **ランタイムの脆弱性:** ブラウザの WASM 実行環境、MIME タイプ、SharedArrayBuffer の挙動など、外部要因による破壊的変更に非常に弱い。

3.  **最終結論 (Final Decision - 2026-02 Pivot):**
   ブラウザ内AI処理だけでなく、GatewayでのAI画像解析（Gemini Multimodal）も廃止を決定。さらに、テキスト解析（Gemini Flash）もアカウント保全のために廃止し、**「完全オフライン辞書（Static Dictionary）」** モデルへ移行した。これにより、外部依存リスクはゼロとなった。

## 9. [REMOVED] Accessible Guardian Protocol (Legacy)
*(Removed in v1.7. System is now agnostic to content nature.)*

### A. [REMOVED] Headless CLI
*(Removed in v1.7 due to accessibility concerns and maintenance burden)*


### B. AI Vision (Soul's Eye) [v12.6]
ソウルがギャラリーの内容を詳細に分析するためのマルチモーダル機能。
- **Tooling**: `examine_image_content` ツールにより、ハッシュを指定して画像データを取得・解析。
- **Multimodal**: Gemini 2.0 Flash を使用し、画像の中身に基づいた詩的で詳細な解説を生成する。

### C. Startup Suppression (Anti-Spam) [v12.6]
起動時の連鎖的な通知（スパム）を防ぐ物理的なガードレール。
- **Silence Window**: ギャラリー読み込みから最初の **5秒間** を「Historical Sync」期間とし、この間に届いた画像の説明を抑制する。
- **Benefit**: 過去の大量の同期画像に圧倒されることなく、接続後の「今、この瞬間」の変化にフォーカスできる。

### D. Whitelist Enforcement (Verified Peers) [v12.6]
特定の個人に依存せず、ユーザーが明示的に「目」として信頼する相手（Guardian）が、**自ら内容を確認して「Pin（承認）」したものだけ**を抽出するガードレール。
- **Config**: `~/.moli/trusted_peers.json` に登録された公開鍵を持つピアのみが解説をトリガーできる。
- **Logic**: 
    1. 送信者がホワイトリストと一致する。
    2. `FileMeta` の `isPinned` フラグが `true` であり、その事実が Guardian によって署名されている。
- **Goal**: 信頼したノードが偶然受信しただけの不適切な画像が、フィルタを突き抜けて視覚障害者の環境に届く事故を物理的に遮断する。

### E. End-to-End Meta Propagation
画像のコンテキスト（文脈）を保持するためのデータ配線。
- **Captioning**: 各画像は `name` (caption) フィールドを保持し、アップロード時から P2P 共有、CLI 通知まで一貫して伝播される。
- **Signatures**: `PeerSession` は `publicKey` をメタデータに含め、転送中に改ざんされていないことを保証する。

## 10. [REMOVED] Tribute Protocol & Gateway (Legacy)
*(Removed in v1.7. The Gateway component has been deleted. P2P Mesh is now fully autonomous.)*

The **Tribute Protocol** was an experimental "Honorable Receipt" system leveraging an Oracle. It has been abolished to prevent centralization risks.

### A. Gateway Architecture (`/gateway`)
A separate, secured Node.js application acting as the protocol's Oracle.
*   **Role**: Trusted Signing Oracle & Safe Content Analyzer.
*   **Infrastructure**: Node.js (Express), SQLite (Better-SQLite3) for Cache, Ed25519 for Signing.
*   **Security Principle**: "Sovereign Guard" - Protects the API key from abuse using Identity Gating and Circuit Breakers.

### B. Security Layers (The "Three Shields")

#### 1. Sovereign Guard (Identity Gating)
*   **Rule**: The `/investigate` endpoint (Text AI) is STRICTLY restricted to "Mature Identities" (>24 hours old).
*   **Implementation**: Checks `x-identity-created` header against server time. Infants (<24h) receive `403 Forbidden`.
*   **Purpose**: Forces attackers to "wait" 24 hours per attack vector, destroying the economic efficiency of spam bots.

#### 2. Structural Sanitization (Input Firewall)
*   **Rule**: Block "Attack Structures" (Injection), not "Culture" (Language).
*   **Logic**:
    *   Max Length: 60 chars.
    *   No Block: Unicode Letters (Arabic, Japanese, Emoji allowed).
    *   Block: Control Chars (`\n`, `\t`), System Tokens (`System:`, `{}`, `[]`).

#### 3. Global Circuit Breaker (Final Fuse)
*   **Cost Guard**: Max **500 API calls/hour** (Server Global). If exceeded -> `503 Service Unavailable`.
*   **Safety Fuse**: Max **5 Safety Violations/hour**. If exceeded -> `Tripped` (Shutdown).
*   **Recovery**: Counters auto-reset every hour.

### C. API Reference

#### 1. Investigation (`POST /investigate`)
Analyzes a user-provided tag to find a donation target.
*   **Headers**: `x-peer-id`, `x-identity-created` (Required)
*   **Body**: `{"tag": "Picasso", "referenceUrl": "..."}`
*   **Process**:
    1.  **Gate Check**: Is Identity > 24h?
    2.  **Sanitize**: Clean tag structure.
    3.  **Circuit Check**: Are we under global limits?
    4.  **Dictionary Lookup**:
        -   **Keyword Match**: Checks input tag against a local mapping (e.g., 'Pokemon' -> Nintendo).
        -   **Fallback**: If no match, assigns a generic safety NPO (e.g., Internet Archive, Red Cross).
        -   **No AI**: Deterministic results, zero hallucinations.
*   **Response**: `ManifestData` (includes recognized target or fallback).

#### 2. Pledge (`POST /pledge`)
Issues a "Verified Honorable Receipt" after Proof-of-Work.
*   **Headers**: `x-peer-id`
*   **Body**: `{"imageId": "...", "tag": "...", "powNonce": "...", "timestamp": N}`
*   **Process**:
    1.  **PoW Check**: Verify SHA-256(peerId + timestamp + nonce) has difficulty 4 (starts with "0000").
    2.  **Age Check**: Verify Identity > 24h.
    3.  **Sign**: Gateway signs the receipt using its private Ed25519 key.
*   **Response**:
    ```json
    {
      "status": "success",
      "receipt": {
        "type": "HONORABLE_RECEIPT",
        "verification": { "status": "HONOR_PLEDGE" },
        "proof": { "gateway_id": "...", "signature": "..." }
      }
    }
    ```

### D. Data Structures

#### 1. ManifestData (Cacheable)
```typescript
interface ManifestData {
  tag_received: string;
  identified_context: string;
  payout_type: 'DIRECT_TRIBUTE' | 'NPO_FALLBACK' | null;
  target: { name: string; url: string; platform: string };
  reason_code: 'SPECIFIC' | 'CULTURE' | 'UNSAFE' | ...;
  report: string;
}
```

#### 2. Honorable Receipt (P2P Propagated)
The receipt is attached to images and broadcasted to the mesh.
*   **Badge**: "Golden Windmill" (Displayed if signature is valid).
*   **Verification**: Any peer can verify the receipt using the Gateway's Public Key (`GATEWAY_PUBLIC_KEY`).

## 11. Burn Protocol Hardening "Order 66" (v1.4 Specification)

To ensure "分散型モデレーション (Decentralized Moderation)" acts as a robust immune system rather than a mob rule, we implement strict cryptographic and age-based verifications.

### A. Infant Restrictions (The Nursery)
Peers with Identity Age < 24 hours are restricted to prevent spam and griefing.
*   **Upload Limits**:
    *   Max Resolution: **800 x 800 px**
    *   Max File Size: **1 MB**
    *   Rate Limit: **1 upload per 10 minutes**
*   **Protocol Limits**:
    *   Cannot issue **Burn Signals**.
    *   Cannot access Gateway Investigation (`/investigate` => 403).

### B. "Order 66" Execution Flow
461:     *   **No Broadcast**: This action is personal.
462:

### C. UX Safety
*   **Burn Content**: Requires explicit user confirmation ("Are you sure?").
*   **Burn Identity**: Requires explicit user confirmation ("DANGER: Irreversible").

## 12. Operational Policy (2026-02-01)

「絵のないギャラリーはギャラリーとは言えない。当面コンテンツの供給は、moli(管理者)が自腹を切って絵を購入することでそれに充てる。」

## 13. v1.5 Release Notes (2026-02-02)

### A. Architectural Consolidation
- **Signaling Server**:
    - The Rust-based signaling server (`/server`) is momentarily deprecated for Production.
    - **Integration**: Signaling is now handled directly by the Node.js Gateway (`gateway/src/server.ts`) using the `ws` library.
    - **Benefit**: Simplifies deployment (single process for API + Signaling) and resolves "Init Error" on production Nginx environments.

### B. User Onboarding & Polish
- **Manual**: Added a Glassmorphism Help Modal (`?` button) explaining:
    - Ephemeral Philosophy.
    - Identity Stages (Infant vs Sovereign).
    - Actions (Pin, Broadcast, Tribute, Burn).
- **Local Remove**: Users can now hide images locally (`🗑️`) without broadcasting a Burn signal.
- **UI Fixes**: 
    - **Lightbox**: Fixed overlay blocking clicks.
    - **Broadcast**: Fixed layout overflow on tall images.

### C. Debug Configuration (Current State)
- **Maturation Time**: Temporarily set to **10 Seconds** (originally 24 Hours) to facilitate testing of Sovereign features (Tribute/Burn).
- **Action Required**: MUST revert to `24 * 60 * 60 * 1000` before wide public release to prevent spam.

## 14. Sovereign Immunity & Safety Mask (v1.6 Philosophy)

### A. The Conflict
P2P mesh networks are inherently "Wild West" environments. Without a central authority to ban users or delete content, malicious actors can:
1.  **Attack via Content**: Upload NSFW/shocking images.
2.  **Attack via Moderation**: Spam "Burn" (delete) signals to empty everyone's gallery.

### B. The Resolution: "My Computer, My Castle"
We resolve this by strictly decoupling "Network Availability" from "Local Presentation".
1.  **Sovereignty (No Remote Deletion)**: A peer **NEVER** deletes local data based on an external signal.
    -   External "Burn" signals are treated as **Advisory Only** (Toast notification).
    -   This prevents "Moderation Spam" from becoming a Denial of Service attack.
2.  **Safety Mask (Blur by Default)**:
    -   To enable coexistence with unmoderated content, **ALL** incoming images are treated as visually "unsafe" by default.
    -   **Behavior**: Images load with a heavy blur filter (`filter: blur(20px)`).
    -   **Consent**: The user must explicitly **Click to Reveal** (One-way action). This constitutes a conscious choice to view the content.


## 15. v1.6 Release Notes (2026-02-03)

### A. Zero-Risk Architecture (Offline Pivot)
To eliminate all platform risks associated with AI (account bans, TOS violations), the **AI Investigator has been abolished**.
-   **Static Dictionary**: The "Tribute Protocol" now relies on a manual, locally maintained dictionary (`investigator.ts`).
-   **Incompleteness as a Feature**: We accept that this list is not exhaustive. It acts as a curated "Garden" rather than an omniscient search engine.
-   **Zero External Dependencies**: The server makes NO external API calls. It is invisible to Big Tech monitoring logic.

### B. Sovereign Safety Completed
-   **No Remote Deletion**: "Burn" signals are strictly advisory.
-   **Blur by Default**: All incoming images are blurred, empowering the user to choose what they see.

## 16. v1.7 Release Notes (2026-02-03)

### A. The "Clean Slate" Pivot
To maximize maintainability and focus on the core "Human-to-Human" experience, we have removed non-essential subsystems:
1.  **CLI Removal**:
    -   The `cli` directory has been deleted.
    -   Associated bridge logic in the Client has been removed.
    -   The system is now a pure, unconnected mesh.

### B. Aesthetic Deregulation (The "No Judgment" Policy)
-   **Filter Removal**: Abolished `dhash`, entropy checks, and minimum resolution limits.
    -   *Philosophy*: "The system should not judge art."
    -   *Result*: Pixel Art (16x16) and Minimalist Art (Blank/Solid) are now fully supported.
-   **UX Tuning**:
    -   **Infant Rights**: New users can upload full-quality images immediately (Rate Limit maintained).
    -   **Z-Pattern Grid**: Switched gallery layout to a standard left-to-right grid for better chronological readability.
    -   **Capacity**: Increased local buffer to **50 images**.

### C. Docker Sovereignty
-   **Containerization**: Full Docker support for Server (Rust) and Client (Nginx).
-   **One-Click Run**: `docker compose up` is now the standard deployment method.

## 17. v1.7.5 Final Sovereign Release (2026-02-05)

### A. Burn Protocol Deregulation
-   **Abolished**: The "Identity Maturation" check (24-hour wait) for issuing Burn signals has been removed.
-   **Philosophy**: "Immediate Defense". Every Sovereign Soul, regardless of age, has the right to signal rejection of malicious content.

### B. "Scorched Earth" ID Reset
-   **Fix**: The header "Flame" button now correctly triggers a full local wipe.
-   **Scope**: Deletes `moli_identity` (LocalStorage), `moli_vault_db` (IndexDB), and `moli_blacklist_db` (IndexDB) before forcing a page reload.

### C. Visual & Stability Polish
-   **Startup Stability**: Fixed "Startup Error" red banners caused by missing DOM elements during initialization.
-   **Smart Pixelation**: Added logic to apply `image-rendering: pixelated` *only* to small images (<128px), ensuring Pixel Art looks crisp while Photos remain smooth.
-   **Aesthetic Hero**: Updated documentation with a generative-art hero video.

### D. Gossip Protocol V1 (Lazy Gossip)
-   **Connection Limiter**: `MAX_PEERS = 6`. Prevents signaling storms while maintaining mesh density.
-   **Relay Logic**: `GOSSIP_TTL = 3`. Ensures local message spread without flooding the entire network.
-   **Deduplication**: `MessageCache` prevents loops.

### E. Security Hardening (Trust No One)
-   **Burn Isolation**: "Burn" signals are NOT broadcasted. Removing an image only affects the local peer and blacklists the hash locally.
-   **Integrity Check**: Incoming blobs are hashed and compared to signed metadata. Mismatches are discarded before relaying.
-   **TTL Clamping**: Excessive TTL requests from peers are clamped to the local maximum to prevent amplification attacks.

### F. Signaling Sharding (The Ark)
-   **Room Logic**: Server randomly assigns peers to isolated rooms of **100** capacity.
-   **Goal**: Prevents "Signaling Storms" from crashing the server or flooding clients.
-   **Effect**: A massive influx of users (e.g., 10,000) is partitioned into 100 safe islands.


## 18. Server Hardening & Connectivity (v1.7.6 - 2026-02-06)

### A. IPv6 Dual-Stack Support
- **Issue**: Modern mobile networks (ISP) often use IPv6-only infrastructure, making IPv4-only servers unreachable without translation.
- **Solution**: The Rust Signaling Server now explicitly binds to `[::]:9090` (IPv6 Unspecified).
- **Effect**: Server accepts connections from both IPv4 and IPv6 clients.

### B. Ephemeral Authentication (TURN Security)
- **Issue**: Hardcoded TURN credentials in the client posed a security risk for public release.
- **Solution**:
  - **API**: Implemented `GET /api/ice-config` endpoint on the server.
  - **Logic**: Returns time-limited (1 Hour) credentials signed with HMAC-SHA1.
  - **Secret**: Server (`TURN_SECRET`) and Coturn (`static-auth-secret`) share a rotational secret key, never exposed to the client code.

### C. Identity Authority (Anti-Spoofing)
- **Issue**: Clients self-reporting their `senderId` allowed malicious actors to impersonate others (sending fake "Leave" signals).
- **Solution**:
  - **Server Authority**: The Server now generates a UUID for every connection (`my_id`).
  - **Force Overwrite**: The Server parses every upstream message and *force-overwrites* the `senderId` field with the trusted `my_id` before broadcasting.
  - **Handshake**: The Server sends `{"type": "identity", "senderId": "..."}` immediately upon connection. The Client waits for this message before initializing its P2P state.

### D. Denial of Service (DoS) Protection
- **Rule**: Max WebSocket Message Size = **16 KB**.
- **Action**: Messages exceeding this limit are silently dropped by the server.

## 19. Client Extension API (v1.7.9 - 2026-02-07)

To support local automation, AI bots, and headless clients, the browser client exposes a global API.

### `window.moliAPI`

This object bridges the internal P2P logic to the browser console or external scripts (UserScripts/Extensions).

#### Methods

1.  **`connect()`**
    -   Returns: `{ status: 'connected' | 'disconnected', id: string }`
    -   Description: Verification of network status and current Peer ID.

2.  **`upload(blob: Blob, name?: string)`**
    -   Returns: `Promise<{ success: boolean; reason?: string }>`
    -   Description: Injects a file into the local node, saves it to Vault, and broadcasts it to the mesh. This is legally equivalent to a user drag-and-drop action.

3.  **`getLatestImages()`**
    -   Returns: `Array<{ id: string, hash: string, caption?: string, timestamp: number }>`
    -   Description: Returns the current in-memory gallery state (Sorted by arrival).

4.  **`getImageContent(hash: string)`**
    -   Returns: `Promise<string | null>` (DataURL Base64)
    -   Description: Retrieves the full binary content of an image from the Blob URL store.

## 20. Concurrency & Robustness (v1.7.10 - 2026-02-10)

### A. Scheduler Optimization (Split Semaphore)
- **Problem**: In high-load scenarios (Rush Hour), a single shared semaphore for Uploads/Downloads caused deadlocks. Peers uploading rapidly starved their own download slots, preventing Full Duplex communication.
- **Solution**:
    -   **Split Semaphore**: Separate concurrency limits for Uploads and Downloads.
    -   **Uploads**: `MAX_CONCURRENT_UPLOADS = 3` (New Queue).
    -   **Downloads**: `MAX_CONCURRENT_DOWNLOADS = 3` (Optimized from 5).
    -   **Result**: 100% Full Duplex capability even under heavy burst loads.

### B. Connection Robustness (Retry Logic)
-   **Problem**: "Signaling Handshake Timed Out" occurred frequently during concurrent tab initialization (Race Condition).
-   **Solution**:
    -   **Exponential Backoff**: `P2PNetwork.init` now retries connection up to 5 times.
    -   **Logic**: 1s -> 2s -> 3s -> 4s -> 5s delay.
    -   **Effect**: Eliminates startup failures in multi-tab/low-end device scenarios.

## 21. Sovereign Safety Enforcement (v1.7.11 - 2026-03-20)

### A. Blur Bypass Bug Fix (Pull Strategy)
- **Issue**: Images requested via P2P "Pull" (Anti-Entropy missing hash requests) were missing the `originalSenderId` parameter when served. This caused receiving nodes to falsely flag incoming images as "Local" (`isLocal = true`), bypassing the Sovereign Safety "Blur by Default" filter.
- **Solution**: The Provider callback (`main.ts`) now explicitly passes `item.originalSenderId` into `session.sendImage()`.
- **Effect**: Complete restoration of the default safety blur on all non-local images, regardless of whether they were pushed actively or pulled passively.
