# Antigravity様への修正指示書 (Correction Instructions)

本ドキュメントは、現在の `client` コードベースに見られる主要なバグ、UI表示エラー、およびパフォーマンス問題に対する修正指示をまとめたものです。
特に「UIの表示エラー」「モグラ叩きのようなバグ修正」の原因となっている **競合状態 (Race Condition)** について詳述しています。

## 1. 【緊急】「ゴースト画像」問題の修正 (Ghost Images / Race Condition)

### 現象
画像が削除されたはずなのに画面に残る、あるいは `renderQueue` の処理タイミングによって予期しない画像が表示され続ける。これが「UI表示エラー」の主原因です。

### 原因
`processTicker` と `checkEviction` (または `removeImageFromGallery`) の間で競合状態が発生しています。
1. `addImageToGallery` が画像を `renderQueue` と `imageStore` に追加する。
2. 描画 (`processTicker`) が走る前に、`checkEviction` 等によりその画像が `imageStore` から削除される。
3. しかし、`renderQueue` には残っているため、その後 `processTicker` が実行された際に **「削除済みの画像」をDOMに追加してしまう**。
4. この画像は `imageStore` に存在しないため、二度と削除されず（管理外）、メモリリークと表示崩れを引き起こす。

### 修正指示 (`client/src/main.ts`)

`processTicker` 関数内で、DOMに追加する前に **「その画像が現在も有効か（imageStoreに存在するか）」** を確認するガード節を追加してください。

```typescript
// client/src/main.ts

function processTicker() {
  if (tickerTimeout) clearTimeout(tickerTimeout);

  if (!isPaused && renderQueue.length > 0) {
    const nextItem = renderQueue.shift()!;

    // --- 修正: 追加 ---
    // imageStoreに存在しない（既に削除/Evictされた）アイテムは描画しない
    const exists = imageStore.some(i => i.id === nextItem.id);
    if (!exists) {
      console.log(`[Ticker] Skipped evicted item: ${nextItem.id}`);
      // 再帰呼び出しへ
      tickerTimeout = setTimeout(processTicker, 0);
      return;
    }
    // ----------------

    gallery.appendChild(nextItem.element);
    updateBufferUI();
    updateDecayUI();
  }

  tickerTimeout = setTimeout(processTicker, renderInterval);
}
```

## 2. 【UI】Z-Index 重なり問題の修正

### 現象
「人気のある画像（Holderが多い）」の隣にある画像にカーソルを合わせても、クリックやホバーが効かない、あるいは拡大時に他の画像の下に潜り込んでしまう。

### 原因
`updateHolderUI` で人気画像の `z-index` を `5` に固定していますが、隣接する画像のホバー時の `z-index` 制御が CSS で明示されていないため、DOMの並び順によっては隠れてしまいます。

### 修正指示 (`client/src/style.css`)

ホバー時は無条件で最前面に来るように `!important` を付与して指定してください。

```css
/* client/src/style.css */

.gallery-item:hover {
  transform: translateY(-5px) scale(1.02);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  /* --- 修正: 追加 --- */
  z-index: 100 !important;
  /* ---------------- */
}
```

## 3. 【パフォーマンス】画面ログ出力の最適化

### 現象
ファイル転送中や大量の画像同期中にブラウザが重くなる。

### 原因
`console.log` をオーバーライドして画面上の `#debug-log` にDOM要素を追加している処理 (`logToScreen`) が、すべてのログ出力（進捗表示含む）で同期的に実行されており、大量の Layout Thrashing（再描画負荷）を発生させています。

### 修正指示 (`client/src/main.ts`)

通常の `console.log`（Infoレベル）は画面に出さない、あるいは `console.error` / `console.warn` のみに限定することを推奨します。

```typescript
// client/src/main.ts

console.log = (...args) => {
  originalLog(...args);
  // Infoログは画面に出さない（パフォーマンス改善）
  // logToScreen(...); <--- コメントアウトまたは削除
};

console.warn = (...args) => {
  originalWarn(...args);
  logToScreen(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), '#ff0');
};

console.error = (...args) => {
  originalError(...args);
  logToScreen(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), '#f00');
};
```

## 4. その他 コード品質向上のための推奨事項

*   **HTML生成の安全性**: `innerHTML` を使用している箇所がありますが、XSSのリスクがあるため、可能な限り `createElement` と `appendChild` を使用するか、サニタイズを行ってください。
*   **マジックナンバーの排除**: `renderInterval` や `MAX_IMAGES` などの定数は設定ファイルまたは定数定義として分離し、管理しやすくしてください。

以上、速やかに修正をお願いいたします。
