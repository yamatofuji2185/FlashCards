# FlashCard PWA（オフライン優先）

このリポジトリは、スマートフォン向けフラッシュカードアプリのスターター実装です。

- フロントエンド: Vanilla JS のPWA（Service Worker + Web App Manifest）
- ローカル保存: IndexedDB（カード本体）、LocalStorage（設定・同期待ちキュー）
- バックエンド: Google Apps Script Web API（doGet / doPost）
- マスターデータ: Google スプレッドシート

## 構成ファイル

- index.html: 画面レイアウトと学習画面
- styles.css: スマホ優先スタイルとカード反転アニメーション
- js/app.js: 起動処理、イベント処理、同期の入口
- js/db.js: IndexedDB操作（読み書き、トランザクション置換）
- js/storage.js: LocalStorage（設定・同期待ちキュー）
- js/sync.js: ダウンロード同期、アップロード同期、画像プリフェッチ
- js/api.js: GAS API通信用クライアント
- sw.js: オフラインキャッシュ戦略
- manifest.json: PWAインストール設定
- gas/Code.gs: Apps Script側APIとGemini補助機能

## スプレッドシート定義

Cards という名前のシートを作成し、1行目ヘッダーを次の順で配置してください。

1. id
2. categoryL1
3. categoryL2
4. categoryL3
5. question
6. answer
7. description
8. imageId
9. status

任意で AppConfig シートを作ると、Gemini管理メニューで難易度条件を使えます。

- A列: key
- B列: value
- 使用キー: targetGrade, difficulty

例:

- targetGrade | grade4
- difficulty | basic

## GASデプロイ手順

1. スプレッドシートを開き、拡張機能 -> Apps Script を開く。
2. gas/Code.gs の内容を貼り付ける。
3. 教材自動生成を使う場合は、スクリプトプロパティに GEMINI_API_KEY を登録する。
4. ウェブアプリとしてデプロイする。
   - 実行ユーザー: 自分
   - アクセス権: 必要な範囲で設定（例: リンクを知っている全員）
5. デプロイURLをコピーし、PWA側の Connection に設定する。

## フロントエンド公開

このディレクトリをHTTPSで配信してください（GitHub Pages / Netlify / Vercel など）。

## 同期フロー

- ダウンロード同期（クラウド -> ローカル）: オンライン時に Sync ボタン
- アップロード同期（ローカル -> クラウド）:
  - online イベント発生時にキューがあれば自動送信
  - Sync ボタンでも手動送信

キュー1件のデータ形式:

```json
{
  "id": "card-id",
  "status": "remembered",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

## 注意点 / 制約

- manifest.json のアイコンは現状SVGです。ストア審査や厳密運用ではPNGに差し替えてください。
- applyStatusUpdates_ は理解しやすさ優先で1行ずつ setValue しています。大量更新時は一括書き込み最適化を推奨します。
- 公開運用する場合は、GASに認証・認可の仕組みを必ず追加してください。
