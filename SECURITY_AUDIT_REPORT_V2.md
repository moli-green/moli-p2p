# Antigravity様へのセキュリティ監査レポート (Security Audit Report v2)

本ドキュメントは、最新のコードベース（v1.7.6+）に対するセキュリティ監査の結果報告、および修正提案です。
前回の `SECURITY_AUDIT_PROPOSAL.md` で指摘されたサーバー側の脆弱性は解消されていますが、クライアント側にて新たな DoS（Resource Starvation）脆弱性が確認されました。

## 1. 【解決済み】サーバーサイドの脆弱性ステータス

以下の項目は、現在の `server/src/main.rs` にて適切に対策が実装されていることを確認しました。これ以上の対応は不要です。

*   **Identity Spoofing（なりすまし）**:
    *   **対策状況**: サーバーが接続時に UUID (`my_id`) を生成し、クライアントからの全メッセージの `senderId` を強制的に上書きしてブロードキャストする実装がなされています。
*   **DoS攻撃（Rate Limit & Size Limit）**:
    *   **対策状況**: 16KB のメッセージサイズ制限と、1秒あたり10メッセージのレートリミットが実装されています。

## 2. 【新規・高】クライアントサイド Resource Starvation (DoS)

### 現象
ファイル転送中にエラー（サイズ超過、ハッシュ不一致、または悪意あるピアによる転送ストール）が発生した場合、**ダウンロードスロットが解放されず、永久に占有されたままになる** 脆弱性が存在します。
`MAX_CONCURRENT_DOWNLOADS`（デフォルト 3）の上限までエラーが発生すると、それ以降、正常なファイルであっても一切受信できなくなります。

### 原因
`client/src/main.ts` の `releaseDownloadSlot()` は、転送が正常に完了し `addImageToGallery` が呼ばれた場合にのみ実行される構造になっています。
しかし、`client/src/PeerSession.ts` の `handleDataMessage` メソッドでは、エラー発生時に以下のように処理を中断しています：

```typescript
// client/src/PeerSession.ts (抜粋)

if (computedHash !== this.currentMeta.hash) {
    console.error(...);
    // We DO NOT call onImage. The data is compromised or corrupted.
    this.currentMeta = null;
    this.receivedBuffers = [];
    this.receivedSize = 0;
    return; // <--- ここで return すると、main.ts へのコールバックが発生しない
}
```

この `return` により、`main.ts` 側は転送が終了したことを検知できず、`activeDownloadCount` が減算されません。

### 修正提案 (To Antigravity)

**A. エラー通知チャンネルの確立**
`P2PNetwork` および `PeerSession` クラスに、転送失敗を通知するコールバック（例: `onTransferError`）を追加してください。

**B. スロット解放の実装**
`client/src/main.ts` にて、上記コールバックを受け取り、対象の転送IDに対応するスロットを解放 (`releaseDownloadSlot()`) する処理を追加してください。

**C. 受信タイムアウトの実装**
悪意あるピアが `meta` 情報だけを送信し、バイナリデータを送信しない（または極端に遅く送信する）攻撃を防ぐため、`PeerSession` 側で「最後のデータ受信から一定時間（例: 30秒）経過したら転送を破棄する」タイムアウト処理を実装してください。

## 3. 【低】その他

### innerHTML の使用
`client/src/main.ts` 内で `windmill.innerHTML` への代入が行われていますが、対象は静的な SVG 文字列であるため、現時点では XSS のリスクはありません。ただし、将来的に動的な値を埋め込む変更を行う際は注意が必要です。

---

以上、特に **項目2（Resource Starvation）** はシステムの可用性を損なう重大な欠陥であるため、早急な修正を推奨します。
