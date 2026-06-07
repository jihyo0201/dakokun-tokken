import { Role, User, TimeEntry, Request, RequestType, RequestStatus, AttendanceRecord } from '../types';

// --- Date Helper Functions ---
const getDateString = (daysAgo: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
};

const getIsoTimestamp = (daysAgo: number, hour: number, minute: number, second: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  // Setting local time, then converting to ISO string
  date.setHours(hour, minute, second, 0);
  return date.toISOString();
};


// --- MOCK DATABASE ---

const users: User[] = [
  { id: 'user-1', name: '田中 太郎', email: 'tanaka@example.com', role: Role.Employee, supervisorId: 'user-supervisor-1' },
  { id: 'user-2', name: '佐藤 花子', email: 'sato@example.com', role: Role.Employee, supervisorId: 'user-supervisor-1' },
  { id: 'user-supervisor-1', name: '鈴木 一郎', email: 'suzuki@example.com', role: Role.Supervisor, supervisorId: 'user-admin-1' },
  { id: 'user-admin-1', name: '高橋 優子', email: 'takahashi@example.com', role: Role.Admin },
];

let timeEntries: TimeEntry[] = [
  // Yesterday
  { id: 't-2', userId: 'user-1', date: getDateString(1), clockIn: getIsoTimestamp(1, 9, 1, 15), clockOut: getIsoTimestamp(1, 18, 5, 20), status: 'Normal' },
  { id: 't-3', userId: 'user-2', date: getDateString(1), clockIn: getIsoTimestamp(1, 9, 30, 0), clockOut: getIsoTimestamp(1, 17, 45, 10), status: 'Normal' },
  { id: 't-4', userId: 'user-supervisor-1', date: getDateString(1), clockIn: getIsoTimestamp(1, 8, 55, 0), clockOut: getIsoTimestamp(1, 19, 0, 0), status: 'Normal' },
  
  // Day before yesterday
  { id: 't-0', userId: 'user-1', date: getDateString(2), clockIn: getIsoTimestamp(2, 9, 2, 30), clockOut: getIsoTimestamp(2, 18, 3, 45), status: 'Normal' },
  { id: 't-1', userId: 'user-2', date: getDateString(2), clockIn: getIsoTimestamp(2, 9, 28, 11), clockOut: getIsoTimestamp(2, 17, 40, 5), status: 'Normal' },

  // For older history
  { id: 't-5', userId: 'user-1', date: getDateString(3), clockIn: getIsoTimestamp(3, 8, 58, 0), clockOut: getIsoTimestamp(3, 18, 1, 0), status: 'Normal' },
  { id: 't-6', userId: 'user-1', date: getDateString(4), clockIn: getIsoTimestamp(4, 9, 10, 0), clockOut: getIsoTimestamp(4, 18, 15, 0), status: 'Normal' },
  { id: 't-7', userId: 'user-supervisor-1', date: getDateString(2), clockIn: getIsoTimestamp(2, 8, 59, 10), clockOut: getIsoTimestamp(2, 18, 45, 0), status: 'Normal' },
];

let requests: Request[] = [
  { id: 'r-1', userId: 'user-1', userName: '田中 太郎', type: RequestType.Correction, date: getDateString(2), requestedTime: '09:00', reason: '打刻を忘れました。', status: RequestStatus.Pending, createdAt: getIsoTimestamp(1, 10, 0, 0) },
  { id: 'r-2', userId: 'user-2', userName: '佐藤 花子', type: RequestType.Overtime, date: getDateString(0), requestedTime: '19:30', reason: '緊急の顧客対応のため。', status: RequestStatus.Approved, approverId: 'user-supervisor-1', createdAt: getIsoTimestamp(1, 11, 0, 0) },
  { id: 'r-3', userId: 'user-1', userName: '田中 太郎', type: RequestType.Correction, date: getDateString(3), requestedTime: '18:00', reason: '退勤打刻漏れ', status: RequestStatus.Rejected, approverId: 'user-supervisor-1', createdAt: getIsoTimestamp(2, 9, 0, 0) },
];

const db = { users, timeEntries, requests };

// --- API FUNCTIONS ---

const simulateNetwork = (delay = 500) => new Promise(res => setTimeout(res, delay));

const todayDateString = () => new Date().toISOString().split('T')[0];

