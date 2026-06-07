import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getRequestsByUser, resubmitRequest, createNotification } from '../firebase/attendance';

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
  background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const modalCardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 12, boxShadow: '0 2px 16px #0003',
  padding: 32, minWidth: 340, maxWidth: '90vw', width: 420,
};

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '10px 24px',
  fontWeight: 700,
  fontSize: 15,
  cursor: 'pointer',
  border: 'none',
  borderBottom: active ? '3px solid #2563eb' : '3px solid transparent',
  background: 'none',
  color: active ? '#2563eb' : '#888',
  transition: 'all 0.2s',
});

function escapeCSVField(value: string): string {
  const str = String(value ?? '');
  const sanitized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

function exportRequestsCSV(records: any[], type: 'clock' | 'overtime', userName: string) {
  const headers = type === 'clock'
    ? ['ユーザー名', '申請日付', '対象', '修正時刻', '理由', 'ステータス', '却下コメント']
    : ['ユーザー名', '申請日付', '残業時間', '理由', 'ステータス', '却下コメント'];
  const rows = records.map(r => {
    const status = r.status === 'pending' ? '保留中' : r.status === 'approved' ? '承認済み' : '却下済み';
    if (type === 'clock') {
      return [userName, r.date, r.type?.includes('退勤') ? '退勤' : '出勤', r.requestedTime, r.reason, status, r.denialComment || ''];
    }
    return [userName, r.date, r.requestedTime, r.reason, status, r.denialComment || ''];
  });
  const csvContent = '\uFEFF' + headers.map(escapeCSVField).join(',') + '\n' + rows.map(e => e.map(escapeCSVField).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const label = type === 'clock' ? '打刻修正申請' : '残業申請';
  link.href = URL.createObjectURL(blob);
  link.download = `${label}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const RequestHistoryPage: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<'clock' | 'overtime'>('clock');

  // 再編集モーダル用
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editTime, setEditTime] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  const loadRequests = () => {
    if (!user) return;
    setIsLoading(true);
    getRequestsByUser(user.uid)
      .then(setRequests)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadRequests();
  }, [user]);

  const openEditModal = (request: any) => {
    setEditTarget(request);
    setEditTime(request.requestedTime || '');
    setEditReason(request.reason || '');
    setEditError('');
    setShowEditModal(true);
  };

  const handleResubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || !user) return;
    setEditLoading(true);
    setEditError('');
    try {
      if (!editTime || !editReason) throw new Error('すべての項目を入力してください');

      await resubmitRequest(editTarget.id, {
        requestedTime: editTime,
        reason: editReason,
      });

      // 上長に再提出通知を送信
      if (editTarget.supervisorId) {
        await createNotification({
          recipientId: editTarget.supervisorId,
          title: '申請が再提出されました',
          message: `${user.name || user.email || '名無し'}さんから${editTarget.type}の申請が再提出されました。`,
          type: 'request',
          relatedRequestId: editTarget.id,
          isRead: false,
        });
      }

      setShowEditModal(false);
      loadRequests();
    } catch (e: any) {
      setEditError(e.message || '再提出に失敗しました');
    } finally {
      setEditLoading(false);
    }
  };

  const clockRequests = requests.filter(r => r.type?.includes('打刻修正'));
  const overtimeRequests = requests.filter(r => r.type === '残業申請');
  const filtered = tab === 'clock' ? clockRequests : overtimeRequests;

  const renderTable = (items: any[]) => {
    if (items.length === 0) {
      return <div style={{ color: '#888', fontSize: 15, padding: '12px 0' }}>該当する申請はありません。</div>;
    }
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, minWidth: 700 }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, textAlign: 'left', fontWeight: 700 }}>申請日付</th>
              {tab === 'clock' && <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>対象</th>}
              <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>{tab === 'clock' ? '修正時刻' : '残業時間'}</th>
              <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, textAlign: 'left', fontWeight: 700 }}>理由</th>
              <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>ステータス</th>
              <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, textAlign: 'left', fontWeight: 700 }}>却下コメント</th>
              <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map(r => (
              <tr key={r.id}>
                <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10 }}>{r.date}</td>
                {tab === 'clock' && (
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                    {r.type?.includes('退勤') ? '退勤' : '出勤'}
                  </td>
                )}
                <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>{r.requestedTime}</td>
                <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10 }}>{r.reason}</td>
                <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                  <span style={{
                    color: r.status === 'pending' ? '#eab308' : r.status === 'approved' ? '#22c55e' : '#ef4444',
                    fontWeight: 700,
                  }}>
                    {r.status === 'pending' ? '保留中' : r.status === 'approved' ? '承認済み' : '却下済み'}
                  </span>
                </td>
                <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, fontSize: 13, color: '#666' }}>
                  {r.denialComment || '-'}
                </td>
                <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                  {r.status === 'denied' && (
                    <button
                      onClick={() => openEditModal(r)}
                      style={{
                        background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6,
                        padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 700,
                      }}
                    >
                      再編集
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 900, margin: '32px auto', padding: '0 16px' }}>
      <div style={{ marginBottom: 18 }}>
        <Link to="/" style={{ color: '#2563eb', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
          &larr; ダッシュボードに戻る
        </Link>
      </div>
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px #0001', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontWeight: 'bold', fontSize: 22, color: '#222', margin: 0 }}>申請履歴</h2>
          {filtered.length > 0 && (
            <button
              onClick={() => exportRequestsCSV(filtered, tab, user?.name || user?.email || '')}
              style={{ background: '#22c55e', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 15, cursor: 'pointer', boxShadow: '0 1px 4px #0001' }}
            >CSV出力</button>
          )}
        </div>
        {/* タブ */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 18 }}>
          <button style={tabStyle(tab === 'clock')} onClick={() => setTab('clock')}>
            打刻修正
            {clockRequests.length > 0 && <span style={{ marginLeft: 6, background: '#dbeafe', borderRadius: 10, padding: '2px 8px', fontSize: 12 }}>{clockRequests.length}</span>}
          </button>
          <button style={tabStyle(tab === 'overtime')} onClick={() => setTab('overtime')}>
            残業申請
            {overtimeRequests.length > 0 && <span style={{ marginLeft: 6, background: '#fef3c7', borderRadius: 10, padding: '2px 8px', fontSize: 12 }}>{overtimeRequests.length}</span>}
          </button>
        </div>
        {isLoading ? (
          <div style={{ color: '#888', fontSize: 15 }}>読み込み中...</div>
        ) : (
          renderTable(filtered)
        )}
      </div>

      {/* 再編集モーダル */}
      {showEditModal && editTarget && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle}>
            <h2 style={{ fontWeight: 'bold', fontSize: 20, marginBottom: 16 }}>申請を再編集</h2>
            <div style={{ background: '#fef2f2', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#991b1b' }}>
              却下コメント: {editTarget.denialComment || 'なし'}
            </div>
            <div style={{ background: '#f3f4f6', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14, color: '#555' }}>
              種別: <strong>{editTarget.type}</strong> / 対象日: <strong>{editTarget.date}</strong>
            </div>
            <form onSubmit={handleResubmit}>
              <div style={{ marginBottom: 12 }}>
                {editTarget.type === '残業申請' ? (
                  <label>残業時間：
                    <select
                      value={editTime}
                      onChange={e => setEditTime(e.target.value)}
                      style={{ marginLeft: 8, padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 14 }}
                      required
                    >
                      <option value="">選択してください</option>
                      <option value="00:30">0時間30分</option>
                      <option value="01:00">1時間00分</option>
                      <option value="01:30">1時間30分</option>
                      <option value="02:00">2時間00分</option>
                      <option value="02:30">2時間30分</option>
                      <option value="03:00">3時間00分</option>
                      <option value="03:30">3時間30分</option>
                      <option value="04:00">4時間00分</option>
                      <option value="04:30">4時間30分</option>
                      <option value="05:00">5時間00分</option>
                      <option value="05:30">5時間30分</option>
                      <option value="06:00">6時間00分</option>
                    </select>
                  </label>
                ) : (
                  <label>修正時刻：
                    <input
                      type="text"
                      value={editTime}
                      onChange={e => setEditTime(e.target.value)}
                      style={{ marginLeft: 8, padding: 4, borderRadius: 4, border: '1px solid #ccc', width: 120 }}
                      placeholder="09:00"
                      required
                    />
                  </label>
                )}
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>理由：<br />
                  <textarea
                    value={editReason}
                    onChange={e => setEditReason(e.target.value)}
                    style={{ width: '100%', minHeight: 60, borderRadius: 4, border: '1px solid #ccc', padding: 4 }}
                    required
                  />
                </label>
              </div>
              {editError && <div style={{ color: 'red', marginBottom: 8 }}>{editError}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  style={{ padding: '8px 20px', borderRadius: 8, background: '#eee', color: '#333', border: 'none', fontWeight: 'bold', fontSize: 15, cursor: 'pointer' }}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  style={{ padding: '8px 24px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: 15, cursor: 'pointer', opacity: editLoading ? 0.7 : 1 }}
                >
                  {editLoading ? '送信中...' : '再提出する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RequestHistoryPage;
