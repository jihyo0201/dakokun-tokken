import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getAttendancesByUser, createRequest } from '../firebase/attendance';

const getWorkDuration = (clockIn: any, clockOut: any) => {
  if (!clockIn?.toDate || !clockOut?.toDate) return '';
  const start = clockIn.toDate();
  const end = clockOut.toDate();
  const diffMs = end - start;
  const diffH = diffMs / (1000 * 60 * 60);
  return diffH.toFixed(2) + ' h';
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
  background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const modalCardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 12, boxShadow: '0 2px 16px #0003',
  padding: 32, minWidth: 340, maxWidth: '90vw', width: 400,
};

function escapeCSVField(value: string): string {
  const str = String(value ?? '');
  const sanitized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

function exportAttendancesCSV(records: any[], userName: string) {
  const headers = ['ユーザー名', '日付', '出勤', '退勤', '労働時間', '残業'];
  const rows = records.map(r => [
    userName,
    r.date,
    r.clockIn?.toDate?.().toLocaleTimeString?.() || '',
    r.clockOut?.toDate?.().toLocaleTimeString?.() || '',
    getWorkDuration(r.clockIn, r.clockOut),
    r.overtime || '',
  ]);
  const csvContent = '\uFEFF' + headers.map(escapeCSVField).join(',') + '\n' + rows.map(e => e.map(escapeCSVField).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `出退勤履歴_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const AttendanceHistoryPage: React.FC = () => {
  const { user } = useAuth();
  const [attendances, setAttendances] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 修正申請モーダル用
  const [showModal, setShowModal] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState<'出勤' | '退勤'>('出勤');
  const [correctionDate, setCorrectionDate] = useState('');
  const [correctionTime, setCorrectionTime] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionLoading, setCorrectionLoading] = useState(false);
  const [correctionSuccess, setCorrectionSuccess] = useState(false);
  const [correctionError, setCorrectionError] = useState('');

  const loadAttendances = () => {
    if (!user) return;
    setIsLoading(true);
    getAttendancesByUser(user.uid)
      .then(setAttendances)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadAttendances();
  }, [user]);

  const openCorrectionModal = (date: string, target: '出勤' | '退勤') => {
    setCorrectionDate(date);
    setCorrectionTarget(target);
    setCorrectionTime('');
    setCorrectionReason('');
    setCorrectionError('');
    setCorrectionSuccess(false);
    setShowModal(true);
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    setCorrectionLoading(true);
    setCorrectionError('');
    try {
      if (!user) throw new Error('ユーザー情報が取得できません');
      if (!correctionTime || !correctionReason) throw new Error('すべての項目を入力してください');
      if (!/^\d{2}:\d{2}$/.test(correctionTime)) throw new Error('時刻は HH:MM 形式で入力してください');
      if (correctionReason.length > 500) throw new Error('理由は500文字以内で入力してください');

      await createRequest({
        userId: user.uid,
        userName: user.name || user.email || '名無し',
        supervisorId: user.supervisorId || '',
        type: `打刻修正（${correctionTarget}）`,
        date: correctionDate,
        requestedTime: correctionTime,
        reason: correctionReason,
      });

      setCorrectionSuccess(true);
    } catch (e: any) {
      setCorrectionError(e.message || '申請に失敗しました');
    } finally {
      setCorrectionLoading(false);
    }
  };

  const editBtnStyle: React.CSSProperties = {
    background: 'none', border: '1px solid #d1d5db', borderRadius: 4,
    padding: '2px 6px', cursor: 'pointer', fontSize: 12, color: '#6b7280',
    marginLeft: 6, transition: 'all 0.2s',
  };

  return (
    <div style={{ maxWidth: 900, margin: '32px auto', padding: '0 16px' }}>
      <div style={{ marginBottom: 18 }}>
        <Link to="/" style={{ color: '#2563eb', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
          &larr; ダッシュボードに戻る
        </Link>
      </div>
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px #0001', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontWeight: 'bold', fontSize: 22, color: '#222', margin: 0 }}>出退勤履歴</h2>
          {attendances.length > 0 && (
            <button
              onClick={() => exportAttendancesCSV(attendances, user?.name || user?.email || '')}
              style={{ background: '#22c55e', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 15, cursor: 'pointer', boxShadow: '0 1px 4px #0001' }}
            >CSV出力</button>
          )}
        </div>
        {isLoading ? (
          <div style={{ color: '#888', fontSize: 15 }}>読み込み中...</div>
        ) : attendances.length === 0 ? (
          <div style={{ color: '#888', fontSize: 15 }}>出退勤データはありません。</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, minWidth: 600 }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, textAlign: 'left', fontWeight: 700 }}>日付</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>出勤</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>退勤</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>労働時間</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>残業</th>
                </tr>
              </thead>
              <tbody>
                {attendances.map(a => (
                  <tr key={a.id}>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10 }}>{a.date}</td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                      {a.clockIn?.toDate?.().toLocaleTimeString?.() || '--:--:--'}
                      <button style={editBtnStyle} onClick={() => openCorrectionModal(a.date, '出勤')} title="出勤時刻を修正申請">
                        修正
                      </button>
                    </td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                      {a.clockOut?.toDate?.().toLocaleTimeString?.() || '--:--:--'}
                      <button style={editBtnStyle} onClick={() => openCorrectionModal(a.date, '退勤')} title="退勤時刻を修正申請">
                        修正
                      </button>
                    </td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>{getWorkDuration(a.clockIn, a.clockOut)}</td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                      {a.overtime ? (
                        <span style={{ color: '#b45309', fontWeight: 700 }}>{a.overtime}</span>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 打刻修正モーダル */}
      {showModal && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle}>
            <h2 style={{ fontWeight: 'bold', fontSize: 20, marginBottom: 16 }}>打刻修正（{correctionTarget}）</h2>
            <div style={{ background: '#f3f4f6', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14, color: '#555' }}>
              対象日: <strong>{correctionDate}</strong> の <strong>{correctionTarget}</strong> 時刻
            </div>
            {correctionSuccess ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#059669', fontWeight: 'bold', marginBottom: 16 }}>
                  修正申請を送信しました。上長の承認後に反映されます。
                </div>
                <button
                  style={{ padding: '8px 24px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: 15, cursor: 'pointer' }}
                  onClick={() => setShowModal(false)}
                >
                  閉じる
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitCorrection}>
                <div style={{ marginBottom: 12 }}>
                  <label>修正後の{correctionTarget}時刻：
                    <input
                      type="text"
                      value={correctionTime}
                      onChange={e => setCorrectionTime(e.target.value)}
                      style={{ marginLeft: 8, padding: 4, borderRadius: 4, border: '1px solid #ccc', width: 120 }}
                      placeholder="09:00"
                      required
                    />
                  </label>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label>理由：<br />
                    <textarea
                      value={correctionReason}
                      onChange={e => setCorrectionReason(e.target.value)}
                      style={{ width: '100%', minHeight: 60, borderRadius: 4, border: '1px solid #ccc', padding: 4 }}
                      required
                    />
                  </label>
                </div>
                {correctionError && <div style={{ color: 'red', marginBottom: 8 }}>{correctionError}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    style={{ padding: '8px 20px', borderRadius: 8, background: '#eee', color: '#333', border: 'none', fontWeight: 'bold', fontSize: 15, cursor: 'pointer' }}
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={correctionLoading}
                    style={{ padding: '8px 24px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: 15, cursor: 'pointer', opacity: correctionLoading ? 0.7 : 1 }}
                  >
                    {correctionLoading ? '送信中...' : '修正申請する'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceHistoryPage;
