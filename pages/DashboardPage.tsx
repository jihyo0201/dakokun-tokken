import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { clockIn, clockOut, getAllAttendances, createRequest, getRequestsByUser, getRequestsBySupervisor, updateRequestStatus, createNotification, getAttendancesBySubordinates, applyClockCorrection, applyOvertimeApproval, getCompanySettings, updateCompanySettings, getAttendancesByUser, deleteAttendance } from '../firebase/attendance';
import { getAllUsers, updateUserRole, updateUserSupervisor, updateUserWorkSchedule } from '../firebase/auth';
import dayjs from 'dayjs';

// 労基法準拠の休憩控除（6h超→45分、8h超→1時間）
function applyBreakDeduction(rawHours: number): number {
  if (rawHours > 8) return rawHours - 1;
  if (rawHours > 6) return rawHours - 0.75;
  return rawHours;
}

const getWorkDuration = (clockIn: any, clockOut: any, scheduleType?: string, deemedHours?: number) => {
  if (!clockIn?.toDate || !clockOut?.toDate) return '';
  if (scheduleType === 'deemed') return (deemedHours ?? 8).toFixed(2) + ' h';
  const start = clockIn.toDate();
  const end = clockOut.toDate();
  const rawH = (end - start) / (1000 * 60 * 60);
  return applyBreakDeduction(rawH).toFixed(2) + ' h';
};

const cardStyle: React.CSSProperties = {
  maxWidth: 760, // 幅を少し狭く
  margin: '24px auto', // 上下余白を減らす
  background: '#fff',
  borderRadius: 14,
  boxShadow: '0 2px 12px #0001',
  padding: 18, // paddingを減らす
  display: 'flex',
  gap: 20, // カラム間のgapを減らす
  flexDirection: 'row',
  alignItems: 'flex-start',
};

const leftColStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 220,
};
const rightColStyle: React.CSSProperties = {
  flex: 2,
  minWidth: 280,
};

// スマホ用レスポンシブ
const responsiveStyle = `
@media (max-width: 800px) {
  .dashboard-flex {
    flex-direction: column !important;
    gap: 14px !important;
  }
  .dashboard-table {
    font-size: 13px !important;
  }
}
`;

// デジタル時計用のカスタムフック
function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

// タイムレコーダーカードの新しいスタイル
const recorderCardStyle: React.CSSProperties = {
  maxWidth: 520,
  margin: '32px auto 0',
  background: '#fff',
  borderRadius: 16,
  boxShadow: '0 2px 16px #0002',
  padding: '32px 32px 24px 32px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 0,
};
const recorderButtonRow: React.CSSProperties = {
  display: 'flex',
  width: '100%',
  gap: 0,
  margin: '24px 0 0 0',
};
const recorderButton: React.CSSProperties = {
  flex: 1,
  fontWeight: 'bold',
  fontSize: 18,
  border: 'none',
  borderRadius: 8,
  padding: '16px 0',
  cursor: 'pointer',
  transition: 'background 0.2s',
};
const clockBoxStyle: React.CSSProperties = {
  fontWeight: 'bold',
  fontSize: 40,
  color: '#2563eb',
  textAlign: 'center',
  letterSpacing: 2,
  margin: '0 0 4px 0',
};
const dateBoxStyle: React.CSSProperties = {
  textAlign: 'center',
  color: '#888',
  fontSize: 16,
  marginBottom: 18,
};
const todayBoxStyle: React.CSSProperties = {
  background: '#f3f4f6',
  borderRadius: 8,
  padding: 18,
  marginTop: 24,
  width: '100%',
  textAlign: 'left',
};


// 申請フォーム用のシンプルなモーダルUI
const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
};
const modalCardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 12, boxShadow: '0 2px 16px #0003', padding: 32, minWidth: 340, maxWidth: '90vw', width: 400
};

// CSV出力ユーティリティ
function escapeCSVField(value: string): string {
  const str = String(value ?? '');
  // Excel数式インジェクション対策: 先頭が危険な文字の場合はシングルクォートを前置
  const sanitized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  // カンマ・ダブルクォート・改行を含む場合はダブルクォートで囲む
  if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

function getWorkHours(clockIn: any, clockOut: any, scheduleType?: string, deemedHours?: number): number {
  if (!clockIn?.toDate || !clockOut?.toDate) return scheduleType === 'deemed' ? (deemedHours ?? 8) : 0;
  if (scheduleType === 'deemed') return deemedHours ?? 8;
  const start = clockIn.toDate();
  const end = clockOut.toDate();
  const raw = (end - start) / (1000 * 60 * 60);
  return applyBreakDeduction(raw);
}

// --- 法定外残業算出ユーティリティ ---

// 日本の祝日を取得（年指定）
function getJapaneseHolidays(year: number): Set<string> {
  const holidays = new Set<string>();
  const fmt = (m: number, d: number) => `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // 固定祝日
  holidays.add(fmt(1, 1));   // 元日
  holidays.add(fmt(2, 11));  // 建国記念の日
  holidays.add(fmt(2, 23));  // 天皇誕生日
  holidays.add(fmt(4, 29));  // 昭和の日
  holidays.add(fmt(5, 3));   // 憲法記念日
  holidays.add(fmt(5, 4));   // みどりの日
  holidays.add(fmt(5, 5));   // こどもの日
  holidays.add(fmt(8, 11));  // 山の日
  holidays.add(fmt(11, 3));  // 文化の日
  holidays.add(fmt(11, 23)); // 勤労感謝の日
  // 第n月曜日の祝日
  const nthMonday = (month: number, n: number) => {
    const first = new Date(year, month - 1, 1);
    const firstMonday = ((8 - first.getDay()) % 7) + 1;
    return firstMonday + (n - 1) * 7;
  };
  holidays.add(fmt(1, nthMonday(1, 2)));   // 成人の日
  holidays.add(fmt(7, nthMonday(7, 3)));   // 海の日
  holidays.add(fmt(9, nthMonday(9, 3)));   // 敬老の日
  holidays.add(fmt(10, nthMonday(10, 2))); // スポーツの日
  // 春分・秋分（近似計算）
  const springEquinox = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  holidays.add(fmt(3, springEquinox));
  const autumnEquinox = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  holidays.add(fmt(9, autumnEquinox));
  // 振替休日（祝日が日曜なら月曜が振替）
  const toAdd: string[] = [];
  holidays.forEach(h => {
    const d = new Date(h + 'T00:00:00');
    if (d.getDay() === 0) {
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      toAdd.push(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`);
    }
  });
  toAdd.forEach(h => holidays.add(h));
  return holidays;
}

