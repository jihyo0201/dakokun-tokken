# CHANGELOG

変更があるたびにここに追記する。
形式: `[YYYY-MM-DD] カテゴリ: 内容`

---

## [2026-05-19]

### Added
- `pages/AttendanceHistoryPage.tsx`：出退勤履歴ページを新規作成（`/attendances`）
  - 自分の出退勤記録の一覧表示（全ロール共通）
  - 各レコードの出勤・退勤時刻の横に「修正」ボタンを設置
  - ボタンから直接打刻修正申請モーダルを開ける（対象日・出勤/退勤が自動セット）
- `pages/RequestHistoryPage.tsx`：申請履歴ページを新規作成（`/requests`）
- `pages/ApprovalPage.tsx`：申請承認ページを新規作成（`/approvals`、admin/supervisor 用）
  - 「未処理の申請」セクション（承認/却下ボタン・件数バッジ）
  - 「処理済みの申請」セクション（履歴一覧）
  - 処理結果のフィードバックメッセージ表示（成功/エラー）
- `firebase/attendance.ts`：`getAttendancesByUser` 関数追加（自分の出退勤履歴取得）
- `firebase/attendance.ts`：`getAllRequests` 関数追加（admin 用全申請取得）
- `firebase/attendance.ts`：`applyClockCorrection` 関数追加（承認時に勤怠データを自動修正）
- `firebase/auth.ts`：`updateUserSupervisor` 関数追加（admin が上長を割り当て）
- `pages/DashboardPage.tsx`：admin ユーザー管理テーブルに「上長」列を追加（employee に supervisor/admin を割り当て可能）
- `pages/DashboardPage.tsx`：申請履歴・出退勤履歴・申請承認ページへのナビゲーションカードを追加
- `hooks/useAuth.tsx`：ログイン時に Firestore ドキュメントがなければ自動作成する救済処理を追加

### Changed
- `pages/DashboardPage.tsx`：打刻修正申請を出退勤履歴ページの「修正」ボタンに移動（ダッシュボードは残業申請のみ）
- `pages/DashboardPage.tsx`：「本日の打刻」ボックスを削除
- `firebase/attendance.ts`：`getNotificationsByUser` の `orderBy` を削除しクライアント側ソートに変更（Firestore 複合インデックス不要化）
- `firebase/auth.ts`：`getAllUsers` の `orderBy` を削除しクライアント側ソートに変更（`createdAt` がないドキュメントが除外されるバグを修正）

### Fixed
- 新規登録時の race condition を修正（`createUserWithEmailAndPassword` 後に `getDocs` が失敗すると `setDoc` がスキップされ Firestore ドキュメントが作成されない問題）
- `getAllUsers` が `createdAt` フィールドのないユーザーを表示しない問題を修正
- `hooks/useAuth.tsx`：signup 完了後に Firestore からユーザーデータを再取得して state を更新するように変更

### Security
- `firestore.rules`：`attendances` の `create` ルールに admin/supervisor を追加（打刻修正承認時の新規作成を許可）
- `firestore.rules`：`attendances` の `update` ルールに admin と担当 supervisor を追加（打刻修正承認時の更新を許可）

---

## [2026-05-09] (5回目)

### Added
- `firebase/auth.ts`：`getAllUsers` 関数追加（全ユーザー一覧取得）
- `firebase/auth.ts`：`updateUserRole` 関数追加（ユーザーのロール変更）
- `pages/DashboardPage.tsx`：admin 向け「ユーザー管理」セクションを追加（全ユーザー一覧・ドロップダウンでロール変更）

### Changed
- `pages/SignUpPage.tsx`：パスワード最小文字数を 6 → 8 文字に変更
- `pages/DashboardPage.tsx`：申請ボタンを supervisor にも表示（全ロール共通化）
- `pages/DashboardPage.tsx`：「自分の申請履歴」を supervisor にも表示（全ロール共通化）

---

