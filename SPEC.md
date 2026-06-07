# だこくん - 開発仕様書

最終更新: 2026-05-09

---

## プロジェクト概要

| 項目 | 内容 |
|---|---|
| システム名 | だこくん |
| 目的 | 中小企業向けのシンプルな Web 勤怠管理システム |
| 対象ユーザー | 従業員・上司・管理者 |

### 技術スタック

| 種類 | 技術 |
|---|---|
| フロントエンド | React 19 + TypeScript |
| ビルドツール | Vite |
| バックエンド | Firebase（Authentication + Firestore） |
| ルーティング | React Router DOM v7 |
| 日付操作 | dayjs |

---

## ユーザーロール

登録したユーザーには以下の3種類のロールがある。
初めて登録したユーザーは自動的に `admin` になる。以降は `employee` がデフォルト。

| ロール | 説明 |
|---|---|
| `admin` | 管理者。全従業員の勤怠確認・CSV出力が可能 |
| `supervisor` | 上司。担当する部下の申請を承認・却下できる |
| `employee` | 一般従業員。打刻・申請のみ可能 |

### ロール別権限一覧

| 機能 | employee | supervisor | admin |
|---|---|---|---|
| 出勤・退勤打刻 | ✅ | ✅ | ✅ |
| 打刻修正申請 | ✅ | ✅ | ✅ |
| 残業申請 | ✅ | ✅ | ✅ |
| 通知確認 | ✅ | ✅ | ✅ |
| プロフィール編集 | ✅ | ✅ | ✅ |
| 部下の勤怠確認 | ❌ | ✅ | ❌ |
| 申請の承認・却下 | ❌ | ✅ | ❌ |
| 全従業員の勤怠確認 | ❌ | ❌ | ✅ |
| CSV出力 | ❌ | ❌ | ✅ |

---

## 画面一覧

### 認証系（未ログインでもアクセス可）

#### `/login` ログイン画面
- メールアドレス・パスワードでのログイン
- パスワード忘れリンク
- 新規登録リンク

#### `/signup` 新規登録画面
- 名前・メールアドレス・パスワードで登録
- バリデーション：メール形式チェック、パスワード6文字以上、全項目必須
- 登録後は自動的にダッシュボードへ遷移

#### `/forgot-password` パスワード再設定画面
- メールアドレスを入力するとリセットメール送信
- セキュリティ対策：成功・失敗で同じメッセージを表示（アカウント存在有無を外部に漏らさない）

---

### 認証済みのみアクセス可

#### `/` ダッシュボード（全ロール共通）
- リアルタイムデジタル時計（HH:mm:ss）
- 出勤・退勤ボタン
- 本日の打刻時刻表示

**employee / admin のみ表示**
- 打刻修正申請モーダル（日付・修正後時刻 HH:MM・理由）
- 残業申請モーダル（日付・残業時間 HH:MM・理由）

**supervisor のみ表示**
- 部下の勤怠履歴テーブル ⚠️ 現在ダミーデータ
- 部下の申請一覧・承認/却下ボタン ✅ 実装済み

**admin のみ表示**
- 全従業員の勤怠管理テーブル ✅ 実装済み
- CSV出力ボタン（ファイル名：`attendances_YYYY-MM-DD.csv`）

#### `/profile` プロフィール画面
- メールアドレス表示（読み取り専用）
- 名前の編集・保存

---

## Firestore コレクション構造

### `users`
```
{
  uid: string,           // Firebase Authentication UID（ドキュメントID）
  email: string,
  name: string,
  role: 'admin' | 'supervisor' | 'employee',
  supervisorId?: string, // 上司の UID（employee のみ）
  createdAt: Timestamp
}
```

### `attendances`
```
{
  userId: string,
  userName: string,
  date: string,          // YYYY-MM-DD
  clockIn: Timestamp,
  clockOut: Timestamp | null
}
```

### `requests`
```
{
  userId: string,
  userName: string,
  supervisorId: string,
  type: '打刻修正' | '残業申請',
  date: string,          // 対象日付 YYYY-MM-DD
  requestedTime: string, // HH:MM 形式
  reason: string,        // 最大500文字
  status: 'pending' | 'approved' | 'denied',
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### `notifications`
```
{
  recipientId: string,       // 受信者の UID
  title: string,
  message: string,
  type: 'request' | 'approval' | 'system',
  relatedRequestId?: string, // 関連する申請の ID
  isRead: boolean,
  createdAt: Timestamp
}
```

---

## セキュリティ

### Firestore Security Rules（`firestore.rules`）

| コレクション | 読み取り | 書き込み |
|---|---|---|
| `users` | 自分 or admin | 自分（名前のみ）or admin |
| `attendances` | 自分 or admin or 担当 supervisor | 自分の userId でのみ作成。自分の clockOut のみ更新可 |
| `requests` | 自分 or 担当 supervisorId or admin | 自分の userId でのみ作成。supervisor/admin のみ status 更新可 |
| `notifications` | 自分の recipientId のみ | ログイン済みなら作成可。自分の isRead のみ更新可 |

デプロイコマンド：
```bash
firebase deploy --only firestore:rules
```

---

## 未実装・課題

| # | 内容 | 優先度 |
|---|---|---|
| 1 | ~~supervisor 向け「部下の勤怠履歴」が実データ未取得（ダミー表示）~~ ✅ 実装済み | 高 |
| 2 | ~~employee 向け「自分の申請履歴確認画面」が未実装~~ ✅ 実装済み（ダッシュボード内に統合） | 中 |
| 3 | ~~supervisor のロール割り当て手順が未整備~~ ✅ 実装済み（admin ダッシュボードのユーザー管理テーブルでドロップダウン変更可） | 中 |
| 4 | ~~パスワード最小文字数が6文字~~ ✅ 8文字に変更（OWASP 推奨は12文字以上） | 低 |
| 5 | ~~supervisor 自身の申請送信 UI が非表示~~ ✅ 全ロール共通で申請可能に変更 | 低 |