// 期間内の所定労働日数を算出（土日祝除外）
function getBusinessDays(startDate: string, endDate: string): number {
  let count = 0;
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const holidays = new Set<string>();
  for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
    getJapaneseHolidays(y).forEach(h => holidays.add(h));
  }
  const current = new Date(start);
  while (current <= end) {
    const day = current.getDay();
    const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
    if (day !== 0 && day !== 6 && !holidays.has(dateStr)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

// 週の月曜日キーを取得
function getWeekMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = (day + 6) % 7; // 月曜=0, 日曜=6
  const monday = new Date(d);
  monday.setDate(d.getDate() - diff);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

// 週の日曜日を取得
function getWeekSunday(mondayStr: string): string {
  const d = new Date(mondayStr + 'T00:00:00');
  d.setDate(d.getDate() + 6);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 勤務区分の日本語ラベル
const WORK_SCHEDULE_LABELS: Record<string, string> = {
  regular: '通常勤務',
  deemed: 'みなし労働時間制',
  managerial: '管理監督者',
  short_flex: '時短勤務+フレックス',
};

// 法定外残業集計を算出
function calculateOvertimeSummary(records: any[], periodStart: string, periodEnd: string, usersMap: Record<string, any> = {}) {
  // 社員ごとにグループ化
  const byEmployee: Record<string, { userName: string; records: any[] }> = {};
  records.forEach(r => {
    const key = r.userId || r.userName;
    if (!byEmployee[key]) byEmployee[key] = { userName: r.userName, records: [] };
    byEmployee[key].records.push(r);
  });

  const businessDays = getBusinessDays(periodStart, periodEnd);

  return Object.entries(byEmployee).map(([userId, { userName, records: recs }]) => {
    const userInfo = usersMap[userId] || {};
    const scheduleType = userInfo.workScheduleType || 'regular';
    const deemedH = userInfo.deemedHours ?? 8;
    const dailyPrescribed = scheduleType === 'short_flex' ? (userInfo.prescribedDailyHours ?? 6) : 8;
    const dailyThreshold = 8; // 法定外は一律8h基準
    const weeklyThreshold = 40; // 法定外は一律40h基準
    const prescribedMonthlyHours = businessDays * dailyPrescribed; // 所定時間は社員の所定時間ベース
    const legalOvertimeMonthlyThreshold = businessDays * 8; // 法定外判定は8hベース
    const isExempt = scheduleType === 'deemed' || scheduleType === 'managerial';

    // 日ごとの労働時間
    const dailyHours: Record<string, number> = {};
    recs.forEach(r => {
      const h = getWorkHours(r.clockIn, r.clockOut, scheduleType, deemedH);
      dailyHours[r.date] = (dailyHours[r.date] || 0) + h;
    });

    // 残業対象外の場合はスキップ
    let dailyOvertime = 0;
    let weeklyOvertime = 0;
    let monthlyOvertime = 0;
    const weeklyHours: Record<string, number> = {};

    if (!isExempt) {
      // 日の法定外
      Object.values(dailyHours).forEach(h => {
        if (h > dailyThreshold) dailyOvertime += h - dailyThreshold;
      });

      // 週ごとの集計
      Object.entries(dailyHours).forEach(([date, h]) => {
        const week = getWeekMonday(date);
        weeklyHours[week] = (weeklyHours[week] || 0) + h;
      });

      // 週の法定外（日の法定外と重複しない分のみ）
      Object.entries(weeklyHours).forEach(([week, totalH]) => {
        if (totalH > weeklyThreshold) {
          let weekDailyOT = 0;
          Object.entries(dailyHours).forEach(([date, dh]) => {
            if (getWeekMonday(date) === week && dh > dailyThreshold) weekDailyOT += dh - dailyThreshold;
          });
          const weekOT = totalH - weeklyThreshold - weekDailyOT;
          if (weekOT > 0) weeklyOvertime += weekOT;
        }
      });

      // 月の法定外
      const totalH = Object.values(dailyHours).reduce((s, h) => s + h, 0);
      monthlyOvertime = Math.max(0, totalH - legalOvertimeMonthlyThreshold);
    } else {
      // 対象外でも週別表示用に集計
      Object.entries(dailyHours).forEach(([date, h]) => {
        const week = getWeekMonday(date);
        weeklyHours[week] = (weeklyHours[week] || 0) + h;
      });
    }

    const totalHours = Object.values(dailyHours).reduce((s, h) => s + h, 0);

    const weekDetails = Object.entries(weeklyHours)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monday, h]) => ({
        week: `${monday.slice(5)} 〜 ${getWeekSunday(monday).slice(5)}`,
        hours: h,
        overtime: isExempt ? 0 : Math.max(0, h - weeklyThreshold),
      }));

    return {
      userId, userName, totalHours, dailyOvertime, weeklyOvertime, monthlyOvertime,
      prescribedMonthlyHours, businessDays, weekDetails,
      workScheduleType: scheduleType, isOvertimeExempt: isExempt,
    };
  }).sort((a, b) => a.userName.localeCompare(b.userName));
}

