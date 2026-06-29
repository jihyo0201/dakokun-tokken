import { db } from './firebase';
import { collection, addDoc, Timestamp, query, where, getDocs, updateDoc, doc, orderBy, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { Request } from '../types';

// 会社設定の取得
export const getCompanySettings = async () => {
  const docRef = doc(db, 'settings', 'company');
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) return docSnap.data();
  return { closingDay: 10 }; // デフォルト: 10日締め
};

// 会社設定の更新（admin用）
export const updateCompanySettings = async (settings: { closingDay: number }) => {
  await setDoc(doc(db, 'settings', 'company'), settings, { merge: true });
};

export const clockIn = async (userId: string, userName: string) => {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await addDoc(collection(db, 'attendances'), {
    userId,
    userName,
    clockIn: Timestamp.fromDate(today),
    clockOut: null,
    date: dateStr,
  });
};

export const clockOut = async (userId: string) => {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  // 今日の自分の出勤記録を検索
  const q = query(
    collection(db, 'attendances'),
    where('userId', '==', userId),
    where('date', '==', dateStr)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) throw new Error('本日の出勤記録が見つかりません');
  // 最初の1件だけ更新
  const attendanceDoc = snapshot.docs[0];
  await updateDoc(doc(db, 'attendances', attendanceDoc.id), {
    clockOut: Timestamp.fromDate(today),
  });
};

export const getAllAttendances = async () => {
  const q = query(collection(db, 'attendances'), orderBy('date', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// supervisor の部下（supervisorId が自分のUID のユーザー）の勤怠を取得
export const getAttendancesBySubordinates = async (supervisorId: string) => {
  // 1. 自分の部下一覧を取得
  const usersQ = query(collection(db, 'users'), where('supervisorId', '==', supervisorId));
  const usersSnapshot = await getDocs(usersQ);
  if (usersSnapshot.empty) return [];

  const subordinateIds = usersSnapshot.docs.map(d => d.id);

  // Firestore の in クエリは30件まで
  const chunks: string[][] = [];
  for (let i = 0; i < subordinateIds.length; i += 30) {
    chunks.push(subordinateIds.slice(i, i + 30));
  }

  // 2. 部下の勤怠を取得
  const results: any[] = [];
  for (const chunk of chunks) {
    const attQ = query(
      collection(db, 'attendances'),
      where('userId', 'in', chunk),
      orderBy('date', 'desc')
    );
    const snapshot = await getDocs(attQ);
    snapshot.docs.forEach(d => results.push({ id: d.id, ...d.data() }));
  }

  return results;
};

// 自分の出退勤履歴を取得
export const getAttendancesByUser = async (userId: string) => {
  const q = query(
    collection(db, 'attendances'),
    where('userId', '==', userId)
  );
  const snapshot = await getDocs(q);
  const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  // クライアント側で日付降順ソート（複合インデックス不要）
  results.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
  return results;
};

// --- 通知（notifications）API ---

// メール通知送信（fire-and-forget）
const sendEmailNotification = (title: string, message: string) => {
  getCompanySettings().then(settings => {
    if (!settings.notificationEmail || !settings.resendApiKey) return;
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        message,
        emailTo: settings.notificationEmail,
        resendApiKey: settings.resendApiKey,
      }),
    }).catch(() => {}); // 失敗しても無視
  }).catch(() => {});
};

// 通知作成
export const createNotification = async (notification: {
  recipientId: string;
  title: string;
  message: string;
  type: 'request' | 'approval' | 'system';
  relatedRequestId?: string;
  isRead: boolean;
}) => {
  const now = Timestamp.now();
  const docRef = await addDoc(collection(db, 'notifications'), {
    ...notification,
    createdAt: now,
  });
  // メール通知も送信（非同期、失敗しても影響なし）
  sendEmailNotification(notification.title, notification.message);
  return docRef.id;
};

// ユーザーの通知一覧取得
export const getNotificationsByUser = async (userId: string) => {
  const q = query(
    collection(db, 'notifications'),
    where('recipientId', '==', userId)
  );
  const snapshot = await getDocs(q);
  const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  // クライアント側で日時降順ソート（複合インデックス不要）
  results.sort((a: any, b: any) => {
    const aTime = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
    const bTime = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
    return bTime - aTime;
  });
  return results;
};

