import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import LandingPage from '@/pages/Landing';
import LoginPage from '@/pages/auth/Login';
import SignupPage from '@/pages/auth/Signup';
import FaceScanSetup from '@/pages/auth/FaceScanSetup';
import ProfileSetup from '@/pages/auth/ProfileSetup';
import MessagesScreen from '@/pages/Messages';
import SearchScreen from '@/pages/Search';
import RequestsScreen from '@/pages/Requests';
import TeamsScreen from '@/pages/Teams';
import NotificationsScreen from '@/pages/Notifications';
import ProfileScreen from '@/pages/Profile';
import SettingsScreen from '@/pages/Settings';
import './App.css';
import ClickSpark from '@/components/ui/ClickSpark';
import { ProfileModal } from '@/components/ui/ProfileModal';

function App() {
  const { initialize, isAuthenticated } = useAuthStore();

  // Initialize auth state on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Connect/disconnect socket based on auth state
  useEffect(() => {
    if (isAuthenticated) {
      connectSocket();
    } else {
      disconnectSocket();
    }
    return () => { disconnectSocket(); };
  }, [isAuthenticated]);

  return (
    <ClickSpark sparkColor="#7C3AED" sparkSize={8}>
      <Router>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* Auth setup routes (need to be logged in but part of onboarding) */}
          <Route path="/setup/face-scan" element={<ProtectedRoute><FaceScanSetup /></ProtectedRoute>} />
          <Route path="/setup/profile" element={<ProtectedRoute><ProfileSetup /></ProtectedRoute>} />

          {/* Protected routes */}
          <Route path="/messages" element={<ProtectedRoute><MessagesScreen /></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute><SearchScreen /></ProtectedRoute>} />
          <Route path="/requests" element={<ProtectedRoute><RequestsScreen /></ProtectedRoute>} />
          <Route path="/teams" element={<ProtectedRoute><TeamsScreen /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><NotificationsScreen /></ProtectedRoute>} />
          <Route path="/profile/:username?" element={<ProtectedRoute><ProfileScreen /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsScreen /></ProtectedRoute>} />

          {/* Redirect unknown routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ProfileModal />
      </Router>
    </ClickSpark>
  );
}

export default App;
