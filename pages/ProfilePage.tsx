import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../firebase/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { getLeaveBalances, getCompensatoryBalance } from '../firebase/attendance';

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [leaveBalances, setLeaveBalances] = useState<any[]>([]);
  const [compBalance, setCompBalance] = useState<{ earned: number; used: number } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      getLeaveBalances(user.uid).then(setLeaveBalances);
      getCompensatoryBalance(user.uid).then(b => {
        if (b) setCompBalance({ earned: (b as any).earned || 0, used: (b as any).used || 0 });
      });
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);
    try {
      if (!user) throw new Error('ユーザー情報が取得できません');
      if (!name.trim()) throw new Error('名前を入力してください');
      await updateDoc(doc(db, 'users', user.uid), { name: name.trim() });
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || '保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '40px auto', background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px #0001', padding: 32 }}>
      <h2 style={{ fontWeight: 'bold', fontSize: 22, marginBottom: 20 }}>プロフィール編集</h2>
      <form onSubmit={handleSave}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontWeight: 500 }}>メールアドレス</label>
          <div style={{ background: '#f3f4f6', borderRadius: 6, padding: 10, marginTop: 4 }}>{email}</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontWeight: 500 }}>勤務区分</label>
          <div style={{ background: '#f3f4f6', borderRadius: 6, padding: 10, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              borderRadius: 6, padding: '2px 10px', fontWeight: 700, fontSize: 13,
              background: (user as any)?.workScheduleType === 'deemed' ? '#fef9c3' : (user as any)?.workScheduleType === 'managerial' ? '#e0e7ff' : (user as any)?.workScheduleType === 'short_flex' ? '#dbeafe' : '#f0fdf4',
              color: (user as any)?.workScheduleType === 'deemed' ? '#b45309' : (user as any)?.workScheduleType === 'managerial' ? '#4338ca' : (user as any)?.workScheduleType === 'short_flex' ? '#1d4ed8' : '#15803d',
            }}>
              {({ regular: '通常勤務', deemed: 'みなし労働時間制', managerial: '管理監督者', short_flex: '時短勤務+フレックス' } as Record<string, string>)[(user as any)?.workScheduleType || 'regular']}
            </span>
            {(user as any)?.workScheduleType === 'deemed' && <span style={{ fontSize: 13, color: '#666' }}>（みなし {(user as any)?.deemedHours ?? 8}h/日）</span>}
            {(user as any)?.workScheduleType === 'short_flex' && <span style={{ fontSize: 13, color: '#666' }}>（所定 {(user as any)?.prescribedDailyHours ?? 6}h/日）</span>}
          </div>
        </div>
        {leaveBalances.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontWeight: 500 }}>有休残日数</label>
            <div style={{ background: '#f0fdf4', borderRadius: 6, padding: 12, marginTop: 4 }}>
              {leaveBalances.map((b: any) => {
                const remaining = (b.granted || 0) + (b.carried || 0) - (b.used || 0);
                return (
                  <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 14 }}>
                    <span style={{ color: '#555' }}>{b.fiscalYear}年度</span>
                    <span style={{ fontWeight: 700, color: remaining <= 0 ? '#dc2626' : '#15803d' }}>
                      {remaining}日 <span style={{ fontWeight: 400, color: '#888', fontSize: 12 }}>（付与{b.granted} + 繰越{b.carried} - 消化{b.used}）</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {compBalance && (compBalance.earned - compBalance.used) > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontWeight: 500 }}>代休残日数</label>
            <div style={{ background: '#eff6ff', borderRadius: 6, padding: 12, marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                <span style={{ color: '#1e40af', fontWeight: 700 }}>{compBalance.earned - compBalance.used}日</span>
                <span style={{ fontWeight: 400, color: '#888', fontSize: 12 }}>（取得権利{compBalance.earned} - 消化{compBalance.used}）</span>
              </div>
            </div>
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontWeight: 500 }}>名前</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc', marginTop: 4 }}
            placeholder="あなたの名前"
            required
          />
        </div>
        {error && <div style={{ color: 'red', marginBottom: 10 }}>{error}</div>}
        {success && <div style={{ color: '#22c55e', marginBottom: 10 }}>保存しました！</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={() => navigate(-1)} style={{ padding: '8px 20px', borderRadius: 8, background: '#eee', color: '#333', border: 'none', fontWeight: 'bold', fontSize: 15, cursor: 'pointer' }}>戻る</button>
          <button type="submit" disabled={loading} style={{ padding: '8px 24px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: 15, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>{loading ? '保存中...' : '保存'}</button>
        </div>
      </form>
    </div>
  );
};

export default ProfilePage; 