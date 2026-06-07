// App.tsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthProvider';
import { PrivateRoute } from './components/PrivateRoute';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* ログインページは誰でも見れる */}
          <Route path="/login" element={<LoginPage />} />

          {/* ログインが必要なページはPrivateRouteで保護 */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <DashboardPage />
              </PrivateRoute>
            }
          />

          {/* 必要なら他の保護ルートもここに追加 */}
          {/* 
          <Route 
            path="/settings" 
            element={
              <PrivateRoute>
                <SettingsPage />
              </PrivateRoute>
            }
          /> 
          */}
        </Routes>
      </Router>
    </AuthProvider>
  );
}

