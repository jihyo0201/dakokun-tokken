
import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { LogoutIcon, OctopusLogo, UserIcon } from './Icons';
import { Link } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import { createSuggestion } from '../firebase/attendance';

const Header: React.FC = () => {
    const { user, logout } = useAuth();
    const [suggestionOpen, setSuggestionOpen] = useState(false);
    const [suggestionBody, setSuggestionBody] = useState('');
    const [suggestionAnonymous, setSuggestionAnonymous] = useState(false);
    const [suggestionLoading, setSuggestionLoading] = useState(false);
    const [suggestionMsg, setSuggestionMsg] = useState('');

    const handleSuggestionSubmit = async () => {
        if (!user || !suggestionBody.trim()) return;
        setSuggestionLoading(true);
        setSuggestionMsg('');
        try {
            await createSuggestion({
                userId: user.uid,
                userName: user.name || user.email || '名無し',
                body: suggestionBody.trim(),
                isAnonymous: suggestionAnonymous,
            });
            setSuggestionMsg('送信しました！');
            setSuggestionBody('');
            setSuggestionAnonymous(false);
            setTimeout(() => { setSuggestionMsg(''); setSuggestionOpen(false); }, 1500);
        } catch {
            setSuggestionMsg('送信に失敗しました');
        } finally {
            setSuggestionLoading(false);
        }
    };

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
                {/* 目安箱：ログアウトボタンの下 */}
                {user && (
                    <div style={{ paddingBottom: 12 }}>
                        {!suggestionOpen ? (
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                    onClick={() => { setSuggestionOpen(true); setSuggestionMsg(''); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        background: 'none', border: '1px solid #c4b5fd', borderRadius: 6,
                                        padding: '4px 12px', fontSize: 13, color: '#7c3aed', cursor: 'pointer', fontWeight: 500,
                                    }}
                                >
                                    <svg width="14" height="14" fill="none" stroke="#7c3aed" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                    目安箱
                                </button>
                            </div>
                        ) : (
                            <div style={{
                                background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: 10,
                                padding: 14, marginTop: 4,
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <span style={{ fontWeight: 600, fontSize: 14, color: '#7c3aed' }}>目安箱 — 要望・改善提案</span>
                                    <button onClick={() => setSuggestionOpen(false)} style={{ background: 'none', border: 'none', fontSize: 18, color: '#999', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
                                </div>
                                <textarea
                                    value={suggestionBody}
                                    onChange={e => setSuggestionBody(e.target.value)}
                                    placeholder="改善してほしいこと、あったら嬉しい機能など..."
                                    maxLength={1000}
                                    style={{
                                        width: '100%', minHeight: 70, borderRadius: 6, border: '1px solid #d1d5db',
                                        padding: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box',
                                    }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#666', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={suggestionAnonymous} onChange={e => setSuggestionAnonymous(e.target.checked)} style={{ width: 14, height: 14 }} />
                                        匿名で投稿
                                    </label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {suggestionMsg && <span style={{ fontSize: 13, color: suggestionMsg === '送信しました！' ? '#059669' : '#dc2626', fontWeight: 500 }}>{suggestionMsg}</span>}
                                        <button
                                            onClick={handleSuggestionSubmit}
                                            disabled={suggestionLoading || !suggestionBody.trim()}
                                            style={{
                                                padding: '5px 16px', borderRadius: 6, background: '#7c3aed', color: '#fff',
                                                border: 'none', fontWeight: 'bold', fontSize: 13, cursor: 'pointer',
                                                opacity: suggestionLoading || !suggestionBody.trim() ? 0.5 : 1,
                                            }}
                                        >
                                            {suggestionLoading ? '送信中...' : '送信'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </header>
    );
};

export default Header;
