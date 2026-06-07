import { db } from './firebase';
import { collection, addDoc, Timestamp, query, where, getDocs, updateDoc, doc, orderBy, Query, DocumentData } from 'firebase/firestore';
import { Request } from '../types';

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