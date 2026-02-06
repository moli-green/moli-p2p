# Antigravity様へのセキュリティ修正提案 (Security Fix Proposal)

本ドキュメントは、システム全体のセキュリティ監査結果に基づき、**Identity Spoofing（なりすまし）** および **DoS攻撃** に対する緊急の修正提案をまとめたものです。

## 1. 【緊急】Identity Spoofing（なりすまし）脆弱性の修正

### 現象
現在のシグナリングサーバー (`server/src/main.rs`) は、クライアントから送信されたJSONメッセージを解析せず、そのままルーム内の全員にブロードキャストしています。
悪意のあるクライアントが `{"type": "leave", "senderId": "VICTIM_ID"}` のようなメッセージを送信すると、受信側のクライアントはそのメッセージを信頼し、被害者（VICTIM_ID）との接続を切断してしまいます。これにより、任意のユーザーをネットワークから切断させることが可能です。

### 修正方針
**サーバー側で `senderId` を強制的に上書き（または付与）するアーキテクチャに変更します。**
クライアントが申告する `senderId` を信頼せず、サーバーが管理している `SocketID` (UUID) を信頼できる情報源として使用します。

### 具体的な修正手順

#### A. サーバーサイド (`server/src/main.rs`)

1.  受信した `Message::Text` を一度 JSON パースします。
2.  ペイロード内の `senderId` を、サーバーが生成した `my_id` で強制的に上書きします。
3.  再度 JSON 文字列化してブロードキャストします。

```rust
// server/src/main.rs (修正案)

// 依存関係に追加が必要: serde, serde_json
use serde_json::Value;

// ...

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let my_id = Uuid::new_v4().to_string();
    // ... (省略: ルーム割り当て等) ...

    loop {
        tokio::select! {
            Some(msg) = socket.recv() => {
                if let Ok(Message::Text(text)) = msg {
                    // --- Security Fix: Parse & Overwrite senderId ---
                    let mut json_msg: Value = match serde_json::from_str(&text) {
                        Ok(v) => v,
                        Err(_) => continue, // Invalid JSON ignore
                    };

                    // クライアントからの senderId は無視し、サーバー側で保証されたIDをセットする
                    if let Some(obj) = json_msg.as_object_mut() {
                        obj.insert("senderId".to_string(), Value::String(my_id.clone()));
                    }

                    let safe_payload = json_msg.to_string();
                    // ------------------------------------------------

                    let msg = Arc::new(BroadcastMsg {
                        sender_id: my_id.clone(),
                        payload: safe_payload,
                    });
                    let _ = tx.send(msg);
                } else {
                    break;
                }
            }
            // ...
        }
    }
    // ...
}
```

## 2. 【高】DoS攻撃対策（Rate Limit & Size Limit）

### 現象
メッセージサイズや送信頻度に制限がないため、巨大なペイロードを高速で送信されるとサーバーのリソースが枯渇したり、ルーム内の他のクライアントの処理を停止させたりする恐れがあります。

### 修正方針 (`server/src/main.rs`)

1.  **メッセージサイズ制限**: WebSocketハンドラ内で長すぎるメッセージを拒否します。シグナリングデータは通常数KB以下です。
2.  **レートリミット**: 単純なトークンバケットまたはカウンタを用いて、異常な頻度の送信を遮断します。

```rust
// server/src/main.rs (修正案)

const MAX_MSG_SIZE: usize = 16 * 1024; // 16KB Limit

// ... (Inside handle_socket loop)

Some(msg) = socket.recv() => {
    if let Ok(Message::Text(text)) = msg {
        // 1. Size Limit Check
        if text.len() > MAX_MSG_SIZE {
            // 切断などのペナルティを与えるか、単に無視する
            continue;
        }

        // 2. Simple Rate Limit (例: 1秒に10メッセージまで)
        // (実装省略: トークンバケットなど)

        // ...
    }
}
```

## 3. 【中】機密情報のハードコーディング修正

### 現象
`docker-compose.yml` やコード内に `TURN_SECRET` のデフォルト値が含まれています。

### 修正方針
環境変数 (`.env`) を使用し、リポジトリにコミットしない運用を徹底してください。
`docker-compose.yml` では `${TURN_SECRET:?err}` のように環境変数を必須とする記述に変更することを推奨します。

---

以上の修正を、機能開発と並行して実施することを強く推奨します。
特に **Identity Spoofing** は、P2Pネットワークの根本的な信頼性を損なうため、最優先で対応してください。
