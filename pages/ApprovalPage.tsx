import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  getAllRequests,
  getRequestsBySupervisor,
  updateRequestStatus,
  applyClockCorrection,
  applyOvertimeApproval,
  createNotification,
} from '../firebase/attendance';

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

const ApprovalPage: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [tab, setTab] = useState<'clock' | 'overtime'>('clock');

  // 却下コメントモーダル用
  const [showDenialModal, setShowDenialModal] = useState(false);
  const [denialTargetId, setDenialTargetId] = useState<string | null>(null);
  const [denialComment, setDenialComment] = useState('');

  const loadRequests = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      let reqs: any[];
      if (user.role === 'admin') {
        reqs = await getAllRequests();
      } else {
        reqs = await getRequestsBySupervisor(user.uid);
      }
      setRequests(reqs);
    } catch (e) {
      console.error('申請の読み込みに失敗しました:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [user]);

  const openDenialModal = (requestId: string) => {
    setDenialTargetId(requestId);
    setDenialComment('');
    setShowDenialModal(true);
  };

  const handleDenialSubmit = async () => {
    if (!denialTargetId) return;
    setShowDenialModal(false);
    await handleAction(denialTargetId, 'denied', denialComment);
  };

  const handleAction = async (requestId: string, action: 'approved' | 'denied', comment?: string) => {
    setActionLoading(requestId);
    setMessage(null);
    try {
      const request = requests.find(r => r.id === requestId);

      // 承認時に勤怠データを反映する
      if (action === 'approved' && request) {
        if (request.type?.includes('打刻修正')) {
          const target = request.type.includes('退勤') ? 'clockOut' : 'clockIn';
          await applyClockCorrection(request.userId, request.userName || '', request.date, target, request.requestedTime);
        } else if (request.type === '残業申請') {
          await applyOvertimeApproval(request.userId, request.userName || '', request.date, request.requestedTime);
        }
      }

      await updateRequestStatus(requestId, action, comment);

      // 申請者に通知を送信
      if (request) {
        const denialMsg = action === 'denied' && comment ? `\n却下理由: ${comment}` : '';
        await createNotification({
          recipientId: request.userId,
          title: `申請が${action === 'approved' ? '承認' : '却下'}されました`,
          message: `${request.type}の申請が${action === 'approved' ? '承認' : '却下'}されました。${denialMsg}`,
          type: 'approval',
          relatedRequestId: requestId,
          isRead: false,
        });
      }

      await loadRequests();
      setMessage({
        text: `${request?.userName || ''}さんの申請を${action === 'approved' ? '承認' : '却下'}しました。${action === 'approved' && request?.type?.includes('打刻修正') ? '打刻データを修正しました。' : ''}${action === 'approved' && request?.type === '残業申請' ? '残業を勤怠データに反映しました。' : ''}`,
        type: 'success',
      });
    } catch (e: any) {
      console.error('申請の処理に失敗しました:', e);
      setMessage({ text: `処理に失敗しました: ${e.message || e}`, type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  // ロール制限
  if (user && user.role !== 'admin' && user.role !== 'supervisor') {
    return (
      <div style={{ maxWidth: 900, margin: '32px auto', padding: '0 16px' }}>
        <div style={{ background: '#fff', borderRadius: 14, padding: 24, textAlign: 'center', color: '#888' }}>
          このページは管理者・上長のみ利用できます。
        </div>
      </div>
    );
  }

  const isClock = (r: any) => r.type?.includes('打刻修正');
  const isOvertime = (r: any) => r.type === '残業申請';
  const filterFn = tab === 'clock' ? isClock : isOvertime;

  const allFiltered = requests.filter(filterFn);
  const pendingRequests = allFiltered.filter(r => r.status === 'pending');
  const processedRequests = allFiltered.filter(r => r.status !== 'pending');

  // タブ件数用
  const clockPendingCount = requests.filter(r => isClock(r) && r.status === 'pending').length;
  const overtimePendingCount = requests.filter(r => isOvertime(r) && r.status === 'pending').length;

  const renderActionButtons = (r: any) => (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      <button
        onClick={() => handleAction(r.id, 'approved')}
        disabled={actionLoading === r.id}
        style={{
          background: '#22c55e', color: '#fff', border: 'none', borderRadius: 6,
          padding: '8px 16px', fontSize: 14, cursor: 'pointer', fontWeight: 700,
          opacity: actionLoading === r.id ? 0.6 : 1,
        }}
      >
        承認
      </button>
      <button
        onClick={() => openDenialModal(r.id)}
        disabled={actionLoading === r.id}
        style={{
          background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6,
          padding: '8px 16px', fontSize: 14, cursor: 'pointer', fontWeight: 700,
          opacity: actionLoading === r.id ? 0.6 : 1,
        }}
      >
        却下
      </button>
    </div>
  );

  const renderPendingTable = (items: any[]) => {
    if (items.length === 0) {
      return <div style={{ color: '#888', fontSize: 15 }}>未処理の申請はありません。</div>;
    }
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, minWidth: 700 }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, textAlign: 'left', fontWeight: 700 }}>申請者</th>
              {tab === 'clock' && <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>対象</th>}
              <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>対象日</th>
              <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>{tab === 'clock' ? '修正時刻' : '残業時間'}</th>
              <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, textAlign: 'left', fontWeight: 700 }}>理由</th>
              <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map(r => (
              <tr key={r.id}>
                <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10 }}>{r.userName}</td>
                {tab === 'clock' && (
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                    {r.type?.includes('退勤') ? '退勤' : '出勤'}
                  </td>
                )}
                <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>{r.date}</td>
                <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>{r.requestedTime}</td>
                <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10 }}>{r.reason}</td>
                <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                  {renderActionButtons(r)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderProcessedTable = (items: any[]) => {
    if (items.length === 0) return null;
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, minWidth: 700 }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, textAlign: 'left', fontWeight: 700 }}>申請者</th>
              {tab === 'clock' && <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>対象</th>}
              <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>対象日</th>
              <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>{tab === 'clock' ? '修正時刻' : '残業時間'}</th>
              <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, textAlign: 'left', fontWeight: 700 }}>理由</th>
              <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>結果</th>
              <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, textAlign: 'left', fontWeight: 700 }}>却下コメント</th>
            </tr>
          </thead>
          <tbody>
            {items.map(r => (
              <tr key={r.id}>
                <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10 }}>{r.userName}</td>
                {tab === 'clock' && (
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                    {r.type?.includes('退勤') ? '退勤' : '出勤'}
                  </td>
                )}
                <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>{r.date}</td>
                <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>{r.requestedTime}</td>
                <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10 }}>{r.reason}</td>
                <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                  <span style={{
                    color: r.status === 'approved' ? '#22c55e' : '#ef4444',
                    fontWeight: 700,
                  }}>
                    {r.status === 'approved' ? '承認済み' : '却下済み'}
                  </span>
                </td>
                <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, fontSize: 13, color: '#666' }}>
                  {r.denialComment || '-'}
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

      {/* 結果メッセージ */}
      {message && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 18, fontWeight: 600, fontSize: 14,
          background: message.type === 'success' ? '#d1fae5' : '#fee2e2',
          color: message.type === 'success' ? '#065f46' : '#991b1b',
        }}>
          {message.text}
        </div>
      )}

      {/* タブ */}
      <div style={{ background: '#fff', borderRadius: '14px 14px 0 0', boxShadow: '0 2px 12px #0001', padding: '24px 24px 0' }}>
        <h2 style={{ fontWeight: 'bold', fontSize: 22, marginBottom: 12, color: '#222' }}>申請承認</h2>
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
          <button style={tabStyle(tab === 'clock')} onClick={() => setTab('clock')}>
            打刻修正
            {clockPendingCount > 0 && <span style={{ marginLeft: 6, background: '#fef3c7', color: '#b45309', borderRadius: 10, padding: '2px 8px', fontSize: 12 }}>{clockPendingCount}</span>}
          </button>
          <button style={tabStyle(tab === 'overtime')} onClick={() => setTab('overtime')}>
            残業申請
            {overtimePendingCount > 0 && <span style={{ marginLeft: 6, background: '#fef3c7', color: '#b45309', borderRadius: 10, padding: '2px 8px', fontSize: 12 }}>{overtimePendingCount}</span>}
          </button>
        </div>
      </div>

      {/* 未処理の申請 */}
      <div style={{ background: '#fff', boxShadow: '0 2px 12px #0001', padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 14, color: '#333' }}>
          未処理
          {pendingRequests.length > 0 && (
            <span style={{ marginLeft: 10, background: '#fef3c7', color: '#b45309', borderRadius: 10, padding: '4px 12px', fontSize: 14 }}>
              {pendingRequests.length}件
            </span>
          )}
        </h3>
        {isLoading ? (
          <div style={{ color: '#888', fontSize: 15 }}>読み込み中...</div>
        ) : (
          renderPendingTable(pendingRequests)
        )}
      </div>

      {/* 処理済みの申請 */}
      {processedRequests.length > 0 && (
        <div style={{ background: '#fff', borderRadius: '0 0 14px 14px', boxShadow: '0 2px 12px #0001', padding: 24 }}>
          <h3 style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 14, color: '#333' }}>処理済み</h3>
          {renderProcessedTable(processedRequests)}
        </div>
      )}

      {/* 却下コメントモーダル */}
      {showDenialModal && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle}>
            <h2 style={{ fontWeight: 'bold', fontSize: 20, marginBottom: 16 }}>却下コメント</h2>
            <div style={{ marginBottom: 12 }}>
              <label>却下理由（任意）：<br />
                <textarea
                  value={denialComment}
                  onChange={e => setDenialComment(e.target.value)}
                  style={{ width: '100%', minHeight: 80, borderRadius: 4, border: '1px solid #ccc', padding: 8, marginTop: 4 }}
                  placeholder="却下理由を入力してください..."
                />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowDenialModal(false)}
                style={{ padding: '8px 20px', borderRadius: 8, background: '#eee', color: '#333', border: 'none', fontWeight: 'bold', fontSize: 15, cursor: 'pointer' }}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleDenialSubmit}
                style={{ padding: '8px 24px', borderRadius: 8, background: '#ef4444', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: 15, cursor: 'pointer' }}
              >
                却下する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApprovalPage;
