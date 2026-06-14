import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { createSuggestion, getAllSuggestions, markSuggestionAsRead, deleteSuggestion } from '../firebase/attendance';

const SuggestionBoxPage: React.FC = () => {
  const { user } = useAuth();
  const [body, setBody] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // admin用
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const isAdmin = (user as any)?.role === 'admin';

  useEffect(() => {
    if (isAdmin) {
      setListLoading(true);
      getAllSuggestions().then(setSuggestions).finally(() => setListLoading(false));
    }
  }, [isAdmin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);
    try {
      if (!user) throw new Error('ログインしてください');
      if (!body.trim()) throw new Error('内容を入力してください');
      if (body.length > 1000) throw new Error('1000文字以内で入力してください');
      await createSuggestion({
        userId: user.uid,
        userName: user.name || user.email || '名無し',
        body: body.trim(),
        isAnonymous,
      });
      setSuccess(true);
      setBody('');
      setIsAnonymous(false);
      // admin なら一覧も更新
      if (isAdmin) {
        getAllSuggestions().then(setSuggestions);
      }
    } catch (e: any) {
      setError(e.message || '送信に失敗しました');
    } finally {
      setLoading(false);
    }
  };

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

      {/* 投稿フォーム */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px #0001', padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontWeight: 'bold', fontSize: 22, color: '#222', marginBottom: 6 }}>目安箱</h2>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 18 }}>
          システムへの要望・改善提案・気づいたことなどを自由に投稿できます。
        </p>

        {success ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ color: '#059669', fontWeight: 'bold', fontSize: 16, marginBottom: 16 }}>
              要望を送信しました！ご意見ありがとうございます。
            </div>
            <button
              onClick={() => setSuccess(false)}
              style={{ padding: '8px 24px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: 15, cursor: 'pointer' }}
            >
              続けて投稿する
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="改善してほしいこと、あったら嬉しい機能、気になった点など..."
                style={{
                  width: '100%', minHeight: 120, borderRadius: 8, border: '1px solid #d1d5db',
                  padding: 12, fontSize: 15, resize: 'vertical', boxSizing: 'border-box',
                }}
                required
              />
              <div style={{ textAlign: 'right', fontSize: 12, color: body.length > 1000 ? '#dc2626' : '#999', marginTop: 4 }}>
                {body.length}/1000
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#555' }}>
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={e => setIsAnonymous(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                匿名で投稿する
              </label>
              <div style={{ fontSize: 12, color: '#999', marginTop: 4, marginLeft: 24 }}>
                匿名の場合、管理者にも名前は表示されません
              </div>
            </div>
            {error && <div style={{ color: '#dc2626', marginBottom: 10, fontSize: 14 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '10px 28px', borderRadius: 8, background: '#2563eb', color: '#fff',
                  border: 'none', fontWeight: 'bold', fontSize: 15, cursor: 'pointer',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? '送信中...' : '送信する'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 管理者用: 要望一覧 */}
      {isAdmin && (
        <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px #0001', padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <h2 style={{ fontWeight: 'bold', fontSize: 20, color: '#222', margin: 0 }}>投稿一覧</h2>
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
      )}
    </div>
  );
};

export default SuggestionBoxPage;
