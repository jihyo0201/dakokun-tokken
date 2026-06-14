import React, { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getAllSuggestions, markSuggestionAsRead, deleteSuggestion } from '../firebase/attendance';

const SuggestionBoxPage: React.FC = () => {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const isAdmin = (user as any)?.role === 'admin';

  useEffect(() => {
    if (isAdmin) {
      setListLoading(true);
      getAllSuggestions().then(setSuggestions).finally(() => setListLoading(false));
    }
  }, [isAdmin]);

  // 管理者以外はダッシュボードにリダイレクト
  if (!isAdmin) return <Navigate to="/" />;

  const handleMarkRead = async (id: string) => {
    await markSuggestionAsRead(id);
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, isRead: true } : s));
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('この要望を削除しますか？')) return;
    await deleteSuggestion(id);
    setSuggestions(prev => prev.filter(s => s.id !== id));
  };

  const unreadCount = suggestions.filter(s => !s.isRead).length;

  return (
    <div style={{ maxWidth: 700, margin: '32px auto', padding: '0 16px' }}>
      <div style={{ marginBottom: 18 }}>
        <Link to="/" style={{ color: '#2563eb', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
          &larr; ダッシュボードに戻る
        </Link>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px #0001', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <h2 style={{ fontWeight: 'bold', fontSize: 22, color: '#222', margin: 0 }}>目安箱 — 投稿一覧</h2>
          {unreadCount > 0 && (
            <span style={{ background: '#dc2626', color: '#fff', borderRadius: 10, padding: '2px 10px', fontSize: 13, fontWeight: 700 }}>
              未読 {unreadCount}
            </span>
          )}
        </div>
        {listLoading ? (
          <div style={{ color: '#888', fontSize: 15 }}>読み込み中...</div>
        ) : suggestions.length === 0 ? (
          <div style={{ color: '#888', fontSize: 15 }}>まだ投稿はありません。</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {suggestions.map(s => (
              <div
                key={s.id}
                style={{
                  background: s.isRead ? '#f9fafb' : '#eff6ff',
                  border: s.isRead ? '1px solid #e5e7eb' : '2px solid #93c5fd',
                  borderRadius: 10, padding: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#333' }}>
                      {s.isAnonymous ? '匿名' : s.userName}
                    </span>
                    <span style={{ fontSize: 12, color: '#999', marginLeft: 10 }}>
                      {s.createdAt?.toDate?.().toLocaleString?.() || ''}
                    </span>
                    {!s.isRead && (
                      <span style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600, marginLeft: 8 }}>
                        NEW
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!s.isRead && (
                      <button
                        onClick={() => handleMarkRead(s.id)}
                        style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 8px', fontSize: 12, color: '#6b7280', cursor: 'pointer' }}
                      >
                        既読
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(s.id)}
                      style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 4, padding: '2px 8px', fontSize: 12, color: '#dc2626', cursor: 'pointer' }}
                    >
                      削除
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 15, color: '#333', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {s.body}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SuggestionBoxPage;