## [2026-05-09] (4回目)

### Added
- `pages/DashboardPage.tsx`：employee / admin 向け「自分の申請履歴」テーブルを追加
  - ログイン時に `getRequestsByUser` で自分の申請を取得して表示
  - 申請送信後に自動で履歴を再取得
  - ステータス（保留中 / 承認済み / 却下済み）を色分けして表示

---

## [2026-05-09] (3回目)

### Added
- `firebase/attendance.ts`：`getAttendancesBySubordinates` 関数を追加（`users` コレクションから `supervisorId` が一致する部下を取得し、その勤怠を Firestore から取得）

### Changed
- `pages/DashboardPage.tsx`：supervisor 向け「部下の勤怠履歴」をダミーデータから Firestore 実データに切り替え
- `pages/DashboardPage.tsx`：ダミーデータ（`dummySubordinates` / `dummyAttendance` / `dummyRequests`）を削除

---

## [2026-05-09] (2回目)

### Security
- `vite.config.ts`：`define` ブロックを削除し、GEMINI_API_KEY がビルド成果物に埋め込まれる問題を修正
- `firestore.rules`：`notifications` の create ルールを強化（必須フィールドの存在チェック + 送信先ユーザーの実在確認を追加）
- `firestore.rules`：`requests` の status 更新ルールを強化（`pending` → `approved`/`denied` の遷移のみ許可）
- `firestore.rules`：`attendances` の supervisor 読み取りルールに `exists()` チェックを追加（対象ユーザー不在時のエラーを防止）
- `pages/DashboardPage.tsx`：CSV エクスポート時の CSV インジェクション対策を追加（`escapeCSVField` 関数による先頭文字エスケープ・カンマ/クォートのエスケープ）
- `pages/SignUpPage.tsx`：`console.error` を開発環境のみに制限（本番環境での Firebase エラー詳細の漏洩防止）

---

## [2026-05-09]

### Fix
- `contexts/AuthProvider.tsx` が空になっていたため、`hooks/useAuth` からの再エクスポートに修正
- `pages/SignUpPage.tsx` の構文エラー修正（`const {` が不完全だった）
- `pages/SignUpPage.tsx` の `setIsLoading` が未定義で呼ばれていた問題を修正（`useAuth` が管理するため削除）
- `hooks/useAuth.tsx` の `login` / `signup` で、エラー時に `isLoading` が解除されない問題を修正（`try/finally` 追加）
- `pages/App.tsx`（旧） の `/profile` ルートが PrivateRoute で保護されていなかった問題を修正

### Changed
- Google 認証を削除し、メール/パスワード認証のみに絞った
  - `pages/LoginPage.tsx`：Google ログインボタン削除
  - `hooks/useAuth.tsx`：`loginWithGoogle` 削除
  - `firebase/auth.ts`：`signInWithGoogle` 削除

### Added
- `pages/ForgotPasswordPage.tsx` 新規作成（パスワード再設定画面）
- `firebase/auth.ts` に `resetPassword` 関数追加
- `App.tsx` に `/forgot-password` ルート追加
- `pages/LoginPage.tsx` に「パスワード忘れの方はこちら」リンク追加

### Security
- `firestore.rules` 新規作成（Firestore Security Rules）
  - users / attendances / requests / notifications の読み書き権限をロール別に制限
- `firebase.json` 新規作成（Rules デプロイ設定）
- `pages/ForgotPasswordPage.tsx` のエラーメッセージを一本化（メール列挙攻撃対策）
- `pages/DashboardPage.tsx` の申請フォームに時刻形式（HH:MM）・文字数（500文字以内）バリデーション追加
- `.env.example` 新規作成（チームメンバー向け環境変数テンプレート）

### Docs
- `README.md` を GitHub・チーム開発入門ガイドとして全面更新
- `SPEC.md` 新規作成（開発仕様書・要件定義）
- `CHANGELOG.md` 新規作成（本ファイル）