export const api = {
  login: async (email: string): Promise<User | null> => {
    await simulateNetwork();
    const user = db.users.find(u => u.email === email);
    if (user) {
      sessionStorage.setItem('userId', user.id);
      return user;
    }
    return null;
  },

  logout: async (): Promise<void> => {
    await simulateNetwork(100);
    sessionStorage.removeItem('userId');
  },

  getCurrentUser: async (): Promise<User | null> => {
    await simulateNetwork(50);
    const userId = sessionStorage.getItem('userId');
    if (!userId) return null;
    return db.users.find(u => u.id === userId) || null;
  },

  getTodaysEntry: async (userId: string): Promise<TimeEntry | null> => {
    await simulateNetwork();
    const today = todayDateString();
    return db.timeEntries.find(e => e.userId === userId && e.date === today) || null;
  },

  clockIn: async (userId: string): Promise<TimeEntry> => {
    await simulateNetwork();
    const today = todayDateString();
    let entry = db.timeEntries.find(e => e.userId === userId && e.date === today);
    
    if (entry && entry.clockIn) {
      throw new Error("Already clocked in today.");
    }

    const newEntry: TimeEntry = {
      id: `t-${Date.now()}`,
      userId,
      date: today,
      clockIn: new Date().toISOString(),
      clockOut: null,
      status: 'Normal',
    };
    db.timeEntries.push(newEntry);
    return newEntry;
  },

  clockOut: async (userId: string): Promise<TimeEntry> => {
    await simulateNetwork();
    const today = todayDateString();
    const entryIndex = db.timeEntries.findIndex(e => e.userId === userId && e.date === today);
    
    if (entryIndex === -1 || !db.timeEntries[entryIndex].clockIn) {
      throw new Error("Cannot clock out without clocking in first.");
    }
    if (db.timeEntries[entryIndex].clockOut) {
        throw new Error("Already clocked out today.");
    }

    db.timeEntries[entryIndex].clockOut = new Date().toISOString();
    return db.timeEntries[entryIndex];
  },

  getUserAttendance: async (userId: string): Promise<TimeEntry[]> => {
    await simulateNetwork();
    return db.timeEntries.filter(e => e.userId === userId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },
  
  getManagedRequests: async (supervisorId: string): Promise<Request[]> => {
    await simulateNetwork();
    const managedUsers = db.users.filter(u => u.supervisorId === supervisorId);
    const managedUserIds = managedUsers.map(u => u.id);
    return db.requests.filter(r => managedUserIds.includes(r.userId)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  getManagedTeamAttendance: async (supervisorId: string): Promise<AttendanceRecord[]> => {
    await simulateNetwork();
    const managedUsers = db.users.filter(u => u.supervisorId === supervisorId);
    const managedUserIds = managedUsers.map(u => u.id);
    
    const teamTimeEntries = db.timeEntries.filter(entry => managedUserIds.includes(entry.userId));

    return teamTimeEntries.map(entry => {
      const user = db.users.find(u => u.id === entry.userId);
      let workDuration = null;
      if (entry.clockIn && entry.clockOut) {
          const start = new Date(entry.clockIn);
          const end = new Date(entry.clockOut);
          workDuration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      }
      return {
          ...entry,
          userName: user?.name || 'Unknown User',
          workDuration,
      };
    }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime() || a.userName.localeCompare(b.userName));
  },

  updateRequestStatus: async (requestId: string, status: RequestStatus, approverId: string): Promise<Request> => {
    await simulateNetwork();
    const requestIndex = db.requests.findIndex(r => r.id === requestId);
    if (requestIndex === -1) {
      throw new Error("Request not found.");
    }
    db.requests[requestIndex].status = status;
    db.requests[requestIndex].approverId = approverId;
    return db.requests[requestIndex];
  },

  createRequest: async (userId: string, type: RequestType, date: string, requestedTime: string, reason: string): Promise<Request> => {
    await simulateNetwork();
    const user = db.users.find(u => u.id === userId);
    if (!user) throw new Error("User not found.");

    const newRequest: Request = {
        id: `r-${Date.now()}`,
        userId,
        userName: user.name,
        type,
        date,
        requestedTime,
        reason,
        status: RequestStatus.Pending,
        createdAt: new Date().toISOString(),
    };
    db.requests.push(newRequest);
    return newRequest;
  },
  
  getAllAttendanceRecords: async (): Promise<AttendanceRecord[]> => {
    await simulateNetwork();
    return db.timeEntries.map(entry => {
      const user = db.users.find(u => u.id === entry.userId);
      let workDuration = null;
      if (entry.clockIn && entry.clockOut) {
          const start = new Date(entry.clockIn);
          const end = new Date(entry.clockOut);
          workDuration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      }
      return {
          ...entry,
          userName: user?.name || 'Unknown User',
          workDuration,
      };
    }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime() || a.userName.localeCompare(b.userName));
  },
  
  exportAttendanceToCSV: async (records: AttendanceRecord[]): Promise<void> => {
    await simulateNetwork(100);
    const headers = ['日付', '社員名', '出勤時刻', '退勤時刻', '労働時間(h)', 'ステータス'];
    const rows = records.map(r => [
        r.date,
        r.userName,
        r.clockIn ? new Date(r.clockIn).toLocaleTimeString('ja-JP') : '',
        r.clockOut ? new Date(r.clockOut).toLocaleTimeString('ja-JP') : '',
        r.workDuration !== null ? r.workDuration.toFixed(2) : '',
        r.status
    ]);

    let csvContent = "data:text/csv;charset=utf-8," 
        + headers.join(",") + "\n" 
        + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `dakokun_attendance_${todayDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};