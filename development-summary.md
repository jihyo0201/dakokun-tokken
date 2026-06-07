最終更新: 2026-05-19

---

## プロジェクト概要

| 項目 | 内容 |
| --- | --- |
| システム名 | だこくん |
| 目的 | 中小企業向けのシンプルな Web 勤怠管理システム |
| 対象ユーザー | 従業員・上司・管理者 |

### 技術スタック

| 種類 | 技術 |
| --- | --- |
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
| --- | --- |
| `admin` | 管理者。全従業員の勤怠確認・CSV出力・ユーザー管理が可能 |
| `supervisor` | 上司。担当する部下の勤怠確認・申請の承認/却下ができる |
| `employee` | 一般従業員。打刻・申請のみ可能 |

### ロール別権限一覧

| 機能 | employee | supervisor | admin |
| --- | --- | --- | --- |
| 出勤・退勤打刻 | ✅ | ✅ | ✅ |
| 出退勤履歴の確認 | ✅ | ✅ | ✅ |
| 打刻修正申請（出退勤履歴ページから） | ✅ | ✅ | ✅ |
| 残業申請 | ✅ | ✅ | ✅ |
| 申請履歴の確認 | ✅ | ✅ | ✅ |
| 通知確認 | ✅ | ✅ | ✅ |
| プロフィール編集 | ✅ | ✅ | ✅ |
| 部下の勤怠確認 | ❌ | ✅ | ❌ |
| 申請の承認・却下（承認ページ） | ❌ | ✅ | ✅ |
| 承認時の打刻データ自動修正 | ❌ | ✅ | ✅ |
| 全従業員の勤怠確認 | ❌ | ❌ | ✅ |
| CSV出力 | ❌ | ❌ | ✅ |
| ユーザー管理（ロール変更・上長割り当て） | ❌ | ❌ | ✅ |

---

## 画面一覧

### 認証系（未ログインでもアクセス可）

#### `/login` ログイン画面

- メールアドレス・パスワードでのログイン
- パスワード忘れリンク
- 新規登録リンク

#### `/signup` 新規登録画面

- 名前・メールアドレス・パスワードで登録
- バリデーション：メール形式チェック、パスワード8文字以上、全項目必須
- 登録後は自動的にダッシュボードへ遷移
- Firestore にユーザードキュメントが確実に作成される（race condition 対策済み）

#### `/forgot-password` パスワード再設定画面

- メールアドレスを入力するとリセットメール送信
- セキュリティ対策：成功・失敗で同じメッセージを表示（アカウント存在有無を外部に漏らさない）

---

### 認証済みのみアクセス可

#### `/` ダッシュボード（全ロール共通）

- リアルタイムデジタル時計（HH:mm:ss）
- 出勤・退勤ボタン
- 残業申請ボタン → モーダル（日付・残業時間・理由）
- ナビゲーションカード：
  - 「申請履歴」→ `/requests`
  - 「出退勤履歴」→ `/attendances`
  - 「申請承認」→ `/approvals`（admin / supervisor のみ表示）

**supervisor のみ表示**

- 部下の勤怠履歴テーブル ✅ 実装済み（実データ取得）
- 部下の申請一覧・承認/却下ボタン ✅ 実装済み

**admin のみ表示**

- 全従業員の勤怠管理テーブル ✅ 実装済み
- CSV出力ボタン（ファイル名：`attendances_YYYY-MM-DD.csv`）
- ユーザー管理テーブル ✅ 実装済み
  - ロール変更（employee / supervisor / admin）
  - 上長（supervisorId）割り当て（employee に対して supervisor/admin を選択）

#### `/requests` 申請履歴ページ

- 自分が送信した申請の一覧表示（全ロール共通）
- 申請日付・種別・時刻・理由・ステータス（保留中/承認済み/却下済み）

#### `/attendances` 出退勤履歴ページ

- 自分の出退勤記録の一覧表示（全ロール共通）
- 日付・出勤時刻・退勤時刻・労働時間
- 各レコードの出勤・退勤時刻の横に「修正」ボタン
  - クリックでモーダルが開き、対象日・対象（出勤/退勤）が自動セット
  - 修正後の時刻（HH:MM）と理由を入力して打刻修正申請を送信

#### `/approvals` 申請承認ページ（admin / supervisor のみ）

- 「未処理の申請」セクション：承認/却下ボタン付き、件数バッジ表示
- 「処理済みの申請」セクション：承認・却下の履歴一覧
- admin は全申請、supervisor は自分の部下の申請のみ表示
- 承認時に打刻修正の場合、勤怠データが自動修正される
- 処理結果のフィードバックメッセージ表示（成功/エラー）

