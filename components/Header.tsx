
import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { LogoutIcon, OctopusLogo, UserIcon } from './Icons';
import { Link } from 'react-router-dom';
import NotificationBell from './NotificationBell';

const Header: React.FC = () => {
    const { user, logout } = useAuth();

    return (
        <header className="bg-white shadow-md">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-20">
                    <div className="flex items-center">
                        <OctopusLogo className="h-10 w-10 text-primary" />
                        <h1 className="ml-3 text-2xl font-bold text-gray-800">
                            だこくん
                        </h1>
                    </div>
                    {user && (
                        <div className="flex items-center space-x-4">
                            <NotificationBell />
                            <div className="flex items-center text-gray-600">
                                <UserIcon className="h-5 w-5 mr-2" />
                                <span>{user.name}</span>
                                <Link to="/profile" className="ml-3 text-sm text-primary underline hover:text-primary-dark">プロフィール編集</Link>
                            </div>
                            <button
                                onClick={logout}
                                className="flex items-center px-4 py-2 text-sm font-medium text-primary-dark border border-primary-dark rounded-md hover:bg-primary hover:text-white transition-colors duration-200"
                            >
                                <LogoutIcon className="h-5 w-5 mr-2" />
                                ログアウト
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;
