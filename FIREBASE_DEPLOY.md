# Firebase デプロイ手順書

## Firestore Rules とは

`firestore.rules` はデータベースの「鍵」です。
ローカルで書いても、**Firebase に送信しないと本番には反映されません。**

```
ローカルで編集 → firebase deploy → Firebase 本番サーバーに反映
```

---

## 初回セットアップ

### 1. firebase-tools をインストール

```bash
npm install -g firebase-tools
```

確認：
```bash
firebase --version
```

### 2. Firebase にログイン

通常環境（Terminal.app）：
```bash
firebase login
```

Claude Code などの非インタラクティブ環境：
```bash
firebase login --no-localhost
```

→ 表示された URL をブラウザで開く
→ Google アカウントでログイン
→ 表示されたコードをターミナルに貼り付けてEnter

### 3. ログイン確認

```bash
firebase login:list
```

---

## Firestore Rules をデプロイする

### 毎回の手順

```bash
cd /Users/shuto/Projects/dakokun
firebase deploy --only firestore:rules --project dakokun-system-v2
```

成功すると以下が表示される：
```
✔  firestore: released rules firestore.rules to cloud.firestore
✔  Deploy complete!
```

---

## トラブルシューティング

### 401 エラーが出る
→ 認証トークンが切れている。ログインし直す：
```bash
firebase logout
firebase login --no-localhost
```

### `firebase use` でエラーが出る
→ `--project` オプションで直接指定する：
```bash
firebase deploy --only firestore:rules --project dakokun-system-v2
```

### `projects:list` でエラーが出る
→ ネットワークや権限の一時的な問題の場合がある。`--project` を直接指定してデプロイを試みる。

---

## プロジェクト情報

| 項目 | 値 |
|---|---|
| プロジェクトID | `dakokun-system-v2` |
| ログインアカウント | `naetoru0219@gmail.com` |
| Firebase コンソール | https://console.firebase.google.com/project/dakokun-system-v2/overview |

---

## rules を変更したときの流れ

1. `firestore.rules` を編集
2. `git add firestore.rules && git commit && git push`（GitHub に保存）
3. `firebase deploy --only firestore:rules --project dakokun-system-v2`（本番に反映）
