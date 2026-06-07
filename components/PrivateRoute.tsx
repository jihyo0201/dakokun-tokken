// components/PrivateRoute.tsx
import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';

export const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    // 認証状態の判定中はローディング画面
    return <div>Loading...</div>;
  }

  if (!user) {
    // 未ログインならログイン画面へ
    return <Navigate to="/login" replace />;
  }

  // ログイン済みなら子要素を表示
  return <>{children}</>;
};
