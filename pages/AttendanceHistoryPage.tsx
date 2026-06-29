import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getAttendancesByUser, createRequest, getCompanySettings, getApprovedLeaveDates } from '../firebase/attendance';
import dayjs from 'dayjs';

const getWorkDuration = (clockIn: any, clockOut: any) => {
  if (!clockIn?.toDate || !clockOut?.toDate) return '';
  const start = clockIn.toDate();
  const end = clockOut.toDate();
  const diffMs = end - start;
  let diffH = diffMs / (1000 * 60 * 60);
  // 労基法準拠の休憩控除（6h超→45分、8h超→1時間）
  if (diffH > 8) diffH -= 1;
  else if (diffH > 6) diffH -= 0.75;
  return diffH.toFixed(2) + ' h';
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
  background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const modalCardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 12, boxShadow: '0 2px 16px #0003',
  padding: 32, minWidth: 340, maxWidth: '90vw', width: 420,
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

function calculateLateNightHours(clockIn: any, clockOut: any): number {
  if (!clockIn?.toDate || !clockOut?.toDate) return 0;
  const start = clockIn.toDate().getTime();
  const end = clockOut.toDate().getTime();
  if (end <= start) return 0;
  let totalMs = 0;
  const startDate = new Date(start);
  const baseDate = new Date(startDate);
  baseDate.setHours(0, 0, 0, 0);
  baseDate.setDate(baseDate.getDate() - 1);
  for (let d = new Date(baseDate); d.getTime() < end + 24 * 60 * 60 * 1000; d.setDate(d.getDate() + 1)) {
    const nightStart = new Date(d); nightStart.setHours(22, 0, 0, 0);
    const nightEnd = new Date(d); nightEnd.setDate(nightEnd.getDate() + 1); nightEnd.setHours(5, 0, 0, 0);
    const overlapStart = Math.max(start, nightStart.getTime());
    const overlapEnd = Math.min(end, nightEnd.getTime());
    if (overlapEnd > overlapStart) totalMs += overlapEnd - overlapStart;
  }
  return totalMs / (1000 * 60 * 60);
}

function detectLateEarly(clockIn: any, clockOut: any, standardStart: string, standardEnd: string): { late: number; early: number } {
  const result = { late: 0, early: 0 };
  if (!standardStart || !standardEnd) return result;
  if (clockIn?.toDate) {
    const inDate = clockIn.toDate();
    const [sh, sm] = standardStart.split(':').map(Number);
    const startMinutes = sh * 60 + sm;
    const inMinutes = inDate.getHours() * 60 + inDate.getMinutes();
    if (inMinutes > startMinutes) result.late = inMinutes - startMinutes;
  }
  if (clockOut?.toDate) {
    const outDate = clockOut.toDate();
    const [eh, em] = standardEnd.split(':').map(Number);
    const endMinutes = eh * 60 + em;
    const outMinutes = outDate.getHours() * 60 + outDate.getMinutes();
    if (outMinutes < endMinutes) result.early = endMinutes - outMinutes;
  }
  return result;
}

// 締め日を考慮した期間を計算
function getClosingPeriod(year: number, month: number, closingDay: number): { start: string; end: string; label: string } {
  if (closingDay >= 28) {
    // 月末締め
    const lastDay = new Date(year, month, 0).getDate();
    return {
      start: `${year}-${String(month).padStart(2, '0')}-01`,
      end: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      label: `${year}年${month}月分（${month}/1〜${month}/${lastDay}）`,
    };
  }
  // 締め日が月中の場合: 前月(closingDay+1)日 〜 当月closingDay日
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const startDay = closingDay + 1;
  return {
    start: `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`,
    end: `${year}-${String(month).padStart(2, '0')}-${String(closingDay).padStart(2, '0')}`,
    label: `${year}年${month}月分（${prevMonth}/${startDay}〜${month}/${closingDay}）`,
  };
}

// 期間内の全日付を生成
function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let current = dayjs(start);
  const endDate = dayjs(end);
  while (current.isBefore(endDate) || current.format('YYYY-MM-DD') === endDate.format('YYYY-MM-DD')) {
    dates.push(current.format('YYYY-MM-DD'));
    current = current.add(1, 'day');
  }
  return dates;
}

