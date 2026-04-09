import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Navbar from './components/Navbar/Navbar';
import Toast from './components/Toast/Toast';
import Login from './pages/Login/Login';
import Dashboard from './pages/Dashboard/Dashboard';
import PatientInfo from './pages/PatientInfo/PatientInfo';
import Recording from './pages/Recording/Recording';
import Profile from './pages/Profile/Profile';
import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
import SuperAdmin from './pages/SuperAdmin/SuperAdmin';
import ForceChangePassword from './pages/ForceChangePassword/ForceChangePassword';
import './styles/globals.css';

// ── Route guards ──────────────────────────────────────────────────────────────

function ProtectedRoute({ children, allowedRoles }) {
  const { state, role } = useApp();

  // Still checking token on mount
  if (state.authLoading) {
    return (
      <div className="auth-loading">
        <div className="auth-spinner" />
      </div>
    );
  }

  if (!state.isAuthenticated) return <Navigate to="/login" replace />;

  // Force password change before anything else
  if (state.currentUser?.mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={defaultRouteForRole(role)} replace />;
  }

  return children;
}

function defaultRouteForRole(role) {
  if (role === 'SuperAdmin') return '/superadmin';
  if (role === 'Admin')      return '/admin';
  return '/dashboard';
}

// Redirect logged-in users away from /login to their home page
function PublicRoute({ children }) {
  const { state, role } = useApp();
  if (state.authLoading) return null;
  if (state.isAuthenticated && !state.currentUser?.mustChangePassword) {
    return <Navigate to={defaultRouteForRole(role)} replace />;
  }
  return children;
}

// ── App shell ─────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <>
      <Navbar />
      <Routes>
        {/* Public */}
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />

        {/* Force password change — accessible to all authenticated users */}
        <Route path="/change-password" element={<ForceChangePassword />} />

        {/* Doctor routes */}
        <Route path="/dashboard" element={
          <ProtectedRoute allowedRoles={['Doctor', 'Admin']}>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/patient" element={
          <ProtectedRoute allowedRoles={['Doctor', 'Admin']}>
            <PatientInfo />
          </ProtectedRoute>
        } />
        <Route path="/recording" element={
          <ProtectedRoute allowedRoles={['Doctor', 'Admin']}>
            <Recording />
          </ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        } />

        {/* Admin routes */}
        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={['Admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        } />

        {/* SuperAdmin routes */}
        <Route path="/superadmin" element={
          <ProtectedRoute allowedRoles={['SuperAdmin']}>
            <SuperAdmin />
          </ProtectedRoute>
        } />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <Toast />
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  );
}
