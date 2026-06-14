import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { PrivateRoute } from './components/PrivateRoute';
import Header from './components/Header';

import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import RequestHistoryPage from './pages/RequestHistoryPage';
import AttendanceHistoryPage from './pages/AttendanceHistoryPage';
import ApprovalPage from './pages/ApprovalPage';
import SuggestionBoxPage from './pages/SuggestionBoxPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <AuthProvider>
      <div style={{ minHeight: '100vh', background: '#f5f6f8' }}>
        <Router>
          <Header />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
            <Route path="/requests" element={<PrivateRoute><RequestHistoryPage /></PrivateRoute>} />
            <Route path="/attendances" element={<PrivateRoute><AttendanceHistoryPage /></PrivateRoute>} />
            <Route path="/approvals" element={<PrivateRoute><ApprovalPage /></PrivateRoute>} />
            <Route path="/suggestions" element={<PrivateRoute><SuggestionBoxPage /></PrivateRoute>} />
            <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <DashboardPage />
                </PrivateRoute>
              }
            />
          </Routes>
        </Router>
      </div>
    </AuthProvider>
  );
}
