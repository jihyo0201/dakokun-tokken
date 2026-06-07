# だこくん - チーム開発ガイド

勤怠管理システム「だこくん」の開発に参加するための手順書です。

---

## 目次

1. [そもそも GitHub って何？](#1-そもそも-github-って何)
2. [最初にやること（初回だけ）](#2-最初にやること初回だけ)
3. [毎日の開発の流れ](#3-毎日の開発の流れ)
4. [コードを書いたら GitHub に送る](#4-コードを書いたら-github-に送る)
5. [仲間の変更を自分のPCに取り込む](#5-仲間の変更を自分の-pc-に取り込む)
6. [よく使うコマンド一覧](#6-よく使うコマンド一覧)
7. [困ったときは](#7-困ったときは)

---

## 1. そもそも GitHub って何？

GitHub は **コードの共有・保存場所** です。

Google ドライブのコード版だと思ってください。

```
自分のPC  ←→  GitHub（クラウド）  ←→  チームメンバーのPC
```

- **push**（プッシュ）= 自分のコードを GitHub にアップロードする
- **pull**（プル）= GitHub の最新コードを自分の PC にダウンロードする
- **commit**（コミット）= 変更を「保存」としてまとめる（メモ付き）

---

## 2. 最初にやること（初回だけ）

### ① Git をインストールする

ターミナルで確認：

```bash
git --version
```

バージョンが表示されれば OK。なければ https://git-scm.com からインストール。

### ② Node.js をインストールする

```bash
node --version
```

`v18` 以上が表示されれば OK。なければ https://nodejs.org からインストール。

### ③ リポジトリをクローンする

「クローン」= GitHub からコードを自分の PC にコピーすること。

```bash
git clone https://github.com/[リポジトリのURL].git
cd dakokun
```

### ④ パッケージをインストールする

```bash
npm install
```

`node_modules` フォルダが作られれば OK。

### ⑤ 環境変数ファイルを作る

Firebase に接続するための設定ファイルが必要です。

```bash
cp .env.example .env.local
```

`.env.local` を開いて、Firebase の値を記入します。
値は **管理者（だこくんの開発リーダー）に聞いてください**。

```
VITE_FIREBASE_API_KEY=ここに値を入れる
VITE_FIREBASE_AUTH_DOMAIN=ここに値を入れる
...
```

> ⚠️ `.env.local` は絶対に GitHub に上げないでください。APIキーが漏れます。

### ⑥ 起動確認

```bash
npm run dev
```

ブラウザで `http://localhost:5173` を開いてログイン画面が出れば成功！

---

## 3. 毎日の開発の流れ

```
① 最新コードを取得する（pull）
        ↓
② ブランチを作る
        ↓
③ コードを書く
        ↓
④ コミットする（commit）
        ↓
⑤ GitHub に送る（push）
        ↓
⑥ プルリクエストを作る
```

---

## 4. コードを書いたら GitHub に送る

### ブランチとは？

ブランチ = **作業用のコピー** です。

`main`（本番）のコードを直接触らず、作業用のブランチを作って、そこで開発します。

```
main（本番） ─────────────────────→
                  ↑
feature/login ───→（完成したら main にマージ）
```

### ① ブランチを作る

```bash
git checkout -b feature/作業内容
```

例：

```bash
git checkout -b feature/add-overtime-request
```

### ② コードを書く

普通にファイルを編集します。

### ③ 変更を確認する

```bash
git status
```

変更したファイルの一覧が表示されます。

### ④ コミットする

変更を「保存」としてまとめます。

```bash
git add .
git commit -m "残業申請フォームを追加"
```

> コミットメッセージは **何をしたか** を日本語で書けば OK。

### ⑤ GitHub に送る（push）

```bash
git push origin feature/add-overtime-request
```

### ⑥ プルリクエスト（PR）を作る

GitHub のページを開くと「Compare & pull request」ボタンが出るのでクリック。

- タイトル：何をしたか
- 説明：なぜしたか、どこを変えたか

送ったら **レビュー依頼** をチームメンバーに送りましょう。

---

## 5. 仲間の変更を自分の PC に取り込む

```bash
git pull origin main
```

**毎日作業を始める前に実行する習慣をつけましょう。**

---

## 6. よく使うコマンド一覧

| コマンド | 意味 |
|---|---|
| `npm run dev` | 開発サーバーを起動 |
| `git status` | 変更ファイルを確認 |
| `git pull origin main` | 最新コードを取得 |
| `git checkout -b feature/xxx` | 新しいブランチを作成 |
| `git add .` | 全変更をステージング |
| `git commit -m "メッセージ"` | コミット（保存） |
| `git push origin ブランチ名` | GitHub に送る |
| `git branch` | 今どのブランチにいるか確認 |
| `git checkout main` | main ブランチに戻る |

---

## 7. 困ったときは

### 「コンフリクト」が起きた

コンフリクト = 自分の変更と仲間の変更がぶつかった状態。

焦らずに、ファイルを開いて `<<<<<<` と `>>>>>>` の間を確認し、どちらの変更を残すか決めて保存 → コミット。

### 元に戻したい

```bash
# 直前のコミット前の状態に戻す（ファイルの変更は残る）
git reset HEAD~1

# ファイルの変更も全部なかったことにする（要注意！）
git checkout -- .
```

### それでも分からない

管理者に Slack や Discord で聞いてください。

---

## プロジェクト構成（参考）

```
dakokun/
├── pages/          # 各ページのコンポーネント
├── components/     # 共通UIパーツ
├── hooks/          # カスタムフック（useAuth など）
├── firebase/       # Firebase関連の処理
├── App.tsx         # ルーティング設定
└── .env.local      # 環境変数（自分で作成・Git管理外）
```