const dayOfWeekLabels = ['日', '月', '火', '水', '木', '金', '土'];

const AttendanceHistoryPage: React.FC = () => {
  const { user } = useAuth();
  const [attendances, setAttendances] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [standardStartTime, setStandardStartTime] = useState('');
  const [standardEndTime, setStandardEndTime] = useState('');
  const [approvedLeaveDates, setApprovedLeaveDates] = useState<Map<string, string>>(new Map());
  const [closingDay, setClosingDay] = useState(10);

  // 表示月管理（year, month）— closingDay取得後に補正
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [initialAdjusted, setInitialAdjusted] = useState(false);

  // 修正申請モーダル用
  const [showModal, setShowModal] = useState(false);
  const [correctionDate, setCorrectionDate] = useState('');
  const [correctionClockIn, setCorrectionClockIn] = useState('');
  const [correctionClockOut, setCorrectionClockOut] = useState('');
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
    getCompanySettings().then(s => {
      setStandardStartTime(s.standardStartTime || '');
      setStandardEndTime(s.standardEndTime || '');
      setClosingDay(s.closingDay || 10);
    });
    if (user) {
      getApprovedLeaveDates(user.uid).then(setApprovedLeaveDates);
    }
  }, [user]);

  // closingDay取得後に今月の表示期間を補正
  useEffect(() => {
    if (initialAdjusted) return;
    if (closingDay < 28 && now.getDate() > closingDay) {
      let m = now.getMonth() + 1;
      let y = now.getFullYear();
      if (m === 12) { y += 1; m = 1; } else { m += 1; }
      setViewYear(y);
      setViewMonth(m);
    }
    setInitialAdjusted(true);
  }, [closingDay]);

  // 月移動
  const goToPrevMonth = () => {
    if (viewMonth === 1) { setViewYear(viewYear - 1); setViewMonth(12); }
    else setViewMonth(viewMonth - 1);
  };
  const goToNextMonth = () => {
    if (viewMonth === 12) { setViewYear(viewYear + 1); setViewMonth(1); }
    else setViewMonth(viewMonth + 1);
  };
  const goToCurrentMonth = () => {
    let m = now.getMonth() + 1;
    let y = now.getFullYear();
    if (closingDay < 28 && now.getDate() > closingDay) {
      if (m === 12) { y += 1; m = 1; } else { m += 1; }
    }
    setViewYear(y);
    setViewMonth(m);
  };

  // 期間計算
  const period = getClosingPeriod(viewYear, viewMonth, closingDay);
  const datesInPeriod = getDatesInRange(period.start, period.end);

  // 日付→勤怠レコードのマップ
  const attendanceMap = new Map<string, any>();
  attendances.forEach(a => {
    if (a.date) attendanceMap.set(a.date, a);
  });

  // CSV用（表示期間のレコードのみ）
  const periodAttendances = attendances.filter(a => a.date >= period.start && a.date <= period.end);

  // モーダルを開く
  const openCorrectionModal = (date: string) => {
    const record = attendanceMap.get(date);
    setCorrectionDate(date);
    setCorrectionClockIn(record?.clockIn?.toDate ? dayjs(record.clockIn.toDate()).format('HH:mm') : '');
    setCorrectionClockOut(record?.clockOut?.toDate ? dayjs(record.clockOut.toDate()).format('HH:mm') : '');
    setCorrectionReason('');
    setCorrectionError('');
    setCorrectionSuccess(false);
    setShowModal(true);
  };

  // 修正申請送信（出勤・退勤をまとめて送信）
  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    setCorrectionLoading(true);
    setCorrectionError('');
    try {
      if (!user) throw new Error('ユーザー情報が取得できません');
      if (!correctionClockIn && !correctionClockOut) throw new Error('出勤時刻または退勤時刻を入力してください');
      if (!correctionReason) throw new Error('理由を入力してください');
      if (correctionReason.length > 500) throw new Error('理由は500文字以内で入力してください');
      const timeRegex = /^\d{2}:\d{2}$/;
      if (correctionClockIn && !timeRegex.test(correctionClockIn)) throw new Error('出勤時刻は HH:MM 形式で入力してください');
      if (correctionClockOut && !timeRegex.test(correctionClockOut)) throw new Error('退勤時刻は HH:MM 形式で入力してください');

      const record = attendanceMap.get(correctionDate);
      const existingIn = record?.clockIn?.toDate ? dayjs(record.clockIn.toDate()).format('HH:mm') : '';
      const existingOut = record?.clockOut?.toDate ? dayjs(record.clockOut.toDate()).format('HH:mm') : '';

      // 出勤が変わった場合に申請
      if (correctionClockIn && correctionClockIn !== existingIn) {
        await createRequest({
          userId: user.uid,
          userName: user.name || user.email || '名無し',
          supervisorId: user.supervisorId || '',
          type: '打刻修正（出勤）',
          date: correctionDate,
          requestedTime: correctionClockIn,
          reason: correctionReason,
        });
      }
      // 退勤が変わった場合に申請
      if (correctionClockOut && correctionClockOut !== existingOut) {
        await createRequest({
          userId: user.uid,
          userName: user.name || user.email || '名無し',
          supervisorId: user.supervisorId || '',
          type: '打刻修正（退勤）',
          date: correctionDate,
          requestedTime: correctionClockOut,
          reason: correctionReason,
        });
      }

      setCorrectionSuccess(true);
    } catch (e: any) {
      setCorrectionError(e.message || '申請に失敗しました');
    } finally {
      setCorrectionLoading(false);
    }
  };

  const today = dayjs().format('YYYY-MM-DD');

  return (
    <div style={{ maxWidth: 900, margin: '32px auto', padding: '0 16px' }}>
      <div style={{ marginBottom: 18 }}>
        <Link to="/" style={{ color: '#2563eb', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
          &larr; ダッシュボードに戻る
        </Link>
      </div>
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px #0001', padding: 24 }}>
        {/* ヘッダー: タイトル + 月ナビ + CSV */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ fontWeight: 'bold', fontSize: 22, color: '#222', margin: 0 }}>出退勤履歴</h2>
          {periodAttendances.length > 0 && (
            <button
              onClick={() => exportAttendancesCSV(periodAttendances, user?.name || user?.email || '')}
              style={{ background: '#22c55e', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 14, cursor: 'pointer' }}
            >CSV出力</button>
          )}
        </div>

        {/* 月ナビゲーション */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, margin: '16px 0 20px' }}>
          <button onClick={goToPrevMonth} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            &larr; 前月
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#222' }}>{period.label}</div>
            <div style={{ fontSize: 12, color: '#888' }}>締め日: 毎月{closingDay >= 28 ? '末' : closingDay}日</div>
          </div>
          <button onClick={goToNextMonth} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            次月 &rarr;
          </button>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <button onClick={goToCurrentMonth} style={{ background: 'none', border: '1px solid #93c5fd', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12, color: '#2563eb', fontWeight: 500 }}>
            今月に戻る
          </button>
        </div>

        {/* カレンダー */}
        {isLoading ? (
          <div style={{ color: '#888', fontSize: 15, textAlign: 'center', padding: 32 }}>読み込み中...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: '8px 6px', textAlign: 'center', fontWeight: 700, width: 100 }}>日付</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: '8px 6px', textAlign: 'center', fontWeight: 700 }}>出勤</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: '8px 6px', textAlign: 'center', fontWeight: 700 }}>退勤</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: '8px 6px', textAlign: 'center', fontWeight: 700 }}>労働時間</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#7c3aed' }}>深夜</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: '8px 6px', textAlign: 'center', fontWeight: 700 }}>残業</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: '8px 6px', textAlign: 'center', fontWeight: 700 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {datesInPeriod.map(date => {
                  const d = dayjs(date);
                  const dow = d.day();
                  const dowLabel = dayOfWeekLabels[dow];
                  const isWeekend = dow === 0 || dow === 6;
                  const isToday = date === today;
                  const isFuture = date > today;
                  const record = attendanceMap.get(date);
                  const leaveType = approvedLeaveDates.get(date); // '終日' | '午前半休' | '午後半休' | undefined
                  const isLeaveDay = !!leaveType;
                  const isFullLeave = leaveType === '終日';
                  const isHalfLeave = leaveType === '午前半休' || leaveType === '午後半休';

                  const hasClockIn = !!record?.clockIn;
                  const hasClockOut = !!record?.clockOut;
                  const isMissingBoth = !hasClockIn && !hasClockOut && !isWeekend && !isFuture && !isFullLeave;
                  const isMissingClockOut = hasClockIn && !hasClockOut && !isFuture && !isFullLeave;

                  const lateEarly = record ? detectLateEarly(record.clockIn, record.clockOut, standardStartTime, standardEndTime) : { late: 0, early: 0 };

                  // 行の背景色
                  let rowBg: string | undefined;
                  if (isToday) rowBg = '#eff6ff';
                  else if (isFullLeave) rowBg = '#f0fdf4';
                  else if (isHalfLeave && hasClockIn && hasClockOut) rowBg = '#f0fdf4';
                  else if (isMissingBoth && !isHalfLeave) rowBg = '#fef2f2';
                  else if (isHalfLeave) rowBg = '#fffbeb';
                  else if (isMissingClockOut) rowBg = '#fffbeb';
                  else if (isWeekend) rowBg = '#f9fafb';

                  return (
                    <tr key={date} style={{ background: rowBg }}>
                      {/* 日付 */}
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 6px', textAlign: 'center', fontWeight: isToday ? 700 : 400 }}>
                        <span style={{ color: dow === 0 ? '#dc2626' : dow === 6 ? '#2563eb' : '#222' }}>
                          {d.format('M/D')}
                        </span>
                        <span style={{ fontSize: 11, color: dow === 0 ? '#dc2626' : dow === 6 ? '#2563eb' : '#888', marginLeft: 2 }}>
                          ({dowLabel})
                        </span>
                        {isToday && <span style={{ background: '#2563eb', color: '#fff', borderRadius: 4, padding: '0px 4px', fontSize: 9, fontWeight: 700, marginLeft: 4 }}>今日</span>}
                      </td>
                      {/* 出勤 */}
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 6px', textAlign: 'center' }}>
                        {isFullLeave ? (
                          <span style={{ color: '#15803d', fontSize: 12, fontWeight: 600 }}>有休</span>
                        ) : isHalfLeave && !hasClockIn ? (
                          <span>
                            <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>{leaveType}</span>
                            {leaveType === '午後半休' && <span style={{ color: '#dc2626', fontSize: 11, fontWeight: 600, marginLeft: 4 }}>未打刻</span>}
                          </span>
                        ) : hasClockIn ? (
                          <span>
                            {record.clockIn.toDate().toLocaleTimeString()}
                            {lateEarly.late > 0 && (
                              <span style={{ background: '#fbbf24', color: '#92400e', borderRadius: 4, padding: '1px 4px', fontSize: 10, fontWeight: 700, marginLeft: 4 }}>
                                遅刻{lateEarly.late}分
                              </span>
                            )}
                          </span>
                        ) : isFuture || isWeekend ? (
                          <span style={{ color: '#ccc' }}>-</span>
                        ) : (
                          <span style={{ color: '#dc2626', fontSize: 11, fontWeight: 600 }}>未打刻</span>
                        )}
                      </td>
                      {/* 退勤 */}
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 6px', textAlign: 'center' }}>
                        {isFullLeave ? (
                          <span style={{ color: '#15803d', fontSize: 12, fontWeight: 600 }}>-</span>
                        ) : isHalfLeave && !hasClockOut ? (
                          <span>
                            <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>{leaveType}</span>
                            {leaveType === '午前半休' && <span style={{ color: '#dc2626', fontSize: 11, fontWeight: 600, marginLeft: 4 }}>未打刻</span>}
                          </span>
                        ) : hasClockOut ? (
                          <span>
                            {record.clockOut.toDate().toLocaleTimeString()}
                            {lateEarly.early > 0 && (
                              <span style={{ background: '#fb923c', color: '#7c2d12', borderRadius: 4, padding: '1px 4px', fontSize: 10, fontWeight: 700, marginLeft: 4 }}>
                                早退{lateEarly.early}分
                              </span>
                            )}
                          </span>
                        ) : isFuture || isWeekend ? (
                          <span style={{ color: '#ccc' }}>-</span>
                        ) : isMissingClockOut ? (
                          <span style={{ background: '#dc2626', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>打刻漏れ</span>
                        ) : (
                          <span style={{ color: '#dc2626', fontSize: 11, fontWeight: 600 }}>未打刻</span>
                        )}
                      </td>
                      {/* 労働時間 */}
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 6px', textAlign: 'center', fontSize: 13 }}>
                        {record ? getWorkDuration(record.clockIn, record.clockOut) || '-' : '-'}
                      </td>
                      {/* 深夜 */}
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 6px', textAlign: 'center', color: '#7c3aed', fontSize: 13 }}>
                        {record ? (() => { const nh = calculateLateNightHours(record.clockIn, record.clockOut); return nh > 0 ? nh.toFixed(2) + ' h' : '-'; })() : '-'}
                      </td>
                      {/* 残業 */}
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 6px', textAlign: 'center', fontSize: 13 }}>
                        {record?.overtime ? <span style={{ color: '#b45309', fontWeight: 700 }}>{record.overtime}</span> : '-'}
                      </td>
                      {/* 操作 */}
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 6px', textAlign: 'center' }}>
                        {!isFuture && !isFullLeave && (
                          <button
                            onClick={() => openCorrectionModal(date)}
                            style={{
                              background: isMissingBoth ? '#fef2f2' : 'none',
                              border: isMissingBoth ? '1px solid #fca5a5' : '1px solid #d1d5db',
                              borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12,
                              color: isMissingBoth ? '#dc2626' : '#6b7280', fontWeight: isMissingBoth ? 600 : 400,
                            }}
                          >
                            {isMissingBoth ? '打刻入力' : '修正'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 打刻修正モーダル */}
      {showModal && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle}>
            <h2 style={{ fontWeight: 'bold', fontSize: 20, marginBottom: 16 }}>打刻修正・入力</h2>
            <div style={{ background: '#f3f4f6', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14, color: '#555' }}>
              対象日: <strong>{correctionDate}</strong>（{dayOfWeekLabels[dayjs(correctionDate).day()]}）
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
                <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#555' }}>出勤時刻</label>
                    <input
                      type="time"
                      value={correctionClockIn}
                      onChange={e => setCorrectionClockIn(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 15 }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#555' }}>退勤時刻</label>
                    <input
                      type="time"
                      value={correctionClockOut}
                      onChange={e => setCorrectionClockOut(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 15 }}
                    />
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#555' }}>理由</label>
                  <textarea
                    value={correctionReason}
                    onChange={e => setCorrectionReason(e.target.value)}
                    style={{ width: '100%', minHeight: 60, borderRadius: 6, border: '1px solid #d1d5db', padding: '8px 10px', fontSize: 14 }}
                    placeholder="例：打刻忘れのため"
                    required
                  />
                </div>
                {correctionError && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: 14 }}>{correctionError}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    style={{ padding: '8px 20px', borderRadius: 8, background: '#f3f4f6', color: '#333', border: 'none', fontWeight: 'bold', fontSize: 15, cursor: 'pointer' }}
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
