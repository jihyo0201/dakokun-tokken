import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const SignUpPage: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { user, isLoading, signup: signUpUser } = useAuth();
  const navigate = useNavigate();

  // userがセットされたら自動でダッシュボードへ遷移
  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim();
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!name || !trimmedEmail || !password) {
      setError('すべての項目を入力してください。');
      return;
    }
    if (!emailRegex.test(trimmedEmail)) {
      setError('正しいメールアドレスを入力してください。');
      return;
    }
    if (password.length < 8) {
      setError('パスワードは8文字以上で入力してください。');
      return;
    }

    try {
      await signUpUser(trimmedEmail, password, name);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('このメールアドレスは既に登録されています。');
      } else if (err.code === 'auth/invalid-email') {
        setError('正しいメールアドレスを入力してください。');
      } else {
        setError('サインアップに失敗しました。もう一度お試しください。');
      }
      if (import.meta.env.DEV) console.error('signUpUser error:', err);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center text-gray-900">新規アカウント登録</h2>
        <form className="space-y-6" onSubmit={handleSignUp}>
          <div>
            <label htmlFor="name" className="text-sm font-medium text-gray-700">名前</label>
            <input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm" placeholder="山田 太郎" />
          </div>
          <div>
            <label htmlFor="email" className="text-sm font-medium text-gray-700">メールアドレス</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm" placeholder="email@example.com" />
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-medium text-gray-700">パスワード</label>
            <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm" placeholder="8文字以上" />
          </div>
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <div>
            <button type="submit" disabled={isLoading} className="w-full px-4 py-2 text-sm font-medium text-white bg-primary rounded-md shadow-sm hover:bg-primary-dark disabled:bg-gray-400">
              {isLoading ? '登録中...' : '登録する'}
            </button>
          </div>
        </form>
        <p className="text-sm text-center text-gray-600">
          アカウントをお持ちですか？{' '}
          <Link to="/login" className="font-medium text-primary hover:text-primary-dark">
            ログインはこちら
          </Link>
        </p>
      </div>
    </div>
  );
};

export default SignUpPage;