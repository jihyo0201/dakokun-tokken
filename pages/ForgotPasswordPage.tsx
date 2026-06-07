import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { resetPassword } from '../firebase/auth';
import { OctopusLogo } from '../components/Icons';

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);
    try {
      await resetPassword(email.trim());
    } catch (err: any) {
      // エラー内容に関わらず同じメッセージを表示（メール存在有無を外部に漏らさない）
    } finally {
      // 成功・失敗どちらでも同じメッセージを表示
      setMessage('入力したメールアドレスに登録があった場合、リセット用メールを送信しました。');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        <div className="flex flex-col items-center space-y-2">
          <OctopusLogo className="w-16 h-16 text-primary" />
          <h1 className="text-2xl font-bold text-center text-gray-900">パスワードの再設定</h1>
          <p className="text-sm text-gray-500 text-center">登録済みのメールアドレスを入力してください</p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
            placeholder="メールアドレス"
          />
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          {message && <p className="text-sm text-green-600 text-center">{message}</p>}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-primary rounded-md shadow-sm hover:bg-primary-dark disabled:bg-gray-400"
          >
            {isLoading ? '送信中...' : 'リセットメールを送信'}
          </button>
        </form>
        <p className="text-sm text-center text-gray-600">
          <Link to="/login" className="font-medium text-primary hover:text-primary-dark">
            ログインに戻る
          </Link>
        </p>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
