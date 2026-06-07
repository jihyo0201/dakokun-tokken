
export enum Role {
  Employee = 'Employee',
  Supervisor = 'Supervisor',
  Admin = 'Admin',
}

export enum RequestType {
  Correction = 'Correction',
  Overtime = 'Overtime',
}

export enum RequestStatus {
  Pending = 'Pending',
  Approved = 'Approved',
  Rejected = 'Rejected',
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  supervisorId?: string;
}

export interface TimeEntry {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  clockIn: string | null; // ISO 8601 format
  clockOut: string | null; // ISO 8601 format
  status: 'Normal' | 'Corrected';
}

export interface AttendanceRecord extends TimeEntry {
  userName: string;
  workDuration: number | null; // in hours
}

export interface Request {
  id: string; // FirestoreのドキュメントID
  userId: string;
  userName: string;
  supervisorId: string;
  type: string; // 例: '打刻修正', '残業申請'
  date: string; // 対象日付（例: '2025-07-12'）
  requestedTime: string; // 修正後の時刻や残業時間など
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  denialComment?: string; // 却下コメント
  createdAt: any; // Firestore Timestamp型
  updatedAt: any; // Firestore Timestamp型
}

export interface ManagedRequest extends Request {
  user: User;
}
