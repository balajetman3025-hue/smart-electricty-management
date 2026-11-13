import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import CustomerPortal from './pages/CustomerPortal';
import AdminPortal from './pages/AdminPortal';

function RequireRole({
  role,
  children,
}: {
  role: 'customer' | 'admin';
  children: React.ReactNode;
}) {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-300 text-sm">
        Loading workspace...
      </div>
    );
  }

  if (!profile) {
    return <Navigate to={`/auth?mode=login&role=${role}`} replace />;
  }

  if (profile.role !== role) {
    return <Navigate to={profile.role === 'admin' ? '/admin' : '/customer'} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/customer"
            element={
              <RequireRole role="customer">
                <CustomerPortal initialTab="dashboard" />
              </RequireRole>
            }
          />
          <Route
            path="/customer/book"
            element={
              <RequireRole role="customer">
                <CustomerPortal initialTab="book" />
              </RequireRole>
            }
          />
          <Route
            path="/customer/services"
            element={
              <RequireRole role="customer">
                <CustomerPortal initialTab="services" />
              </RequireRole>
            }
          />
          <Route
            path="/customer/bookings"
            element={
              <RequireRole role="customer">
                <CustomerPortal initialTab="bookings" />
              </RequireRole>
            }
          />
          <Route
            path="/customer/profile"
            element={
              <RequireRole role="customer">
                <CustomerPortal initialTab="profile" />
              </RequireRole>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireRole role="admin">
                <AdminPortal />
              </RequireRole>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
