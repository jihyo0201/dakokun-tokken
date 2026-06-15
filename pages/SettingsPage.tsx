import React, { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getAllUsers, updateUserRole, updateUserSupervisor, updateUserWorkSchedule, updateUserHireDate, updateUserWorkHours } from '../firebase/auth';
import { getCompanySettings, updateCompanySettings, getAllLeaveBalances, createLeaveBalance, updateLeaveBalance, calculateAutoGrant, getAllCompensatoryBalances, updateCompensatoryBalance } from '../firebase/attendance';

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

  // --- Standard Work Hours ---
  const [standardStartTime, setStandardStartTime] = useState('09:00');
  const [standardEndTime, setStandardEndTime] = useState('18:00');
  const [standardTimeSaving, setStandardTimeSaving] = useState(false);
  const [standardTimeMessage, setStandardTimeMessage] = useState('');

  // --- Compensatory Leave ---
  const [compensatoryLeaveType, setCompensatoryLeaveType] = useState<'paid' | 'unpaid'>('unpaid');
  const [compLeaveSaving, setCompLeaveSaving] = useState(false);
  const [compLeaveMessage, setCompLeaveMessage] = useState('');

  // --- Email Notification ---
  const [notificationEmail, setNotificationEmail] = useState('');
  const [resendApiKey, setResendApiKey] = useState('');
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifMessage, setNotifMessage] = useState('');
  const [notifTestLoading, setNotifTestLoading] = useState(false);
  const [notifTestMessage, setNotifTestMessage] = useState('');

  // --- User Management ---
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [roleUpdateLoading, setRoleUpdateLoading] = useState<string | null>(null);
  const [supervisorUpdateLoading, setSupervisorUpdateLoading] = useState<string | null>(null);
  const [workScheduleUpdateLoading, setWorkScheduleUpdateLoading] = useState<string | null>(null);
  const [hireDateUpdateLoading, setHireDateUpdateLoading] = useState<string | null>(null);

  // --- Leave Balances ---
  const [leaveBalances, setLeaveBalances] = useState<any[]>([]);
  const [leaveGrantLoading, setLeaveGrantLoading] = useState(false);
  const [leaveGrantMessage, setLeaveGrantMessage] = useState('');
  const [editingLeave, setEditingLeave] = useState<{ id: string; granted: number; used: number; carried: number } | null>(null);
  const [leaveUpdateLoading, setLeaveUpdateLoading] = useState(false);
  // --- Compensatory Balances ---
  const [compensatoryBalances, setCompensatoryBalances] = useState<any[]>([]);
  // --- Manual Leave Grant Modal ---
  const [showManualGrantModal, setShowManualGrantModal] = useState(false);
  const [manualGrantUserId, setManualGrantUserId] = useState('');
  const [manualGrantFiscalYear, setManualGrantFiscalYear] = useState(new Date().getFullYear());
  const [manualGrantDays, setManualGrantDays] = useState(10);
  const [manualGrantCarried, setManualGrantCarried] = useState(0);
  const [manualGrantLoading, setManualGrantLoading] = useState(false);
  const [manualGrantError, setManualGrantError] = useState('');
  const [manualGrantSuccess, setManualGrantSuccess] = useState('');

  useEffect(() => {
    if (!user || user.role !== 'admin') return;

    getCompanySettings().then(s => {
      const cd = s.closingDay || 10;
      setClosingDay(cd);
      setClosingDayInput(String(cd));
      setCompensatoryLeaveType(s.compensatoryLeaveType || 'unpaid');
      setStandardStartTime(s.standardStartTime || '09:00');
      setStandardEndTime(s.standardEndTime || '18:00');
      setNotificationEmail(s.notificationEmail || '');
      setResendApiKey(s.resendApiKey || '');
    });

    getAllUsers().then(setAllUsers);
    getAllLeaveBalances().then(setLeaveBalances);
    getAllCompensatoryBalances().then(setCompensatoryBalances);
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

  const handleHireDateChange = async (uid: string, hireDate: string) => {
    setHireDateUpdateLoading(uid);
    try {
      await updateUserHireDate(uid, hireDate);
      setAllUsers(prev => prev.map(u => u.id === uid ? { ...u, hireDate } : u));
    } catch (e) {
      if (import.meta.env.DEV) console.error('入社日更新失敗:', e);
    } finally {
      setHireDateUpdateLoading(null);
    }
  };

  // 一括有休付与
  const handleBulkLeaveGrant = async () => {
    setLeaveGrantLoading(true);
    setLeaveGrantMessage('');
    const currentYear = new Date().getFullYear();
    let grantedCount = 0;
    try {
      for (const u of allUsers) {
        if (!u.hireDate) continue;
        const { days } = calculateAutoGrant(u.hireDate);
        if (days <= 0) continue;
        // 今年度分が既にあるかチェック
        const existing = leaveBalances.find((b: any) => b.userId === u.id && b.fiscalYear === currentYear);
        if (existing) continue;
        // 前年度の残日数を繰越
        const prevYear = leaveBalances.find((b: any) => b.userId === u.id && b.fiscalYear === currentYear - 1);
        const carried = prevYear ? Math.max(0, (prevYear.granted || 0) + (prevYear.carried || 0) - (prevYear.used || 0)) : 0;
        await createLeaveBalance({
          userId: u.id,
          fiscalYear: currentYear,
          granted: days,
          used: 0,
          carried,
          grantedAt: new Date(),
          expiresAt: new Date(currentYear + 2, 2, 31), // 2年後の3月末で失効
        });
        grantedCount++;
      }
      // 再取得
      const updated = await getAllLeaveBalances();
      setLeaveBalances(updated);
      setLeaveGrantMessage(grantedCount > 0 ? `${grantedCount}名に付与しました` : '全員付与済み or 入社日未設定のため対象者なし');
    } catch (e) {
      setLeaveGrantMessage('付与に失敗しました');
    } finally {
      setLeaveGrantLoading(false);
      setTimeout(() => setLeaveGrantMessage(''), 5000);
    }
  };

  // 手動有休付与
  const handleManualLeaveGrant = async () => {
    setManualGrantError('');
    setManualGrantSuccess('');
    if (!manualGrantUserId) {
      setManualGrantError('対象社員を選択してください');
      return;
    }
    if (!manualGrantDays || manualGrantDays < 0) {
      setManualGrantError('付与日数を入力してください');
      return;
    }
    setManualGrantLoading(true);
    try {
      // 同一ユーザー・同一年度の既存チェック
      const existing = leaveBalances.find((b: any) => b.userId === manualGrantUserId && b.fiscalYear === manualGrantFiscalYear);
      if (existing) {
        await updateLeaveBalance(existing.id, { granted: manualGrantDays, carried: manualGrantCarried });
      } else {
        await createLeaveBalance({
          userId: manualGrantUserId,
          fiscalYear: manualGrantFiscalYear,
          granted: manualGrantDays,
          used: 0,
          carried: manualGrantCarried,
          grantedAt: new Date(),
          expiresAt: new Date(manualGrantFiscalYear + 2, 2, 31),
        });
      }
      const updated = await getAllLeaveBalances();
      setLeaveBalances(updated);
      const userName = allUsers.find(u => u.id === manualGrantUserId)?.name || '';
      setManualGrantSuccess(`${userName}に${manualGrantDays}日付与しました`);
      setTimeout(() => {
        setShowManualGrantModal(false);
        setManualGrantSuccess('');
      }, 1500);
    } catch (e: any) {
      console.error('手動付与失敗:', e);
      setManualGrantError(`付与に失敗しました: ${e.message || '不明なエラー'}`);
    } finally {
      setManualGrantLoading(false);
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

      {/* 所定勤務時間設定 */}
      <div style={sectionCardStyle}>
        <h2 style={sectionTitleStyle}>所定勤務時間</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 15, fontWeight: 500 }}>
            始業
            <input
              type="time"
              value={standardStartTime}
              onChange={e => setStandardStartTime(e.target.value)}
              style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 15 }}
            />
          </label>
          <label style={{ fontSize: 15, fontWeight: 500 }}>
            終業
            <input
              type="time"
              value={standardEndTime}
              onChange={e => setStandardEndTime(e.target.value)}
              style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 15 }}
            />
          </label>
          <button
            disabled={standardTimeSaving}
            onClick={async () => {
              setStandardTimeSaving(true);
              setStandardTimeMessage('');
              try {
                await updateCompanySettings({ standardStartTime, standardEndTime } as any);
                setStandardTimeMessage('保存しました');
              } catch {
                setStandardTimeMessage('保存に失敗しました');
              } finally {
                setStandardTimeSaving(false);
                setTimeout(() => setStandardTimeMessage(''), 3000);
              }
            }}
            style={{
              background: '#2563eb', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: 8,
              padding: '8px 20px', fontSize: 14, cursor: 'pointer',
            }}
          >
            {standardTimeSaving ? '保存中...' : '保存'}
          </button>
          {standardTimeMessage && (
            <span style={{ fontSize: 14, color: standardTimeMessage === '保存しました' ? '#059669' : '#dc2626', fontWeight: 500 }}>
              {standardTimeMessage}
            </span>
          )}
        </div>
        <p style={{ fontSize: 13, color: '#888', marginTop: 10 }}>
          会社全体のデフォルト値です。ユーザー管理テーブルで個別に上書きできます。個別設定がない場合はこの値が使用されます。
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
                <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>入社日</th>
                <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>所定時間</th>
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
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                      <input
                        type="date"
                        value={u.hireDate || ''}
                        disabled={hireDateUpdateLoading === u.id}
                        onChange={e => handleHireDateChange(u.id, e.target.value)}
                        style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                      />
                    </td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="time"
                            value={u.standardStartTime || ''}
                            onChange={e => {
                              const newStart = e.target.value;
                              const newEnd = u.standardEndTime || standardEndTime || '18:00';
                              updateUserWorkHours(u.id, newStart, newEnd);
                              setAllUsers(prev => prev.map(x => x.id === u.id ? { ...x, standardStartTime: newStart } : x));
                            }}
                            style={{ width: 90, padding: '2px 4px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 12 }}
                            placeholder={standardStartTime || '09:00'}
                          />
                          <span style={{ fontSize: 11, color: '#888' }}>〜</span>
                          <input
                            type="time"
                            value={u.standardEndTime || ''}
                            onChange={e => {
                              const newEnd = e.target.value;
                              const newStart = u.standardStartTime || standardStartTime || '09:00';
                              updateUserWorkHours(u.id, newStart, newEnd);
                              setAllUsers(prev => prev.map(x => x.id === u.id ? { ...x, standardEndTime: newEnd } : x));
                            }}
                            style={{ width: 90, padding: '2px 4px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 12 }}
                            placeholder={standardEndTime || '18:00'}
                          />
                        </div>
                        {!u.standardStartTime && !u.standardEndTime && (
                          <span style={{ fontSize: 10, color: '#aaa' }}>会社設定に準拠</span>
                        )}
                      </div>
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

      {/* 有休管理 */}
      <div style={sectionCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ ...sectionTitleStyle, marginBottom: 0 }}>有休管理</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              disabled={leaveGrantLoading}
              onClick={handleBulkLeaveGrant}
              style={{
                background: '#22c55e', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: 8,
                padding: '8px 20px', fontSize: 14, cursor: 'pointer', opacity: leaveGrantLoading ? 0.7 : 1,
              }}
            >
              {leaveGrantLoading ? '付与中...' : '一括付与（勤続年数ベース）'}
            </button>
            <button
              onClick={() => { setManualGrantUserId(allUsers[0]?.id || ''); setShowManualGrantModal(true); }}
              style={{
                background: '#2563eb', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: 8,
                padding: '8px 20px', fontSize: 14, cursor: 'pointer',
              }}
            >手動付与</button>
            {leaveGrantMessage && (
              <span style={{ fontSize: 14, color: leaveGrantMessage.includes('失敗') ? '#dc2626' : '#059669', fontWeight: 500 }}>
                {leaveGrantMessage}
              </span>
            )}
          </div>
        </div>
        {/* 手動付与モーダル */}
        {showManualGrantModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', borderRadius: 14, padding: 28, minWidth: 340, maxWidth: 420, boxShadow: '0 4px 24px #0003' }}>
              <h3 style={{ fontWeight: 700, fontSize: 18, marginBottom: 18, color: '#222' }}>有休手動付与</h3>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 14, fontWeight: 500 }}>対象社員：
                  <select value={manualGrantUserId} onChange={e => setManualGrantUserId(e.target.value)} style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, width: '100%', marginTop: 4 }}>
                    {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}（{u.email}）</option>)}
                  </select>
                </label>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 14, fontWeight: 500 }}>年度：
                  <input type="number" value={manualGrantFiscalYear} onChange={e => setManualGrantFiscalYear(Number(e.target.value))} style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, width: 100 }} />
                </label>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 14, fontWeight: 500 }}>付与日数：
                  <input type="number" min={0} value={manualGrantDays} onChange={e => setManualGrantDays(Number(e.target.value))} style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, width: 80 }} />
                  <span style={{ fontSize: 13, color: '#888', marginLeft: 4 }}>日</span>
                </label>
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 14, fontWeight: 500 }}>繰越日数：
                  <input type="number" min={0} value={manualGrantCarried} onChange={e => setManualGrantCarried(Number(e.target.value))} style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, width: 80 }} />
                  <span style={{ fontSize: 13, color: '#888', marginLeft: 4 }}>日</span>
                </label>
              </div>
              {manualGrantError && <div style={{ color: '#dc2626', fontSize: 14, marginBottom: 8, fontWeight: 500 }}>{manualGrantError}</div>}
              {manualGrantSuccess && <div style={{ color: '#059669', fontSize: 14, marginBottom: 8, fontWeight: 500 }}>{manualGrantSuccess}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => { setShowManualGrantModal(false); setManualGrantError(''); setManualGrantSuccess(''); }} style={{ padding: '8px 20px', borderRadius: 8, background: '#eee', color: '#333', border: 'none', fontWeight: 'bold', fontSize: 15, cursor: 'pointer' }}>キャンセル</button>
                <button onClick={handleManualLeaveGrant} disabled={manualGrantLoading} style={{ padding: '8px 24px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: 15, cursor: 'pointer', opacity: manualGrantLoading ? 0.7 : 1 }}>
                  {manualGrantLoading ? '付与中...' : '付与する'}
                </button>
              </div>
            </div>
          </div>
        )}
        <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
          入社日が設定されているユーザーに対して、労基法39条に基づき勤続年数から自動計算して付与します（6ヶ月:10日〜6.5年以上:20日）。前年度の残日数は自動繰越されます。
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 800 }}>
            <thead>
              <tr style={{ background: '#f0fdf4' }}>
                <th style={{ borderBottom: '2px solid #bbf7d0', padding: 10, textAlign: 'left', fontWeight: 700 }}>社員名</th>
                <th style={{ borderBottom: '2px solid #bbf7d0', padding: 10, fontWeight: 700 }}>年度</th>
                <th style={{ borderBottom: '2px solid #bbf7d0', padding: 10, fontWeight: 700 }}>付与</th>
                <th style={{ borderBottom: '2px solid #bbf7d0', padding: 10, fontWeight: 700 }}>繰越</th>
                <th style={{ borderBottom: '2px solid #bbf7d0', padding: 10, fontWeight: 700 }}>消化</th>
                <th style={{ borderBottom: '2px solid #bbf7d0', padding: 10, fontWeight: 700, color: '#15803d' }}>残日数</th>
                <th style={{ borderBottom: '2px solid #bbf7d0', padding: 10, fontWeight: 700 }}>消化率</th>
                <th style={{ borderBottom: '2px solid #bbf7d0', padding: 10, fontWeight: 700 }}>年5日義務</th>
                <th style={{ borderBottom: '2px solid #bbf7d0', padding: 10, fontWeight: 700 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map(u => {
                const userBalances = leaveBalances
                  .filter((b: any) => b.userId === u.id)
                  .sort((a: any, b: any) => (b.fiscalYear || 0) - (a.fiscalYear || 0));
                if (userBalances.length === 0) {
                  return (
                    <tr key={u.id}>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10 }}>{u.name}</td>
                      <td colSpan={7} style={{ borderBottom: '1px solid #f3f4f6', padding: 10, color: '#888', fontSize: 13 }}>
                        {u.hireDate ? '未付与' : '入社日未設定'}
                      </td>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                        <button
                          onClick={() => { setManualGrantUserId(u.id); setShowManualGrantModal(true); }}
                          style={{ background: 'none', border: '1px solid #93c5fd', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: '#2563eb', cursor: 'pointer' }}
                        >付与</button>
                      </td>
                    </tr>
                  );
                }
                return userBalances.map((b: any, i: number) => {
                  const total = (b.granted || 0) + (b.carried || 0);
                  const remaining = total - (b.used || 0);
                  const usageRate = total > 0 ? Math.round(((b.used || 0) / total) * 100) : 0;
                  const isEditing = editingLeave?.id === b.id;
                  const el = isEditing ? editingLeave : null;
                  return (
                    <tr key={b.id} style={{ background: isEditing ? '#fffbeb' : undefined }}>
                      {i === 0 ? (
                        <td rowSpan={userBalances.length} style={{ borderBottom: '1px solid #f3f4f6', padding: 10, verticalAlign: 'top', fontWeight: 600 }}>{u.name}</td>
                      ) : null}
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>{b.fiscalYear}年度</td>
                      {/* 付与 */}
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                        {el ? (
                          <input
                            type="number" min="0" max="40" step="0.5"
                            value={el.granted}
                            onChange={e => setEditingLeave({ ...el, granted: Number(e.target.value) })}
                            style={{ width: 56, padding: '3px 4px', borderRadius: 4, border: '1px solid #f59e0b', fontSize: 13, textAlign: 'center' }}
                          />
                        ) : (
                          <span>{b.granted}日</span>
                        )}
                      </td>
                      {/* 繰越 */}
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                        {el ? (
                          <input
                            type="number" min="0" max="40" step="0.5"
                            value={el.carried}
                            onChange={e => setEditingLeave({ ...el, carried: Number(e.target.value) })}
                            style={{ width: 56, padding: '3px 4px', borderRadius: 4, border: '1px solid #f59e0b', fontSize: 13, textAlign: 'center' }}
                          />
                        ) : (
                          <span>{b.carried}日</span>
                        )}
                      </td>
                      {/* 消化 */}
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                        {el ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
                            <button
                              onClick={() => setEditingLeave({ ...el, used: Math.max(0, el.used - 0.5) })}
                              style={{ background: '#fee2e2', border: 'none', borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#dc2626' }}
                            >−</button>
                            <input
                              type="number" min="0" max="40" step="0.5"
                              value={el.used}
                              onChange={e => setEditingLeave({ ...el, used: Number(e.target.value) })}
                              style={{ width: 56, padding: '3px 4px', borderRadius: 4, border: '1px solid #f59e0b', fontSize: 13, textAlign: 'center' }}
                            />
                            <button
                              onClick={() => setEditingLeave({ ...el, used: el.used + 0.5 })}
                              style={{ background: '#dcfce7', border: 'none', borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#15803d' }}
                            >+</button>
                          </div>
                        ) : (
                          <span style={{ fontWeight: 600 }}>{b.used}日</span>
                        )}
                      </td>
                      {/* 残日数 */}
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center', fontWeight: 700, color: remaining <= 0 ? '#dc2626' : '#15803d' }}>
                        {el
                          ? `${(el.granted + el.carried - el.used)}日`
                          : `${remaining}日`
                        }
                      </td>
                      {/* 消化率 */}
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <div style={{ width: 60, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(100, el ? ((el.granted + el.carried) > 0 ? Math.round((el.used / (el.granted + el.carried)) * 100) : 0) : usageRate)}%`,
                              height: '100%',
                              background: usageRate >= 80 ? '#22c55e' : usageRate >= 50 ? '#f59e0b' : '#ef4444',
                              borderRadius: 3,
                              transition: 'width 0.3s',
                            }} />
                          </div>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>
                            {el
                              ? `${(el.granted + el.carried) > 0 ? Math.round((el.used / (el.granted + el.carried)) * 100) : 0}%`
                              : `${usageRate}%`
                            }
                          </span>
                        </div>
                      </td>
                      {/* 年5日義務 */}
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                        {(() => {
                          const totalGranted = (b.granted || 0) + (b.carried || 0);
                          const currentYear = new Date().getFullYear();
                          if (b.fiscalYear !== currentYear || totalGranted < 10) return <span style={{ color: '#ccc', fontSize: 12 }}>-</span>;
                          const used = b.used || 0;
                          if (used >= 5) return <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>達成</span>;
                          return <span style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>要取得 あと{5 - used}日</span>;
                        })()}
                      </td>
                      {/* 操作 */}
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                        {el ? (
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            <button
                              disabled={leaveUpdateLoading}
                              onClick={async () => {
                                setLeaveUpdateLoading(true);
                                try {
                                  await updateLeaveBalance(b.id, {
                                    granted: el.granted,
                                    used: el.used,
                                    carried: el.carried,
                                  });
                                  setLeaveBalances(prev => prev.map(lb => lb.id === b.id ? {
                                    ...lb,
                                    granted: el.granted,
                                    used: el.used,
                                    carried: el.carried,
                                  } : lb));
                                  setEditingLeave(null);
                                } catch (e) {
                                  if (import.meta.env.DEV) console.error('有休更新失敗:', e);
                                } finally {
                                  setLeaveUpdateLoading(false);
                                }
                              }}
                              style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: leaveUpdateLoading ? 0.7 : 1 }}
                            >
                              {leaveUpdateLoading ? '...' : '保存'}
                            </button>
                            <button
                              disabled={leaveUpdateLoading}
                              onClick={() => setEditingLeave(null)}
                              style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 4, padding: '3px 10px', fontSize: 12, color: '#6b7280', cursor: 'pointer' }}
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditingLeave({ id: b.id, granted: b.granted || 0, used: b.used || 0, carried: b.carried || 0 })}
                            style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 12px', fontSize: 12, color: '#2563eb', cursor: 'pointer', fontWeight: 500 }}
                          >
                            編集
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 36協定設定 */}
      <div style={sectionCardStyle}>
        <h2 style={sectionTitleStyle}>36協定</h2>
        <div style={{ fontSize: 14, color: '#555', lineHeight: 1.8 }}>
          <p style={{ margin: '0 0 8px' }}>ダッシュボードの法定外残業集計テーブルで自動チェックされます。</p>
          <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              <tr><td style={{ padding: '4px 12px', fontWeight: 600 }}>月次上限</td><td style={{ padding: '4px 12px' }}>45時間（警告: 36時間超）</td></tr>
              <tr><td style={{ padding: '4px 12px', fontWeight: 600 }}>年次上限</td><td style={{ padding: '4px 12px' }}>360時間（警告: 288時間超）</td></tr>
              <tr><td style={{ padding: '4px 12px', fontWeight: 600 }}>特別条項・月</td><td style={{ padding: '4px 12px' }}>100時間未満（警告: 80時間超）</td></tr>
              <tr><td style={{ padding: '4px 12px', fontWeight: 600 }}>特別条項・平均</td><td style={{ padding: '4px 12px' }}>2〜6ヶ月平均80時間以内（警告: 64時間超）</td></tr>
            </tbody>
          </table>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#888' }}>
            みなし労働時間制・管理監督者は対象外です。超過者はダッシュボード上部に警告パネルが表示されます。
          </p>
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

      {/* 代休・振休 残日数管理 */}
      <div style={sectionCardStyle}>
        <h2 style={sectionTitleStyle}>代休・振休 残日数管理</h2>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
          休日出勤申請の承認で「取得権利+1」、代休/振替休日申請の承認で「消化+1」が自動で加算されます。
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 500 }}>
            <thead>
              <tr style={{ background: '#eff6ff' }}>
                <th style={{ borderBottom: '2px solid #bfdbfe', padding: 10, textAlign: 'left', fontWeight: 700 }}>社員名</th>
                <th style={{ borderBottom: '2px solid #bfdbfe', padding: 10, fontWeight: 700 }}>取得権利</th>
                <th style={{ borderBottom: '2px solid #bfdbfe', padding: 10, fontWeight: 700 }}>消化</th>
                <th style={{ borderBottom: '2px solid #bfdbfe', padding: 10, fontWeight: 700, color: '#1e40af' }}>残日数</th>
                <th style={{ borderBottom: '2px solid #bfdbfe', padding: 10, fontWeight: 700 }}>調整</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map(u => {
                const bal = compensatoryBalances.find((b: any) => b.userId === u.id);
                const earned = bal ? (bal as any).earned || 0 : 0;
                const used = bal ? (bal as any).used || 0 : 0;
                const remaining = earned - used;
                return (
                  <tr key={u.id}>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, fontWeight: 600 }}>{u.name}</td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>{earned}日</td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>{used}日</td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center', fontWeight: 700, color: remaining <= 0 ? '#dc2626' : '#1e40af' }}>{remaining}日</td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                      {bal ? (
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button
                            onClick={async () => {
                              const val = window.prompt('取得権利数を入力してください', String(earned));
                              if (val === null) return;
                              const n = Number(val);
                              if (isNaN(n) || n < 0) return;
                              await updateCompensatoryBalance(bal.id, { earned: n });
                              setCompensatoryBalances(prev => prev.map(b => b.id === bal.id ? { ...b, earned: n } : b));
                            }}
                            style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 6px', fontSize: 11, color: '#6b7280', cursor: 'pointer' }}
                          >取得</button>
                          <button
                            onClick={async () => {
                              const val = window.prompt('消化数を入力してください', String(used));
                              if (val === null) return;
                              const n = Number(val);
                              if (isNaN(n) || n < 0) return;
                              await updateCompensatoryBalance(bal.id, { used: n });
                              setCompensatoryBalances(prev => prev.map(b => b.id === bal.id ? { ...b, used: n } : b));
                            }}
                            style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 6px', fontSize: 11, color: '#6b7280', cursor: 'pointer' }}
                          >消化</button>
                        </div>
                      ) : (
                        <span style={{ color: '#ccc', fontSize: 12 }}>記録なし</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 通知設定 */}
      <div style={sectionCardStyle}>
        <h2 style={sectionTitleStyle}>通知設定（メール）</h2>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
          申請・承認時にメールでも通知を送信します。<a href="https://resend.com" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>Resend</a> のAPIキーが必要です。
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 480 }}>
          <div>
            <label style={{ fontSize: 14, fontWeight: 500 }}>通知先メールアドレス：
              <input
                type="email"
                value={notificationEmail}
                onChange={e => setNotificationEmail(e.target.value)}
                placeholder="admin@example.com"
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
              />
            </label>
          </div>
          <div>
            <label style={{ fontSize: 14, fontWeight: 500 }}>Resend APIキー：
              <input
                type="password"
                value={resendApiKey}
                onChange={e => setResendApiKey(e.target.value)}
                placeholder="re_xxxxxxxxxx"
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              disabled={notifSaving}
              onClick={async () => {
                setNotifSaving(true);
                setNotifMessage('');
                try {
                  await updateCompanySettings({ notificationEmail, resendApiKey } as any);
                  setNotifMessage('保存しました');
                } catch {
                  setNotifMessage('保存に失敗しました');
                } finally {
                  setNotifSaving(false);
                  setTimeout(() => setNotifMessage(''), 3000);
                }
              }}
              style={{ background: '#2563eb', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 14, cursor: 'pointer', opacity: notifSaving ? 0.7 : 1 }}
            >{notifSaving ? '保存中...' : '保存'}</button>
            <button
              disabled={notifTestLoading || !notificationEmail || !resendApiKey}
              onClick={async () => {
                setNotifTestLoading(true);
                setNotifTestMessage('');
                try {
                  const res = await fetch('/api/notify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      title: 'テスト通知',
                      message: 'だこくんからのテスト通知です。このメールが届いていれば設定は正常です。',
                      emailTo: notificationEmail,
                      resendApiKey,
                    }),
                  });
                  const data = await res.json();
                  setNotifTestMessage(data.success ? 'テストメール送信成功！' : `送信失敗: ${data.error || JSON.stringify(data.data)}`);
                } catch (e: any) {
                  setNotifTestMessage(`エラー: ${e.message}`);
                } finally {
                  setNotifTestLoading(false);
                  setTimeout(() => setNotifTestMessage(''), 5000);
                }
              }}
              style={{ background: '#f3f4f6', color: '#333', fontWeight: 'bold', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 20px', fontSize: 14, cursor: 'pointer', opacity: (!notificationEmail || !resendApiKey) ? 0.5 : 1 }}
            >{notifTestLoading ? '送信中...' : 'テスト送信'}</button>
            {notifMessage && <span style={{ fontSize: 14, color: notifMessage.includes('失敗') ? '#dc2626' : '#059669', fontWeight: 500 }}>{notifMessage}</span>}
            {notifTestMessage && <span style={{ fontSize: 14, color: notifTestMessage.includes('成功') ? '#059669' : '#dc2626', fontWeight: 500 }}>{notifTestMessage}</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