// 通知を既読にする
export const markNotificationAsRead = async (notificationId: string) => {
  await updateDoc(doc(db, 'notifications', notificationId), {
    isRead: true,
  });
};

// 未読通知数を取得
export const getUnreadNotificationCount = async (userId: string) => {
  const q = query(
    collection(db, 'notifications'),
    where('recipientId', '==', userId),
    where('isRead', '==', false)
  );
  const snapshot = await getDocs(q);
  return snapshot.size;
};

// 申請作成（通知機能付き）
export const createRequest = async (request: Omit<Request, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => {
  const now = Timestamp.now();
  const docRef = await addDoc(collection(db, 'requests'), {
    ...request,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });
  
  // 上長に通知を送信
  if (request.supervisorId) {
    await createNotification({
      recipientId: request.supervisorId,
      title: '新しい申請があります',
      message: `${request.userName}さんから${request.type}の申請が届きました。`,
      type: 'request',
      relatedRequestId: docRef.id,
      isRead: false,
    });
  }
  
  return docRef.id;
};

// ユーザーごとの申請一覧取得
export const getRequestsByUser = async (userId: string) => {
  const q = query(collection(db, 'requests'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// 全申請取得（admin 用）
export const getAllRequests = async () => {
  const snapshot = await getDocs(collection(db, 'requests'));
  const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  results.sort((a: any, b: any) => {
    const aTime = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
    const bTime = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
    return bTime - aTime;
  });
  return results;
};

// 上司ごとの部下申請一覧取得
export const getRequestsBySupervisor = async (supervisorId: string) => {
  const q = query(collection(db, 'requests'), where('supervisorId', '==', supervisorId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// 申請の承認・却下
export const updateRequestStatus = async (requestId: string, status: 'approved' | 'denied', denialComment?: string) => {
  const now = Timestamp.now();
  const updateData: any = { status, updatedAt: now };
  if (status === 'denied' && denialComment) {
    updateData.denialComment = denialComment;
  }
  await updateDoc(doc(db, 'requests', requestId), updateData);
};

// 却下された申請を再編集して再提出
export const resubmitRequest = async (requestId: string, updates: {
  requestedTime: string;
  reason: string;
}) => {
  const now = Timestamp.now();
  await updateDoc(doc(db, 'requests', requestId), {
    requestedTime: updates.requestedTime,
    reason: updates.reason,
    status: 'pending',
    denialComment: null,
    updatedAt: now,
  });
};

// 打刻修正を実際の勤怠データに反映する
export const applyClockCorrection = async (
  userId: string,
  userName: string,
  date: string,
  target: 'clockIn' | 'clockOut',
  newTime: string // "HH:MM" 形式
) => {
  // HH:MM を Timestamp に変換（対象日付 + 時刻、ローカルタイムゾーン）
  const [hours, minutes] = newTime.split(':').map(Number);
  const [year, month, day] = date.split('-').map(Number);
  const correctedDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  const correctedTimestamp = Timestamp.fromDate(correctedDate);

  // 対象日の勤怠レコードを検索
  const q = query(
    collection(db, 'attendances'),
    where('userId', '==', userId),
    where('date', '==', date)
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    // 勤怠レコードがない場合は新規作成
    await addDoc(collection(db, 'attendances'), {
      userId,
      userName,
      date,
      clockIn: target === 'clockIn' ? correctedTimestamp : null,
      clockOut: target === 'clockOut' ? correctedTimestamp : null,
      status: 'Corrected',
    });
  } else {
    // 既存レコードを更新
    const attendanceDoc = snapshot.docs[0];
    await updateDoc(doc(db, 'attendances', attendanceDoc.id), {
      [target]: correctedTimestamp,
      status: 'Corrected',
    });
  }
};

// 残業承認を勤怠データに反映する
export const applyOvertimeApproval = async (
  userId: string,
  userName: string,
  date: string,
  overtimeAmount: string // 申請された残業時間（例: "2h", "1.5h", "01:30"）
) => {
  const q = query(
    collection(db, 'attendances'),
    where('userId', '==', userId),
    where('date', '==', date)
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    // 勤怠レコードがない場合は新規作成
    await addDoc(collection(db, 'attendances'), {
      userId,
      userName,
      date,
      clockIn: null,
      clockOut: null,
      overtime: overtimeAmount,
    });
  } else {
    // 既存レコードに残業を追記
    const attendanceDoc = snapshot.docs[0];
    await updateDoc(doc(db, 'attendances', attendanceDoc.id), {
      overtime: overtimeAmount,
    });
  }
};

// 勤怠レコードの直接編集（admin用）
export const updateAttendanceRecord = async (
  attendanceId: string,
  updates: { clockIn?: any; clockOut?: any }
) => {
  await updateDoc(doc(db, 'attendances', attendanceId), {
    ...updates,
    status: 'Corrected',
  });
};

// 勤怠レコードの削除（admin用）
export const deleteAttendance = async (attendanceId: string) => {
  await deleteDoc(doc(db, 'attendances', attendanceId));
};

// --- 有休残日数管理（leaveBalances）API ---

// ユーザーの有休残高を取得
export const getLeaveBalances = async (userId: string) => {
  const q = query(collection(db, 'leaveBalances'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  results.sort((a: any, b: any) => (b.fiscalYear || 0) - (a.fiscalYear || 0));
  return results;
};

// 全ユーザーの有休残高を取得（admin用）
export const getAllLeaveBalances = async () => {
  const snapshot = await getDocs(collection(db, 'leaveBalances'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// 有休残高の更新
export const updateLeaveBalance = async (balanceId: string, data: { granted?: number; used?: number; carried?: number }) => {
  await updateDoc(doc(db, 'leaveBalances', balanceId), { ...data, updatedAt: Timestamp.now() });
};

// 有休残高の新規作成
export const createLeaveBalance = async (data: {
  userId: string;
  fiscalYear: number;
  granted: number;
  used: number;
  carried: number;
  grantedAt: Date;
  expiresAt: Date;
}) => {
  const docRef = await addDoc(collection(db, 'leaveBalances'), {
    ...data,
    grantedAt: Timestamp.fromDate(data.grantedAt),
    expiresAt: Timestamp.fromDate(data.expiresAt),
    updatedAt: Timestamp.now(),
  });
  return docRef.id;
};

// 勤続年数に基づく自動付与日数計算（労基法39条）
export const calculateAutoGrant = (hireDate: string): { days: number; yearsWorked: number } => {
  const hire = new Date(hireDate + 'T00:00:00');
  const now = new Date();
  const diffMs = now.getTime() - hire.getTime();
  const yearsWorked = diffMs / (365.25 * 24 * 60 * 60 * 1000);

  // 労基法39条の有休付与日数テーブル
  // 6ヶ月: 10日, 1.5年: 11日, 2.5年: 12日, 3.5年: 14日, 4.5年: 16日, 5.5年: 18日, 6.5年以上: 20日
  if (yearsWorked < 0.5) return { days: 0, yearsWorked };
  if (yearsWorked < 1.5) return { days: 10, yearsWorked };
  if (yearsWorked < 2.5) return { days: 11, yearsWorked };
  if (yearsWorked < 3.5) return { days: 12, yearsWorked };
  if (yearsWorked < 4.5) return { days: 14, yearsWorked };
  if (yearsWorked < 5.5) return { days: 16, yearsWorked };
  if (yearsWorked < 6.5) return { days: 18, yearsWorked };
  return { days: 20, yearsWorked };
};

// 有休消化（used をインクリメント、amount で 0.5（半休）や 1（終日）を指定可能）
export const incrementLeaveUsed = async (userId: string, fiscalYear?: number, amount: number = 1) => {
  const year = fiscalYear || new Date().getFullYear();
  const q = query(
    collection(db, 'leaveBalances'),
    where('userId', '==', userId),
    where('fiscalYear', '==', year)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return;
  const balanceDoc = snapshot.docs[0];
  const data = balanceDoc.data();
  await updateDoc(doc(db, 'leaveBalances', balanceDoc.id), {
    used: (data.used || 0) + amount,
    updatedAt: Timestamp.now(),
  });
};

// --- 代休・振休残日数管理（compensatoryBalances）API ---

// ユーザーの代休残高を取得
export const getCompensatoryBalance = async (userId: string) => {
  const q = query(collection(db, 'compensatoryBalances'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
};

// 全ユーザーの代休残高を取得（admin用）
export const getAllCompensatoryBalances = async () => {
  const snapshot = await getDocs(collection(db, 'compensatoryBalances'));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
};

// 代休権利を+1（休日出勤承認時）
export const incrementCompensatoryEarned = async (userId: string) => {
  const q = query(collection(db, 'compensatoryBalances'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    await addDoc(collection(db, 'compensatoryBalances'), {
      userId, earned: 1, used: 0, updatedAt: Timestamp.now(),
    });
  } else {
    const d = snapshot.docs[0];
    await updateDoc(doc(db, 'compensatoryBalances', d.id), {
      earned: (d.data().earned || 0) + 1, updatedAt: Timestamp.now(),
    });
  }
};

// 代休消化を+1（代休/振休承認時）
export const incrementCompensatoryUsed = async (userId: string) => {
  const q = query(collection(db, 'compensatoryBalances'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    await addDoc(collection(db, 'compensatoryBalances'), {
      userId, earned: 0, used: 1, updatedAt: Timestamp.now(),
    });
  } else {
    const d = snapshot.docs[0];
    await updateDoc(doc(db, 'compensatoryBalances', d.id), {
      used: (d.data().used || 0) + 1, updatedAt: Timestamp.now(),
    });
  }
};

// 代休残高を手動調整（admin用）
export const updateCompensatoryBalance = async (balanceId: string, data: { earned?: number; used?: number }) => {
  await updateDoc(doc(db, 'compensatoryBalances', balanceId), { ...data, updatedAt: Timestamp.now() });
};

// 承認済み休暇日の取得（打刻漏れ除外用）
export const getApprovedLeaveDates = async (userId: string): Promise<Map<string, string>> => {
  const leaveTypes = ['有休申請', '代休申請', '振替休日申請'];
  const dates = new Map<string, string>(); // date -> leaveType ('終日' | '午前半休' | '午後半休')
  const q = query(
    collection(db, 'requests'),
    where('userId', '==', userId),
    where('status', '==', 'approved')
  );
  const snapshot = await getDocs(q);
  snapshot.docs.forEach(d => {
    const data = d.data();
    if (leaveTypes.includes(data.type)) {
      if (data.type === '有休申請') {
        dates.set(data.date, data.requestedTime || '終日');
      } else if (data.requestedTime && data.requestedTime !== '終日') {
        dates.set(data.requestedTime, '終日');
      }
    }
  });
  return dates;
};

// 全ユーザーの承認済み休暇日の取得（admin用）
export const getAllApprovedLeaveDates = async (): Promise<Set<string>> => {
  const leaveTypes = ['有休申請', '代休申請', '振替休日申請'];
  const dates = new Set<string>();
  const q = query(
    collection(db, 'requests'),
    where('status', '==', 'approved')
  );
  const snapshot = await getDocs(q);
  snapshot.docs.forEach(d => {
    const data = d.data();
    if (leaveTypes.includes(data.type)) {
      const key = data.type === '有休申請'
        ? `${data.userId}_${data.date}`
        : (data.requestedTime && data.requestedTime !== '終日' ? `${data.userId}_${data.requestedTime}` : '');
      if (key) dates.add(key);
    }
  });
  return dates;
};

// --- 目安箱（suggestions）API ---

// 要望を投稿
export const createSuggestion = async (suggestion: {
  userId: string;
  userName: string;
  body: string;
  isAnonymous: boolean;
}) => {
  const now = Timestamp.now();
  const docRef = await addDoc(collection(db, 'suggestions'), {
    ...suggestion,
    isRead: false,
    createdAt: now,
  });
  return docRef.id;
};

// 全要望を取得（admin用）
export const getAllSuggestions = async () => {
  const snapshot = await getDocs(collection(db, 'suggestions'));
  const results = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  results.sort((a: any, b: any) => {
    const aTime = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
    const bTime = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
    return bTime - aTime;
  });
  return results;
};

// 要望を既読にする（admin用）
export const markSuggestionAsRead = async (suggestionId: string) => {
  await updateDoc(doc(db, 'suggestions', suggestionId), { isRead: true });
};

// 要望を削除する（admin用）
export const deleteSuggestion = async (suggestionId: string) => {
  await deleteDoc(doc(db, 'suggestions', suggestionId));
};