#### `/profile` プロフィール画面

- メールアドレス表示（読み取り専用）
- 名前の編集・保存

---

## Firestore コレクション構造

### `users`

```
{
  uid: string,
  email: string,
  name: string,
  role: 'admin' | 'supervisor' | 'employee',
  supervisorId?: string,
  createdAt: Timestamp
}
```

### `attendances`

```
{
  userId: string,
  userName: string,
  date: string,          // "YYYY-MM-DD"
  clockIn: Timestamp | null,
  clockOut: Timestamp | null,
  status?: 'Corrected'   // 打刻修正が反映された場合
}
```

### `requests`

```
{
  userId: string,
  userName: string,
  supervisorId: string,
  type: '打刻修正（出勤）' | '打刻修正（退勤）' | '残業申請',
  date: string,           // "YYYY-MM-DD"
  requestedTime: string,  // "HH:MM"
  reason: string,
  status: 'pending' | 'approved' | 'denied',
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### `notifications`

```
{
  recipientId: string,
  title: string,
  message: string,
  type: 'request' | 'approval' | 'system',
  relatedRequestId?: string,
  isRead: boolean,
  createdAt: Timestamp
}
```

---

## 打刻修正フロー

```
従業員: 出退勤履歴ページで対象の「修正」ボタンをクリック
    ↓
モーダルで修正後の時刻と理由を入力 → 申請送信
    ↓
上長/管理者に通知が届く
    ↓
上長/管理者: 承認ページ（/approvals）で承認ボタンをクリック
    ↓
① 対象日の勤怠データの出勤/退勤時刻が自動修正（status: "Corrected"）
② 申請ステータスを「承認済み」に更新
③ 従業員に「承認されました」通知を送信
```

---

## セキュリティ

### Firestore Security Rules

| コレクション | 読み取り | 書き込み |
| --- | --- | --- |
| `users` | 自分 or admin | 自分（名前のみ）or admin |
| `attendances` | 自分 or admin or 担当 supervisor | 作成: 自分 or admin or supervisor。更新: 自分の clockOut のみ / admin は全件 / supervisor は部下のみ |
| `requests` | 自分 or 担当 supervisorId or admin | 自分の userId でのみ作成。supervisor/admin のみ status・updatedAt 更新可（pending → approved/denied） |
| `notifications` | 自分の recipientId のみ | ログイン済みかつ送信先実在確認済みなら作成可。自分の isRead のみ更新可 |

デプロイコマンド：

```bash
firebase deploy --only firestore:rules
```

---

## 2026-05-19 の開発内容

| # | 内容 | 状態 |
| --- | --- | --- |
| 1 | employee の出退勤履歴ページ（`/attendances`）を新規作成 | ✅ |
| 2 | 申請履歴ページ（`/requests`）を新規作成 | ✅ |
| 3 | 申請承認ページ（`/approvals`）を新規作成（admin/supervisor 用） | ✅ |
| 4 | admin ユーザー管理に上長（supervisorId）割り当てUIを追加 | ✅ |
| 5 | 打刻修正を出退勤履歴の各レコード横の「修正」ボタンから申請する形に変更 | ✅ |
| 6 | 打刻修正申請に出勤/退勤の区別を追加（`打刻修正（出勤）` / `打刻修正（退勤）`） | ✅ |
| 7 | 承認時に勤怠データへ自動反映する機能を実装 | ✅ |
| 8 | 新規登録時の Firestore ドキュメント未作成バグを修正（race condition 対策） | ✅ |
| 9 | ログイン時に Firestore ドキュメントがなければ自動作成する救済処理を追加 | ✅ |
| 10 | `getAllUsers` が `createdAt` のないドキュメントを除外するバグを修正 | ✅ |
| 11 | Firestore 複合インデックス不要化（通知・出退勤のクエリをクライアント側ソートに変更） | ✅ |
| 12 | Firestore セキュリティルール更新（admin/supervisor による打刻修正を許可） | ✅ |
| 13 | ダッシュボードの「本日の打刻」ボックスを削除 | ✅ |

---

## 未実装・課題

| # | 内容 | 優先度 |
| --- | --- | --- |
| 1 | パスワード最小文字数が8文字（OWASP 推奨は12文字以上） | 低 |
| 2 | デモ用テストアカウントの作成 | 中 |
| 3 | 不明な技術用語・手順を Notion にまとめる | 中 |
