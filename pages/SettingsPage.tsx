import React, { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getAllUsers, updateUserRole, updateUserSupervisor, updateUserWorkSchedule } from '../firebase/auth';
import { getCompanySettings, updateCompanySettings } from '../firebase/attendance';

const sectionCardStyle: React.CSSProperties = {
  maxWidth: 900,
  margin: '24px auto 0',
  background: '#fff',
  borderRadius: 14,
  boxShadow: '0 2px 12px #0001',
  padding: 24,
};

const sectionTitleStyle: React.CSSProperties = {
  fontWeight: 'bold',
  fontSize: 20,
  marginBottom: 18,
  color: '#222',
};

const SettingsPage: React.FC = () => {
  const { user } = useAuth();

  // --- Closing Day ---
  const [closingDay, setClosingDay] = useState(10);
  const [closingDayInput, setClosingDayInput] = useState('10');
  const [closingDaySaving, setClosingDaySaving] = useState(false);
  const [closingDayMessage, setClosingDayMessage] = useState('');

  // --- Compensatory Leave ---
  const [compensatoryLeaveType, setCompensatoryLeaveType] = useState<'paid' | 'unpaid'>('unpaid');
  const [compLeaveSaving, setCompLeaveSaving] = useState(false);
  const [compLeaveMessage, setCompLeaveMessage] = useState('');

  // --- User Management ---
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [roleUpdateLoading, setRoleUpdateLoading] = useState<string | null>(null);
  const [supervisorUpdateLoading, setSupervisorUpdateLoading] = useState<string | null>(null);
  const [workScheduleUpdateLoading, setWorkScheduleUpdateLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;

    getCompanySettings().then(s => {
      const cd = s.closingDay || 10;
      setClosingDay(cd);
      setClosingDayInput(String(cd));
      setCompensatoryLeaveType(s.compensatoryLeaveType || 'unpaid');
    });

    getAllUsers().then(setAllUsers);
  }, [user]);

  if (!user) return null;
  if (user.role !== 'admin') return <Navigate to="/" />;

  const handleRoleChange = async (uid: string, newRole: 'admin' | 'supervisor' | 'employee') => {
    setRoleUpdateLoading(uid);
    try {
      await updateUserRole(uid, newRole);
      setAllUsers(prev => prev.map(u => u.id === uid ? { ...u, role: newRole } : u));
    } catch (e) {
      if (import.meta.env.DEV) console.error('ロール更新失敗:', e);
    } finally {
      setRoleUpdateLoading(null);
    }
  };

  const handleSupervisorChange = async (uid: string, newSupervisorId: string) => {
    setSupervisorUpdateLoading(uid);
    try {
      await updateUserSupervisor(uid, newSupervisorId);
      setAllUsers(prev => prev.map(u => u.id === uid ? { ...u, supervisorId: newSupervisorId } : u));
    } catch (e) {
      if (import.meta.env.DEV) console.error('上長更新失敗:', e);
    } finally {
      setSupervisorUpdateLoading(null);
    }
  };

  const handleWorkScheduleChange = async (uid: string, scheduleType: string, options?: { deemedHours?: number; prescribedDailyHours?: number }) => {
    setWorkScheduleUpdateLoading(uid);
    try {
      await updateUserWorkSchedule(uid, scheduleType, options);
      setAllUsers(prev => prev.map(u => u.id === uid ? { ...u, workScheduleType: scheduleType, ...options } : u));
    } catch (e) {
      if (import.meta.env.DEV) console.error('勤務区分更新失敗:', e);
    } finally {
      setWorkScheduleUpdateLoading(null);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 48px' }}>
      <Link to="/" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600, fontSize: 15 }}>
        &larr; ダッシュボードに戻る
      </Link>

      <h1 style={{ fontWeight: 'bold', fontSize: 26, color: '#222', margin: '18px 0 0' }}>設定</h1>

      {/* 締め日設定 */}
      <div style={sectionCardStyle}>
        <h2 style={sectionTitleStyle}>締め日設定</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 15, fontWeight: 500 }}>
            毎月
            <select
              value={closingDayInput}
              onChange={e => setClosingDayInput(e.target.value)}
              style={{ margin: '0 8px', padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 15 }}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                <option key={d} value={String(d)}>{d}</option>
              ))}
            </select>
            日締め
          </label>
          <button
            disabled={closingDaySaving || Number(closingDayInput) === closingDay}
            onClick={async () => {
              setClosingDaySaving(true);
              setClosingDayMessage('');
              try {
                const newDay = Number(closingDayInput);
                await updateCompanySettings({ closingDay: newDay } as any);
                setClosingDay(newDay);
                setClosingDayMessage('保存しました');
              } catch {
                setClosingDayMessage('保存に失敗しました');
              } finally {
                setClosingDaySaving(false);
                setTimeout(() => setClosingDayMessage(''), 3000);
              }
            }}
            style={{
              background: Number(closingDayInput) === closingDay ? '#d1d5db' : '#2563eb',
              color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: 8,
              padding: '8px 20px', fontSize: 14, cursor: Number(closingDayInput) === closingDay ? 'default' : 'pointer',
            }}
          >
            {closingDaySaving ? '保存中...' : '保存'}
          </button>
          {closingDayMessage && (
            <span style={{ fontSize: 14, color: closingDayMessage === '保存しました' ? '#059669' : '#dc2626', fontWeight: 500 }}>
              {closingDayMessage}
            </span>
          )}
        </div>
        <p style={{ fontSize: 13, color: '#888', marginTop: 10 }}>
          例: 10日締め → 前月11日〜当月10日が1ヶ月分の集計期間になります
        </p>
      </div>

      {/* ユーザー管理 */}
      <div style={sectionCardStyle}>
        <h2 style={sectionTitleStyle}>ユーザー管理</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, minWidth: 700 }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, textAlign: 'left', fontWeight: 700 }}>名前</th>
                <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, textAlign: 'left', fontWeight: 700 }}>メール</th>
                <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>ロール</th>
                <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>変更</th>
                <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>上長</th>
                <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>勤務区分</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map(u => {
                const currentSchedule = u.workScheduleType || 'regular';
                return (
                  <tr key={u.id}>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10 }}>{u.name}</td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, color: '#555' }}>{u.email}</td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                      <span style={{
                        background: u.role === 'admin' ? '#dbeafe' : u.role === 'supervisor' ? '#fef9c3' : '#f0fdf4',
                        color: u.role === 'admin' ? '#1d4ed8' : u.role === 'supervisor' ? '#b45309' : '#15803d',
                        borderRadius: 6, padding: '2px 10px', fontWeight: 700, fontSize: 13,
                      }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                      {u.id === user.uid ? (
                        <span style={{ color: '#aaa', fontSize: 13 }}>(自分)</span>
                      ) : (
                        <select
                          value={u.role}
                          disabled={roleUpdateLoading === u.id}
                          onChange={e => handleRoleChange(u.id, e.target.value as 'admin' | 'supervisor' | 'employee')}
                          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, cursor: 'pointer' }}
                        >
                          <option value="employee">employee</option>
                          <option value="supervisor">supervisor</option>
                          <option value="admin">admin</option>
                        </select>
                      )}
                    </td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                      {u.role === 'employee' ? (
                        <select
                          value={u.supervisorId || ''}
                          disabled={supervisorUpdateLoading === u.id}
                          onChange={e => handleSupervisorChange(u.id, e.target.value)}
                          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, cursor: 'pointer' }}
                        >
                          <option value="">未設定</option>
                          {allUsers
                            .filter(s => s.role === 'supervisor' || s.role === 'admin')
                            .map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                      ) : (
                        <span style={{ color: '#aaa', fontSize: 13 }}>-</span>
                      )}
                    </td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                        <select
                          value={currentSchedule}
                          disabled={workScheduleUpdateLoading === u.id}
                          onChange={e => {
                            const newType = e.target.value;
                            const opts: any = {};
                            if (newType === 'deemed') opts.deemedHours = u.deemedHours ?? 8;
                            if (newType === 'short_flex') opts.prescribedDailyHours = u.prescribedDailyHours ?? 6;
                            handleWorkScheduleChange(u.id, newType, opts);
                          }}
                          style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, cursor: 'pointer' }}
                        >
                          <option value="regular">通常勤務</option>
                          <option value="deemed">みなし労働時間制</option>
                          <option value="managerial">管理監督者</option>
                          <option value="short_flex">時短+フレックス</option>
                        </select>
                        {currentSchedule === 'deemed' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                            <span style={{ color: '#666' }}>みなし:</span>
                            <input
                              type="number" min="1" max="12" step="0.5"
                              value={u.deemedHours ?? 8}
                              onChange={e => handleWorkScheduleChange(u.id, 'deemed', { deemedHours: Number(e.target.value) })}
                              style={{ width: 48, padding: '2px 4px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 12, textAlign: 'center' }}
                            />
                            <span style={{ color: '#666' }}>h</span>
                          </div>
                        )}
                        {currentSchedule === 'short_flex' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                            <span style={{ color: '#666' }}>所定:</span>
                            <input
                              type="number" min="1" max="8" step="0.5"
                              value={u.prescribedDailyHours ?? 6}
                              onChange={e => handleWorkScheduleChange(u.id, 'short_flex', { prescribedDailyHours: Number(e.target.value) })}
                              style={{ width: 48, padding: '2px 4px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 12, textAlign: 'center' }}
                            />
                            <span style={{ color: '#666' }}>h/日</span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 代休設定 */}
      <div style={sectionCardStyle}>
        <h2 style={sectionTitleStyle}>代休設定</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 15, fontWeight: 500 }}>
            代休の種別：
            <select
              value={compensatoryLeaveType}
              onChange={async e => {
                const value = e.target.value as 'paid' | 'unpaid';
                setCompensatoryLeaveType(value);
                setCompLeaveSaving(true);
                setCompLeaveMessage('');
                try {
                  await updateCompanySettings({ compensatoryLeaveType: value } as any);
                  setCompLeaveMessage('保存しました');
                } catch {
                  setCompLeaveMessage('保存に失敗しました');
                } finally {
                  setCompLeaveSaving(false);
                  setTimeout(() => setCompLeaveMessage(''), 3000);
                }
              }}
              disabled={compLeaveSaving}
              style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 15 }}
            >
              <option value="paid">有給</option>
              <option value="unpaid">無給</option>
            </select>
          </label>
          {compLeaveSaving && <span style={{ fontSize: 14, color: '#888' }}>保存中...</span>}
          {compLeaveMessage && (
            <span style={{ fontSize: 14, color: compLeaveMessage === '保存しました' ? '#059669' : '#dc2626', fontWeight: 500 }}>
              {compLeaveMessage}
            </span>
          )}
        </div>
        <p style={{ fontSize: 13, color: '#888', marginTop: 10 }}>
          代休取得時の給与計算に反映されます。
        </p>
      </div>
    </div>
  );
};

export default SettingsPage;
