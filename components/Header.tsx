
import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { LogoutIcon, OctopusLogo, UserIcon } from './Icons';
import { Link } from 'react-router-dom';
import NotificationBell from './NotificationBell';

const Header: React.FC = () => {
    const { user, logout } = useAuth();

    return (
        <header style={{ background: '#fff', boxShadow: '0 1px 4px #0001' }}>
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <OctopusLogo className="h-10 w-10 text-primary" />
                        <h1 style={{ marginLeft: 12, fontSize: 22, fontWeight: 'bold', color: '#1f2937' }}>
                            だこくん
                        </h1>
                    </div>
                    {user && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <NotificationBell />
                            <div style={{ display: 'flex', alignItems: 'center', color: '#4b5563', fontSize: 14 }}>
                                <UserIcon className="h-5 w-5 mr-2" />
                                <span>{user.name}</span>
                                <Link to="/profile" style={{ marginLeft: 12, fontSize: 13, color: '#2563eb', textDecoration: 'underline' }}>プロフィール編集</Link>
                            </div>
                            <button
                                onClick={logout}
                                style={{
                                    display: 'flex', alignItems: 'center', padding: '6px 14px', fontSize: 13, fontWeight: 500,
                                    color: '#1e40af', border: '1px solid #1e40af', borderRadius: 6, background: 'transparent', cursor: 'pointer',
                                }}
                            >
                                <LogoutIcon className="h-5 w-5 mr-2" />
                                ログアウト
                            </button>
                        </div>
                    )}
                </div>
                {user && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 10 }}>
                        <a
                            href="https://forms.gle/kdvKZeAi4UkyBUuE7"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                background: 'none', border: '1px solid #c4b5fd', borderRadius: 6,
                                padding: '4px 12px', fontSize: 13, color: '#7c3aed', textDecoration: 'none', fontWeight: 500,
                            }}
                        >
                            <svg width="14" height="14" fill="none" stroke="#7c3aed" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                            目安箱
                        </a>
                    </div>
                )}
            </div>
        </header>
    );
};

export default Header;
