import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiRequest, getAuthToken, setAuthToken } from '../lib/api';
import type { CustomerRecord, NotificationItem, Profile } from '../types';

interface AuthContextValue {
  profile: Profile | null;
  customer: CustomerRecord | null;
  loading: boolean;
  notifications: NotificationItem[];
  unreadCount: number;
  lastRealtimeEvent: { type: string; payload: any; seq: number } | null;
  toast: { id: number; message: string; tone: 'success' | 'error' | 'info' } | null;
  showToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
  login: (email: string, password: string, expectedRole?: 'customer' | 'admin') => Promise<Profile>;
  register: (payload: {
    full_name: string;
    email: string;
    phone: string;
    password: string;
    company_name?: string;
  }) => Promise<Profile>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [lastRealtimeEvent, setLastRealtimeEvent] = useState<{ type: string; payload: any; seq: number } | null>(
    null
  );
  const [toast, setToast] = useState<{ id: number; message: string; tone: 'success' | 'error' | 'info' } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const seqRef = useRef(0);

  const showToast = useCallback((message: string, tone: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setToast({ id, message, tone });
    setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 4000);
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!getAuthToken()) {
      setNotifications([]);
      return;
    }
    try {
      const list = await apiRequest<NotificationItem[]>('/api/notifications');
      setNotifications(list);
    } catch {
      // ignore if unauthenticated
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setProfile(null);
      setCustomer(null);
      setLoading(false);
      return;
    }
    try {
      const data = await apiRequest<{ profile: Profile; customer: CustomerRecord | null }>('/api/auth/me');
      setProfile(data.profile);
      setCustomer(data.customer);
      await refreshNotifications();
    } catch {
      setAuthToken(null);
      setProfile(null);
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, [refreshNotifications]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Real-time WebSocket connection
  useEffect(() => {
    if (!profile) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        const token = getAuthToken();
        if (token) {
          ws.send(JSON.stringify({ type: 'auth', token }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'notification:new' && msg.payload) {
            setNotifications((prev) => {
              if (prev.some((n) => n.id === msg.payload.id)) return prev;
              return [{ ...msg.payload, is_read: false }, ...prev];
            });
            showToast(msg.payload.title, 'info');
          }
          seqRef.current += 1;
          setLastRealtimeEvent({ type: msg.type, payload: msg.payload, seq: seqRef.current });
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        if (!closed) {
          reconnectTimer = setTimeout(connect, 2500);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [profile?.id, showToast]);

  const login = async (email: string, password: string, expectedRole?: 'customer' | 'admin') => {
    const res = await apiRequest<{ token: string; profile: Profile; customer: CustomerRecord | null }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, expectedRole }),
      }
    );
    setAuthToken(res.token);
    setProfile(res.profile);
    setCustomer(res.customer);
    await refreshNotifications();
    return res.profile;
  };

  const register = async (payload: {
    full_name: string;
    email: string;
    phone: string;
    password: string;
    company_name?: string;
  }) => {
    const res = await apiRequest<{ token: string; profile: Profile; customer: CustomerRecord | null }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    setAuthToken(res.token);
    setProfile(res.profile);
    setCustomer(res.customer);
    await refreshNotifications();
    return res.profile;
  };

  const logout = () => {
    setAuthToken(null);
    setProfile(null);
    setCustomer(null);
    setNotifications([]);
  };

  const markNotificationRead = async (id: string) => {
    await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const markAllNotificationsRead = async () => {
    await apiRequest(`/api/notifications/read-all`, { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <AuthContext.Provider
      value={{
        profile,
        customer,
        loading,
        notifications,
        unreadCount,
        lastRealtimeEvent,
        toast,
        showToast,
        login,
        register,
        logout,
        refreshUser,
        refreshNotifications,
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm font-medium shadow-lg transition-all ${
            toast.tone === 'error'
              ? 'border-rose-300 bg-rose-950 text-rose-100'
              : toast.tone === 'info'
                ? 'border-amber-400/50 bg-slate-900 text-amber-100'
                : 'border-emerald-400/40 bg-slate-900 text-emerald-100'
          }`}
        >
          {toast.message}
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