// 締め日に基づく期間を計算する（例: 10日締め → 前月11日〜当月10日）
function getClosingPeriod(yearMonth: string, closingDay: number): { start: string; end: string; label: string } {
  const [year, month] = yearMonth.split('-').map(Number);

  if (closingDay >= 28) {
    // 末日締め扱い
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end, label: `${year}年${month}月分（${month}/1〜${month}/${lastDay}）` };
  }

  // 前月の(closingDay+1)日 〜 当月のclosingDay日
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const startDay = closingDay + 1;
  const start = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
  const end = `${year}-${String(month).padStart(2, '0')}-${String(closingDay).padStart(2, '0')}`;
  return { start, end, label: `${year}年${month}月分（${prevMonth}/${startDay}〜${month}/${closingDay}）` };
}

function filterByClosingPeriod(records: any[], yearMonth: string, closingDay: number): any[] {
  const { start, end } = getClosingPeriod(yearMonth, closingDay);
  return records.filter(r => r.date >= start && r.date <= end);
}

function exportMonthlyCSV(records: any[], yearMonth: string, closingDay: number, usersMap: Record<string, any> = {}) {
  const { label } = getClosingPeriod(yearMonth, closingDay);
  const filtered = filterByClosingPeriod(records, yearMonth, closingDay);

  // 社員ごとに集計
  const summaryMap: Record<string, { userName: string; totalHours: number; days: number; scheduleLabel: string }> = {};
  filtered.forEach(r => {
    const key = r.userId || r.userName;
    const userInfo = usersMap[key] || {};
    const scheduleType = userInfo.workScheduleType || 'regular';
    if (!summaryMap[key]) {
      summaryMap[key] = { userName: r.userName, totalHours: 0, days: 0, scheduleLabel: WORK_SCHEDULE_LABELS[scheduleType] || '通常勤務' };
    }
    const hours = getWorkHours(r.clockIn, r.clockOut, scheduleType, userInfo.deemedHours);
    summaryMap[key].totalHours += hours;
    if (hours > 0) summaryMap[key].days += 1;
  });

  // 明細
  const detailHeaders = ['日付', '社員名', '勤務区分', '出勤', '退勤', '労働時間(h)'];
  const detailRows = filtered
    .sort((a: any, b: any) => (a.date || '').localeCompare(b.date || '') || (a.userName || '').localeCompare(b.userName || ''))
    .map(r => {
      const userInfo = usersMap[r.userId] || {};
      const scheduleType = userInfo.workScheduleType || 'regular';
      return [
        r.date,
        r.userName,
        WORK_SCHEDULE_LABELS[scheduleType] || '通常勤務',
        r.clockIn?.toDate?.().toLocaleTimeString?.() || '',
        r.clockOut?.toDate?.().toLocaleTimeString?.() || '',
        getWorkHours(r.clockIn, r.clockOut, scheduleType, userInfo.deemedHours).toFixed(2),
      ];
    });

  // 集計
  const summaryHeaders = ['社員名', '勤務区分', '出勤日数', '合計労働時間(h)'];
  const summaryRows = Object.values(summaryMap)
    .sort((a, b) => a.userName.localeCompare(b.userName))
    .map(s => [s.userName, s.scheduleLabel, String(s.days), s.totalHours.toFixed(2)]);

  const [year, month] = yearMonth.split('-');
  const lines: string[] = [];
  lines.push(label);
  lines.push(`締め日: ${closingDay}日`);
  lines.push('');
  lines.push('【月間集計】');
  lines.push(summaryHeaders.map(escapeCSVField).join(','));
  summaryRows.forEach(row => lines.push(row.map(escapeCSVField).join(',')));
  lines.push('');
  lines.push('【明細】');
  lines.push(detailHeaders.map(escapeCSVField).join(','));
  detailRows.forEach(row => lines.push(row.map(escapeCSVField).join(',')));

  const csvContent = '\uFEFF' + lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `勤怠レポート_${year}年${month}月_${closingDay}日締め.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth();
  const now = useNow();
  const [todayStatus, setTodayStatus] = useState<'none' | 'clocked_in' | 'clocked_out'>('none');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attendances, setAttendances] = useState<any[]>([]);
  const [subordinateAttendances, setSubordinateAttendances] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [roleUpdateLoading, setRoleUpdateLoading] = useState<string | null>(null);
  const [supervisorUpdateLoading, setSupervisorUpdateLoading] = useState<string | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestType, setRequestType] = useState<'打刻修正' | '残業申請'>('打刻修正');
  const [requestDate, setRequestDate] = useState('');
  const [requestedTime, setRequestedTime] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [requestError, setRequestError] = useState('');
  // 有休申請用
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveDate, setLeaveDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveSuccess, setLeaveSuccess] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [closingDay, setClosingDay] = useState(10);
  const [closingDayInput, setClosingDayInput] = useState('10');
  // 締め日に基づいてselectedMonthを自動設定するフラグ（初回のみ）
  const [monthAutoSet, setMonthAutoSet] = useState(false);
  const [closingDaySaving, setClosingDaySaving] = useState(false);
  const [closingDayMessage, setClosingDayMessage] = useState('');
  const [workScheduleUpdateLoading, setWorkScheduleUpdateLoading] = useState<string | null>(null);

  // allUsersからユーザー情報マップを構築（勤務区分参照用）
  const usersMap: Record<string, any> = {};
  allUsers.forEach(u => { usersMap[u.id] = u; });

  const loadTodayStatus = async () => {
    if (!user) return;
    const today = dayjs().format('YYYY-MM-DD');
    const records = await getAttendancesByUser(user.uid);
    const todayRecords = records.filter((r: any) => r.date === today);
    // 最新のレコードで判定（複数出勤に対応）
    const latest = todayRecords[0]; // getAttendancesByUserは日付降順
    if (!latest) {
      setTodayStatus('none');
    } else if (latest.clockIn && !latest.clockOut) {
      setTodayStatus('clocked_in');
    } else {
      // 退勤済み or レコードなし → 再出勤可能
      setTodayStatus('none');
    }
  };

  useEffect(() => {
    if (!user) return;
    // 今日の打刻状態を取得
    loadTodayStatus();
    // 全ロール共通: 自分の申請履歴
    getRequestsByUser(user.uid).then(setMyRequests);

    // 締め日設定を取得し、自動で表示月を切り替え
    getCompanySettings().then(s => {
      const cd = s.closingDay || 10;
      setClosingDay(cd);
      setClosingDayInput(String(cd));
      // 締め日を過ぎていたら翌月を表示（初回のみ）
      if (!monthAutoSet) {
        const today = dayjs();
        if (cd < 28 && today.date() > cd) {
          setSelectedMonth(today.add(1, 'month').format('YYYY-MM'));
        }
        setMonthAutoSet(true);
      }
    });

    if (user.role === 'admin') {
      getAllAttendances().then(setAttendances);
      getAllUsers().then(setAllUsers);
    }
    if (user.role === 'supervisor') {
      loadRequests();
      getAttendancesBySubordinates(user.uid).then(setSubordinateAttendances);
    }
  }, [user]);

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

  const loadRequests = async () => {
    if (!user) return;
    try {
      const reqs = await getRequestsBySupervisor(user.uid);
      setRequests(reqs);
    } catch (error) {
      console.error('申請の読み込みに失敗しました:', error);
    }
  };

  const handleRequestAction = async (requestId: string, action: 'approved' | 'denied') => {
    try {
      await updateRequestStatus(requestId, action);
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

      // 申請者に通知を送信
      if (request) {
        await createNotification({
          recipientId: request.userId,
          title: `申請が${action === 'approved' ? '承認' : '却下'}されました`,
          message: `${request.type}の申請が${action === 'approved' ? '承認' : '却下'}されました。`,
          type: 'approval',
          relatedRequestId: requestId,
          isRead: false,
        });
      }
      // 申請一覧と勤怠データを再読み込み
      await loadRequests();
      if (user?.role === 'supervisor') {
        getAttendancesBySubordinates(user.uid).then(setSubordinateAttendances);
      }
      if (user?.role === 'admin') {
        getAllAttendances().then(setAttendances);
      }
    } catch (error) {
      console.error('申請の処理に失敗しました:', error);
    }
  };

  const handleClockIn = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      await clockIn(user.uid, user.name || user.email || '名無し');
      setTodayStatus('clocked_in');
      setMessage('出勤打刻しました！');
    } catch (e) {
      setMessage('出勤打刻に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      await clockOut(user.uid);
      setTodayStatus('clocked_out');
      setMessage('退勤打刻しました！');
    } catch (e) {
      setMessage('退勤打刻に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // 申請送信処理
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestLoading(true);
    setRequestError('');
    try {
      if (!user) throw new Error('ユーザー情報が取得できません');
      if (!requestDate || !requestedTime || !requestReason) throw new Error('すべての項目を入力してください');
      if (requestReason.length > 500) throw new Error('理由は500文字以内で入力してください');
      await createRequest({
        userId: user.uid,
        userName: user.name || user.email || '名無し',
        supervisorId: user.supervisorId || '',
        type: '残業申請',
        date: requestDate,
        requestedTime,
        reason: requestReason,
      });
      setRequestSuccess(true);
      setRequestDate(''); setRequestedTime(''); setRequestReason('');
      // 申請履歴を更新
      getRequestsByUser(user.uid).then(setMyRequests);
      if (user.role === 'supervisor') {
        await loadRequests();
      }
    } catch (e: any) {
      setRequestError(e.message || '申請に失敗しました');
    } finally {
      setRequestLoading(false);
    }
  };

  // 有休申請送信処理
  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeaveLoading(true);
    setLeaveError('');
    try {
      if (!user) throw new Error('ユーザー情報が取得できません');
      if (!leaveDate || !leaveReason) throw new Error('すべての項目を入力してください');
      if (leaveReason.length > 500) throw new Error('理由は500文字以内で入力してください');
      await createRequest({
        userId: user.uid,
        userName: user.name || user.email || '名無し',
        supervisorId: user.supervisorId || '',
        type: '有休申請',
        date: leaveDate,
        requestedTime: '終日',
        reason: leaveReason,
      });
      setLeaveSuccess(true);
      setLeaveDate(''); setLeaveReason('');
      getRequestsByUser(user.uid).then(setMyRequests);
    } catch (e: any) {
      setLeaveError(e.message || '申請に失敗しました');
    } finally {
      setLeaveLoading(false);
    }
  };

  return (
    <>
      <style>{responsiveStyle}</style>
      {/* タイムレコーダーカード（中央1カラム縦並び） */}
      <div style={recorderCardStyle}>
        <h1 style={{ fontWeight: 'bold', fontSize: 22, marginBottom: 8, textAlign: 'center' }}>タイムレコーダー</h1>
        <div style={clockBoxStyle}>{dayjs(now).format('HH:mm:ss')}</div>
        <div style={dateBoxStyle}>{dayjs(now).format('YYYY年M月D日(ddd)')}</div>
        {todayStatus !== 'none' && (
          <div style={{ fontSize: 14, color: todayStatus === 'clocked_in' ? '#059669' : '#6b7280', fontWeight: 600, marginBottom: 4 }}>
            {todayStatus === 'clocked_in' ? '出勤中' : '退勤済み'}
          </div>
        )}
        <div style={recorderButtonRow}>
          <button
            onClick={handleClockIn}
            disabled={isLoading || todayStatus !== 'none'}
            style={{
              ...recorderButton,
              background: todayStatus === 'none' ? '#2563eb' : '#e5e7eb',
              color: todayStatus === 'none' ? '#fff' : '#9ca3af',
              borderTopRightRadius: 0, borderBottomRightRadius: 0,
              opacity: isLoading ? 0.7 : 1,
              cursor: todayStatus !== 'none' ? 'default' : 'pointer',
            }}
          >
            出勤
          </button>
          <button
            onClick={handleClockOut}
            disabled={isLoading || todayStatus !== 'clocked_in'}
            style={{
              ...recorderButton,
              background: todayStatus === 'clocked_in' ? '#2563eb' : '#e5e7eb',
              color: todayStatus === 'clocked_in' ? '#fff' : '#9ca3af',
              borderTopLeftRadius: 0, borderBottomLeftRadius: 0, marginLeft: -1,
              opacity: isLoading ? 0.7 : 1,
              cursor: todayStatus !== 'clocked_in' ? 'default' : 'pointer',
            }}
          >
            退勤
          </button>
        </div>
        {message && <div style={{ color: '#2563eb', marginTop: 10, marginBottom: 0 }}>{message}</div>}
      </div>
      {/* 残業申請 & 有休申請ボタン */}
      <div style={{
        maxWidth: 760,
        margin: '18px auto 0',
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 2px 8px #0001',
        padding: 12,
        display: 'flex',
        justifyContent: 'center',
        gap: 12,
      }}>
        <button
          style={{
            flex: 1, maxWidth: 360,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #facc15', background: '#fff', color: '#b58105', fontWeight: 'bold', fontSize: 16, borderRadius: 8, padding: '10px 0', cursor: 'pointer', transition: 'background 0.2s', gap: 8
          }}
          onClick={() => { setRequestType('残業申請'); setShowRequestModal(true); }}
        >
          <svg width="20" height="20" fill="none" stroke="#facc15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          残業申請
        </button>
        <button
          style={{
            flex: 1, maxWidth: 360,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #22c55e', background: '#fff', color: '#15803d', fontWeight: 'bold', fontSize: 16, borderRadius: 8, padding: '10px 0', cursor: 'pointer', transition: 'background 0.2s', gap: 8
          }}
          onClick={() => { setLeaveSuccess(false); setLeaveError(''); setShowLeaveModal(true); }}
        >
          <svg width="20" height="20" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></svg>
          有休申請
        </button>
      </div>
      {/* 履歴ページへのナビゲーション */}
      <div style={{
        maxWidth: 760, margin: '18px auto 0',
        display: 'flex', gap: 16,
      }}>
        <Link to="/requests" style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px #0001',
          padding: '16px 0', fontWeight: 700, fontSize: 16, color: '#2563eb',
          textDecoration: 'none', border: '2px solid #dbeafe', transition: 'all 0.2s',
        }}>
          <svg width="20" height="20" fill="none" stroke="#2563eb" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg>
          申請履歴
          {myRequests.length > 0 && <span style={{ background: '#dbeafe', borderRadius: 10, padding: '2px 8px', fontSize: 13 }}>{myRequests.length}</span>}
        </Link>
        <Link to="/attendances" style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px #0001',
          padding: '16px 0', fontWeight: 700, fontSize: 16, color: '#059669',
          textDecoration: 'none', border: '2px solid #d1fae5', transition: 'all 0.2s',
        }}>
          <svg width="20" height="20" fill="none" stroke="#059669" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          出退勤履歴
        </Link>
        {(user?.role === 'admin' || user?.role === 'supervisor') && (
          <Link to="/approvals" style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px #0001',
            padding: '16px 0', fontWeight: 700, fontSize: 16, color: '#dc2626',
            textDecoration: 'none', border: '2px solid #fecaca', transition: 'all 0.2s',
          }}>
            <svg width="20" height="20" fill="none" stroke="#dc2626" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            申請承認
          </Link>
        )}
      </div>
      {/* 申請フォームモーダル */}
      {showRequestModal && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle}>
            <h2 style={{ fontWeight: 'bold', fontSize: 20, marginBottom: 16 }}>残業申請フォーム</h2>
            {requestSuccess ? (
              <div style={{ color: '#2563eb', fontWeight: 'bold', textAlign: 'center', marginBottom: 16 }}>
                申請が送信されました！
                <br />
                <button style={{ marginTop: 16, padding: '8px 24px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: 15, cursor: 'pointer' }} onClick={() => { setShowRequestModal(false); setRequestSuccess(false); }}>閉じる</button>
              </div>
            ) : (
              <form onSubmit={handleSubmitRequest}>
                <div style={{ marginBottom: 12 }}>
                  <label>申請日付：<input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)} style={{ marginLeft: 8, padding: 4, borderRadius: 4, border: '1px solid #ccc' }} required /></label>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label>残業時間：
                    <select value={requestedTime} onChange={e => setRequestedTime(e.target.value)} style={{ marginLeft: 8, padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 14 }} required>
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
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label>理由：<br />
                    <textarea value={requestReason} onChange={e => setRequestReason(e.target.value)} style={{ width: '100%', minHeight: 60, borderRadius: 4, border: '1px solid #ccc', padding: 4 }} required />
                  </label>
                </div>
                {requestError && <div style={{ color: 'red', marginBottom: 8 }}>{requestError}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button type="button" onClick={() => setShowRequestModal(false)} style={{ padding: '8px 20px', borderRadius: 8, background: '#eee', color: '#333', border: 'none', fontWeight: 'bold', fontSize: 15, cursor: 'pointer' }}>キャンセル</button>
                  <button type="submit" disabled={requestLoading} style={{ padding: '8px 24px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: 15, cursor: 'pointer', opacity: requestLoading ? 0.7 : 1 }}>{requestLoading ? '送信中...' : '申請する'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {/* 有休申請フォームモーダル */}
      {showLeaveModal && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle}>
            <h2 style={{ fontWeight: 'bold', fontSize: 20, marginBottom: 16 }}>有休申請フォーム</h2>
            {leaveSuccess ? (
              <div style={{ color: '#15803d', fontWeight: 'bold', textAlign: 'center', marginBottom: 16 }}>
                有休申請が送信されました！
                <br />
                <button style={{ marginTop: 16, padding: '8px 24px', borderRadius: 8, background: '#22c55e', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: 15, cursor: 'pointer' }} onClick={() => { setShowLeaveModal(false); setLeaveSuccess(false); }}>閉じる</button>
              </div>
            ) : (
              <form onSubmit={handleSubmitLeave}>
                <div style={{ marginBottom: 12 }}>
                  <label>取得日：<input type="date" value={leaveDate} onChange={e => setLeaveDate(e.target.value)} style={{ marginLeft: 8, padding: 4, borderRadius: 4, border: '1px solid #ccc' }} required /></label>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label>理由：<br />
                    <textarea value={leaveReason} onChange={e => setLeaveReason(e.target.value)} style={{ width: '100%', minHeight: 60, borderRadius: 4, border: '1px solid #ccc', padding: 4 }} placeholder="例：私用のため" required />
                  </label>
                </div>
                {leaveError && <div style={{ color: 'red', marginBottom: 8 }}>{leaveError}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button type="button" onClick={() => setShowLeaveModal(false)} style={{ padding: '8px 20px', borderRadius: 8, background: '#eee', color: '#333', border: 'none', fontWeight: 'bold', fontSize: 15, cursor: 'pointer' }}>キャンセル</button>
                  <button type="submit" disabled={leaveLoading} style={{ padding: '8px 24px', borderRadius: 8, background: '#22c55e', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: 15, cursor: 'pointer', opacity: leaveLoading ? 0.7 : 1 }}>{leaveLoading ? '送信中...' : '申請する'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {/* 管理者用: 全従業員の打刻履歴テーブル */}
      {user?.role === 'admin' && (
        <div style={{
          maxWidth: 900,
          margin: '24px auto 0',
          background: '#fff',
          borderRadius: 14,
          boxShadow: '0 2px 12px #0001',
          padding: 24,
        }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
           <h2 style={{ fontWeight: 'bold', fontSize: 20, color: '#222', margin: 0 }}>全従業員勤怠管理</h2>
           <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
             <input
               type="month"
               value={selectedMonth}
               onChange={e => setSelectedMonth(e.target.value)}
               style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
             />
             <button
               onClick={() => exportMonthlyCSV(attendances, selectedMonth, closingDay, usersMap)}
               style={{ background: '#2563eb', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 14, cursor: 'pointer', boxShadow: '0 1px 4px #0001', whiteSpace: 'nowrap' }}
             >月次CSV出力</button>
           </div>
         </div>
         <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: 13, color: '#555' }}>
           {getClosingPeriod(selectedMonth, closingDay).label}（{closingDay}日締め）
         </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, minWidth: 600 }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, textAlign: 'left', fontWeight: 700 }}>日付</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, textAlign: 'left', fontWeight: 700 }}>社員名</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>出勤</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>退勤</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>労働時間</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700, color: '#dc2626' }}>法定外</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700, width: 60 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filterByClosingPeriod(attendances, selectedMonth, closingDay).length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 16, color: '#888', textAlign: 'center' }}>該当期間のデータがありません</td></tr>
                ) : (
                  filterByClosingPeriod(attendances, selectedMonth, closingDay)
                    .sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''))
                    .map(a => {
                    const ui = usersMap[a.userId] || {};
                    const st = ui.workScheduleType || 'regular';
                    const isExempt = st === 'deemed' || st === 'managerial';
                    const hours = getWorkHours(a.clockIn, a.clockOut, st, ui.deemedHours);
                    const dailyOT = isExempt ? 0 : Math.max(0, hours - 8);
                    return (
                    <tr key={a.id}>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10 }}>{a.date}</td>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10 }}>{a.userName}</td>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>{a.clockIn?.toDate?.().toLocaleTimeString?.() || '--:--:--'}</td>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>{a.clockOut?.toDate?.().toLocaleTimeString?.() || '--:--:--'}</td>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>{getWorkDuration(a.clockIn, a.clockOut, st, ui.deemedHours)}</td>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center', color: isExempt ? '#9ca3af' : dailyOT > 0 ? '#dc2626' : '#ccc', fontWeight: dailyOT > 0 ? 700 : 400 }}>
                        {isExempt ? '対象外' : dailyOT > 0 ? dailyOT.toFixed(2) + ' h' : '-'}
                      </td>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`${a.userName}さんの${a.date}の勤怠記録を削除しますか？`)) return;
                            await deleteAttendance(a.id);
                            setAttendances(prev => prev.filter(att => att.id !== a.id));
                          }}
                          style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 4, padding: '2px 8px', fontSize: 12, color: '#dc2626', cursor: 'pointer' }}
                        >削除</button>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* 管理者用: 法定外残業集計 */}
      {user?.role === 'admin' && (() => {
        const period = getClosingPeriod(selectedMonth, closingDay);
        const filtered = filterByClosingPeriod(attendances, selectedMonth, closingDay);
        const summary = calculateOvertimeSummary(filtered, period.start, period.end, usersMap);
        if (summary.length === 0) return null;
        return (
          <div style={{ maxWidth: 900, margin: '24px auto 0', background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px #0001', padding: 24 }}>
            <h2 style={{ fontWeight: 'bold', fontSize: 20, marginBottom: 18, color: '#222' }}>法定外残業集計</h2>
            <div style={{ background: '#fef2f2', borderRadius: 8, padding: '8px 14px', marginBottom: 16, fontSize: 13, color: '#991b1b' }}>
              {period.label} ／ 所定労働日数: {summary[0]?.businessDays}日
            </div>
            {/* 月間サマリーテーブル */}
            <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 10, color: '#333' }}>月間サマリー</h3>
            <div style={{ overflowX: 'auto', marginBottom: 24 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 700 }}>
                <thead>
                  <tr style={{ background: '#fef2f2' }}>
                    <th style={{ borderBottom: '2px solid #fca5a5', padding: 10, textAlign: 'left', fontWeight: 700 }}>社員名</th>
                    <th style={{ borderBottom: '2px solid #fca5a5', padding: 10, fontWeight: 700 }}>勤務区分</th>
                    <th style={{ borderBottom: '2px solid #fca5a5', padding: 10, fontWeight: 700 }}>総労働時間</th>
                    <th style={{ borderBottom: '2px solid #fca5a5', padding: 10, fontWeight: 700 }}>所定時間</th>
                    <th style={{ borderBottom: '2px solid #fca5a5', padding: 10, fontWeight: 700, color: '#dc2626' }}>日の法定外合計</th>
                    <th style={{ borderBottom: '2px solid #fca5a5', padding: 10, fontWeight: 700, color: '#dc2626' }}>週の法定外合計</th>
                    <th style={{ borderBottom: '2px solid #fca5a5', padding: 10, fontWeight: 700, color: '#dc2626' }}>月の法定外</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map(s => (
                    <tr key={s.userId} style={{ opacity: s.isOvertimeExempt ? 0.6 : 1 }}>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10 }}>{s.userName}</td>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                        <span style={{
                          fontSize: 11, borderRadius: 4, padding: '2px 6px', fontWeight: 600,
                          background: s.isOvertimeExempt ? '#f3f4f6' : s.workScheduleType === 'short_flex' ? '#dbeafe' : '#f0fdf4',
                          color: s.isOvertimeExempt ? '#6b7280' : s.workScheduleType === 'short_flex' ? '#1d4ed8' : '#15803d',
                        }}>
                          {WORK_SCHEDULE_LABELS[s.workScheduleType] || '通常勤務'}
                        </span>
                      </td>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>{s.totalHours.toFixed(2)} h</td>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>{s.prescribedMonthlyHours} h</td>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center', color: s.isOvertimeExempt ? '#9ca3af' : s.dailyOvertime > 0 ? '#dc2626' : '#888', fontWeight: s.dailyOvertime > 0 ? 700 : 400 }}>
                        {s.isOvertimeExempt ? '対象外' : s.dailyOvertime > 0 ? s.dailyOvertime.toFixed(2) + ' h' : '-'}
                      </td>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center', color: s.isOvertimeExempt ? '#9ca3af' : s.weeklyOvertime > 0 ? '#dc2626' : '#888', fontWeight: s.weeklyOvertime > 0 ? 700 : 400 }}>
                        {s.isOvertimeExempt ? '対象外' : s.weeklyOvertime > 0 ? s.weeklyOvertime.toFixed(2) + ' h' : '-'}
                      </td>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center', color: s.isOvertimeExempt ? '#9ca3af' : s.monthlyOvertime > 0 ? '#dc2626' : '#888', fontWeight: s.monthlyOvertime > 0 ? 700 : 400 }}>
                        {s.isOvertimeExempt ? '対象外' : s.monthlyOvertime > 0 ? s.monthlyOvertime.toFixed(2) + ' h' : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* 週別明細 */}
            <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 10, color: '#333' }}>週別明細</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 500 }}>
                <thead>
                  <tr style={{ background: '#fef2f2' }}>
                    <th style={{ borderBottom: '2px solid #fca5a5', padding: 10, textAlign: 'left', fontWeight: 700 }}>社員名</th>
                    <th style={{ borderBottom: '2px solid #fca5a5', padding: 10, fontWeight: 700 }}>週</th>
                    <th style={{ borderBottom: '2px solid #fca5a5', padding: 10, fontWeight: 700 }}>週間労働時間</th>
                    <th style={{ borderBottom: '2px solid #fca5a5', padding: 10, fontWeight: 700, color: '#dc2626' }}>40h超過分</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.flatMap(s =>
                    s.weekDetails.map((w, i) => (
                      <tr key={`${s.userId}-${i}`}>
                        {i === 0 ? (
                          <td rowSpan={s.weekDetails.length} style={{ borderBottom: '1px solid #f3f4f6', padding: 10, verticalAlign: 'top', fontWeight: 600 }}>{s.userName}</td>
                        ) : null}
                        <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center', fontSize: 13 }}>{w.week}</td>
                        <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>{w.hours.toFixed(2)} h</td>
                        <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center', color: w.overtime > 0 ? '#dc2626' : '#888', fontWeight: w.overtime > 0 ? 700 : 400 }}>
                          {w.overtime > 0 ? w.overtime.toFixed(2) + ' h' : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
      {/* 管理者用: ユーザー管理 */}
      {user?.role === 'admin' && (
        <div style={{ maxWidth: 900, margin: '24px auto 0', background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px #0001', padding: 24 }}>
          <h2 style={{ fontWeight: 'bold', fontSize: 20, marginBottom: 18, color: '#222' }}>ユーザー管理</h2>
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
                        <span style={{ color: '#aaa', fontSize: 13 }}>（自分）</span>
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
      )}
      {/* 管理者用: 締め日設定 */}
      {user?.role === 'admin' && (
        <div style={{ maxWidth: 900, margin: '24px auto 0', background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px #0001', padding: 24 }}>
          <h2 style={{ fontWeight: 'bold', fontSize: 20, marginBottom: 18, color: '#222' }}>締め日設定</h2>
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
                  await updateCompanySettings({ closingDay: newDay });
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
      )}
      {/* 上司用: 部下の勤怠履歴 */}
      {user?.role === 'supervisor' && (
        <div style={{ maxWidth: 900, margin: '24px auto 0', background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px #0001', padding: 24 }}>
          <h2 style={{ fontWeight: 'bold', fontSize: 20, marginBottom: 18, color: '#222' }}>部下の勤怠履歴</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, minWidth: 600 }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, textAlign: 'left', fontWeight: 700 }}>日付</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, textAlign: 'left', fontWeight: 700 }}>社員名</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>出勤</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>退勤</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>労働時間</th>
                </tr>
              </thead>
              <tbody>
                {subordinateAttendances.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 16, color: '#888', textAlign: 'center' }}>部下の勤怠データがありません</td></tr>
                ) : (
                  subordinateAttendances.map(a => (
                    <tr key={a.id}>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10 }}>{a.date}</td>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10 }}>{a.userName}</td>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>{a.clockIn?.toDate?.().toLocaleTimeString?.() || '--:--:--'}</td>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>{a.clockOut?.toDate?.().toLocaleTimeString?.() || '--:--:--'}</td>
                      <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>{getWorkDuration(a.clockIn, a.clockOut)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* 上司用: 部下の申請一覧 */}
      {user?.role === 'supervisor' && (
        <div style={{ maxWidth: 900, margin: '24px auto 0', background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px #0001', padding: 24 }}>
          <h2 style={{ fontWeight: 'bold', fontSize: 20, marginBottom: 18, color: '#222' }}>部下の申請一覧</h2>
          {requests.length === 0 ? (
            <div style={{ color: '#888', fontSize: 15 }}>保留中の申請はありません。</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, minWidth: 600 }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, textAlign: 'left', fontWeight: 700 }}>申請者</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>種別</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>日付</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>内容</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>状態</th>
                  <th style={{ borderBottom: '2px solid #e5e7eb', padding: 10, fontWeight: 700 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id}>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10 }}>{r.userName}</td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>{r.type}</td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>{r.date}</td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10 }}>{r.reason}</td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                      <span style={{
                        color: r.status === 'pending' ? '#eab308' : r.status === 'approved' ? '#22c55e' : '#ef4444',
                        fontWeight: 700
                      }}>
                        {r.status === 'pending' ? '保留中' : r.status === 'approved' ? '承認済み' : '却下済み'}
                      </span>
                    </td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: 10, textAlign: 'center' }}>
                      {r.status === 'pending' && (
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            onClick={() => handleRequestAction(r.id, 'approved')}
                            style={{
                              background: '#22c55e',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              fontSize: '12px',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                            }}
                          >
                            承認
                          </button>
                          <button
                            onClick={() => handleRequestAction(r.id, 'denied')}
                            style={{
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              fontSize: '12px',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                            }}
                          >
                            却下
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
};

export default DashboardPage;