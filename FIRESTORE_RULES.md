# Firestore Security Rules 解説

このファイルは `firestore.rules` の内容を日本語で解説したものです。

---

## そもそも Firestore Rules とは？

Firestore はデータベースです。だこくんのデータ（打刻記録・申請・通知など）がすべてここに保存されています。

**Rules がないと何が起きるか？**
誰でも（ログインしていない人も含めて）、全員のデータを読んだり書いたりできてしまいます。

**Rules とは**、「誰が・何を・できる/できない」をサーバー側で強制するルールです。フロントエンド（React）のコードをいくら頑張って書いても、Rules がなければブラウザの開発者ツールから直接データを盗んだり改ざんしたりできます。

---

## 基本の読み方

```
allow 操作: if 条件;
```

- **操作**: `read`（読む）/ `create`（新規作成）/ `update`（更新）/ `delete`（削除）
- **条件**: `true` ならOK、`false` ならエラーで拒否される

---

## ヘルパー関数（共通パーツ）

```js
function isAuthenticated() {
  return request.auth != null;
}
```
→ ログイン済みかどうかを確認する関数。`request.auth` にログイン中のユーザー情報が入っている。

```js
function getMyRole() {
  return get(/databases/.../users/$(request.auth.uid)).data.role;
}
```
→ Firestore の `users` コレクションから、自分のロール（`admin` / `supervisor` / `employee`）を取ってくる関数。

```js
function isAdmin()      { ... }  // ログイン済み かつ role == 'admin'
function isSupervisor() { ... }  // ログイン済み かつ role == 'supervisor'
```

---

## コレクションごとのルール詳細

### 1. `users`（ユーザー情報）

```js
match /users/{userId} {
  allow read:   if ログイン済み && (自分のデータ || admin);
  allow create: if ログイン済み && 自分のUIDで作成;
  allow update: if ログイン済み && (自分の名前だけ変更 || admin);
  allow delete: if admin;
}
```

| 操作 | できる人 | 条件 |
|---|---|---|
| 読む | 自分 or admin | |
| 作る | 自分のアカウント | 登録時のみ。他人のデータは作れない |
| 更新 | 自分（名前のみ）or admin | 自分でロールを変えることはできない |
| 削除 | admin のみ | |

**なぜ「名前だけ」に制限しているか？**
`diff(resource.data).affectedKeys().hasOnly(['name'])` という条件が、「変更されたフィールドが name だけ」であることを確認しています。これにより、自分で自分の `role` を `admin` に書き換えるような不正ができません。

---

### 2. `attendances`（打刻記録）

```js
match /attendances/{attendanceId} {
  allow read:   if ログイン済み && (自分のデータ || admin || 担当supervisorが読む);
  allow create: if ログイン済み && userId == 自分のUID;
  allow update: if ログイン済み && 自分のデータ && clockOutだけ変更;
  allow delete: if admin;
}
```

| 操作 | できる人 | 条件 |
|---|---|---|
| 読む | 自分 or admin or 担当 supervisor | supervisor は自分が担当する部下のデータのみ |
| 作る | 自分 | `userId` フィールドが自分の UID のみ。他人の打刻は作れない |
| 更新 | 自分 | `clockOut`（退勤時刻）フィールドのみ変更可 |
| 削除 | admin のみ | |

**supervisor の条件の詳細:**
```
isSupervisor()
&& 対象ユーザーのドキュメントが存在する  ← exists() チェック
&& その人の supervisorId が自分のUID
```
`exists()` がないと、対象ユーザーが存在しない場合にエラーになってしまうため追加しています。

---

### 3. `notifications`（通知）

```js
match /notifications/{notificationId} {
  allow read:   if ログイン済み && recipientId == 自分のUID;
  allow create: if ログイン済み && 必須フィールドあり && 送信先ユーザーが存在する;
  allow update: if ログイン済み && 自分宛 && isRead だけ変更;
  allow delete: if ログイン済み && 自分宛;
}
```

| 操作 | できる人 | 条件 |
|---|---|---|
| 読む | 自分宛の通知のみ | |
| 作る | ログイン済みユーザー | 送信先が実在するユーザーであること |
| 更新 | 自分 | `isRead`（既読フラグ）のみ変更可 |
| 削除 | 自分 | 自分宛の通知のみ |

**create の条件の詳細:**
```
必須フィールド: recipientId, title, message, isRead, createdAt
送信先ユーザーが Firestore に存在する（架空のUIDへの通知送信を防ぐ）
```
これにより、存在しない宛先への通知スパムや、適当な内容の通知送信を防いでいます。

---

### 4. `requests`（申請）

```js
match /requests/{requestId} {
  allow read:   if ログイン済み && (自分の申請 || 自分が担当supervisor || admin);
  allow create: if ログイン済み && userId == 自分のUID;
  allow update: if ログイン済み && (担当supervisor || admin)
                  && status と updatedAt だけ変更
                  && 現在の status が 'pending'
                  && 新しい status が 'approved' または 'denied';
  allow delete: if admin;
}
```

| 操作 | できる人 | 条件 |
|---|---|---|
| 読む | 申請者本人 or 担当 supervisor or admin | |
| 作る | 申請者本人 | `userId` が自分のUIDのみ |
| 更新（承認・却下） | 担当 supervisor or admin | 厳密な条件あり（下記） |
| 削除 | admin のみ | |

**update の厳密な条件（セキュリティのポイント）:**

```
① status と updatedAt フィールドだけ変更できる
② 現在の status が 'pending'（保留中）のときのみ変更できる
③ 新しい status は 'approved' か 'denied' のどちらかのみ
```

これにより以下の不正が防げます：
- 一度承認した申請を再度却下する（② で防止）
- status に `'hacked'` のような任意の文字列を入れる（③ で防止）
- status 以外のフィールド（申請内容など）を書き換える（① で防止）

---

## よくある疑問

**Q. フロントエンド（React）のコードで権限チェックしてるのに、Rules も必要？**

必要です。フロントエンドのチェックは「見た目の制御」にすぎません。ブラウザの開発者ツールを使えば JavaScript のコードを無視して、直接 Firestore に読み書きリクエストを送ることができます。Rules はサーバー側（Firestore 本体）で強制されるため、どんな手段でアクセスしても必ず通過します。

**Q. Rules の変更はどうやって反映する？**

```bash
firebase deploy --only firestore:rules
```

このコマンドを実行するまで、ローカルの `firestore.rules` を変更しても本番には反映されません。

**Q. テストはどうする？**

Firebase Emulator を使うとローカルでルールをテストできます（別途設定が必要）。
