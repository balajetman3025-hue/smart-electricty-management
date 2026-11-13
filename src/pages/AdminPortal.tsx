import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  CalendarCheck,
  Home,
  IndianRupee,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Sparkles,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { apiRequest, formatDateShort } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { BrandMark } from '../components/CommonUI';
import AdminAnalyticsView from '../components/admin/AdminAnalyticsView';
import AdminBookingsView from '../components/admin/AdminBookingsView';
import AdminInventoryView from '../components/admin/AdminInventoryView';
import AdminFinanceView from '../components/admin/AdminFinanceView';
import {
  AdminCustomersView,
  AdminServicesView,
  AdminWorkersView,
} from '../components/admin/AdminOperationsView';
import type {
  AdminAnalytics,
  Booking,
  CustomerRecord,
  ExpenseRecord,
  InventoryItem,
  PaymentRecord,
  ServiceItem,
  Worker,
} from '../types';

type AdminTab =
  | 'overview'
  | 'bookings'
  | 'inventory'
  | 'customers'
  | 'workers'
  | 'finance'
  | 'services'
  | 'notifications';

export default function AdminPortal() {
  const {
    profile,
    notifications,
    unreadCount,
    lastRealtimeEvent,
    logout,
    markNotificationRead,
    markAllNotificationsRead,
    showToast,
  } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);

  const loadAdminData = useCallback(async () => {
    try {
      const [an, bk, inv, cust, wrk, pay, exp, svc] = await Promise.all([
        apiRequest<AdminAnalytics>('/api/analytics'),
        apiRequest<Booking[]>('/api/bookings'),
        apiRequest<InventoryItem[]>('/api/inventory'),
        apiRequest<CustomerRecord[]>('/api/customers'),
        apiRequest<Worker[]>('/api/workers'),
        apiRequest<PaymentRecord[]>('/api/payments'),
        apiRequest<ExpenseRecord[]>('/api/expenses'),
        apiRequest<ServiceItem[]>('/api/services?includeInactive=true'),
      ]);
      setAnalytics(an);
      setBookings(bk);
      setInventory(inv);
      setCustomers(cust);
      setWorkers(wrk);
      setPayments(pay);
      setExpenses(exp);
      setServices(svc);
    } catch (err: any) {
      showToast(err.message || 'Failed to load admin records', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  // Real-time synchronization via WebSockets
  useEffect(() => {
    if (!lastRealtimeEvent) return;
    if (
      [
        'booking:created',
        'booking:updated',
        'payment:recorded',
        'inventory:updated',
        'customer:registered',
        'service:updated',
      ].includes(lastRealtimeEvent.type)
    ) {
      loadAdminData();
    }
  }, [lastRealtimeEvent, loadAdminData]);

  const navItems: { id: AdminTab; label: string; Icon: React.ComponentType<any>; badge?: number }[] = [
    { id: 'overview', label: 'Analytics', Icon: LayoutDashboard },
    { id: 'bookings', label: 'Bookings', Icon: CalendarCheck, badge: analytics?.kpis.pendingRequests },
    { id: 'inventory', label: 'Inventory', Icon: Package, badge: analytics?.kpis.lowStockCount },
    { id: 'customers', label: 'Customers', Icon: Users },
    { id: 'workers', label: 'Workers', Icon: Wrench },
    { id: 'finance', label: 'Finance', Icon: IndianRupee },
    { id: 'services', label: 'Services', Icon: Sparkles },
    { id: 'notifications', label: 'Notifications', Icon: Bell, badge: unreadCount },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-slate-950 text-slate-200 border-r border-slate-800 shrink-0">
        <div className="px-5 py-5 border-b border-slate-800">
          <Link to="/">
            <BrandMark dark />
          </Link>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          {navItems.map(({ id, label, Icon, badge }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                activeTab === id
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3 whitespace-nowrap">
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </span>
              {badge !== undefined && badge > 0 && (
                <span
                  className={`font-mono text-xs tabular-nums ${
                    activeTab === id ? 'text-slate-950' : 'text-amber-400'
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
          <div className="px-2 py-1">
            <p className="text-xs font-semibold text-white truncate">{profile?.full_name} (Owner)</p>
            <p className="text-[11px] text-slate-400 truncate">{profile?.email}</p>
          </div>
          <Link
            to="/"
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-900 hover:text-white"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Public Homepage</span>
          </Link>
          <button
            onClick={() => {
              logout();
              navigate('/');
            }}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-950/50 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/70" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-64 bg-slate-950 text-slate-100 flex flex-col p-4 z-10">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <BrandMark dark />
              <button onClick={() => setMobileMenuOpen(false)} className="p-1.5 text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 py-4 space-y-1">
              {navItems.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => {
                    setActiveTab(id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                    activeTab === id ? 'bg-amber-500 text-slate-950' : 'text-slate-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
            <button
              onClick={() => {
                logout();
                navigate('/');
              }}
              className="flex items-center gap-2 px-3 py-2.5 text-sm text-rose-300"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <p className="text-xs text-slate-500 truncate">
              Shop Owner Panel / {navItems.find((n) => n.id === activeTab)?.label}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setActiveTab('notifications')}
              className="relative rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 cursor-pointer"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 font-mono text-[10px] font-bold text-slate-950">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('bookings')}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 hover:text-slate-950 transition-colors whitespace-nowrap cursor-pointer"
            >
              Review Bookings
            </button>
          </div>
        </header>

        <main className="flex-1 p-5 sm:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'overview' && (
            <AdminAnalyticsView
              analytics={analytics}
              onOpenBookings={() => setActiveTab('bookings')}
              onOpenInventory={() => setActiveTab('inventory')}
            />
          )}

          {activeTab === 'bookings' && (
            <AdminBookingsView
              bookings={bookings}
              inventory={inventory}
              workers={workers}
              onReload={loadAdminData}
              showToast={showToast}
            />
          )}

          {activeTab === 'inventory' && (
            <AdminInventoryView inventory={inventory} onReload={loadAdminData} showToast={showToast} />
          )}

          {activeTab === 'customers' && (
            <AdminCustomersView
              customers={customers}
              bookings={bookings}
              onReload={loadAdminData}
              showToast={showToast}
            />
          )}

          {activeTab === 'workers' && (
            <AdminWorkersView
              workers={workers}
              bookings={bookings}
              onReload={loadAdminData}
              showToast={showToast}
            />
          )}

          {activeTab === 'finance' && (
            <AdminFinanceView
              bookings={bookings}
              payments={payments}
              expenses={expenses}
              onReload={loadAdminData}
              showToast={showToast}
            />
          )}

          {activeTab === 'services' && (
            <AdminServicesView services={services} onReload={loadAdminData} showToast={showToast} />
          )}

          {activeTab === 'notifications' && (
            <div className="max-w-3xl space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">Owner Notifications</h1>
                  <p className="text-sm text-slate-600 mt-1">
                    New booking requests, customer registrations, quotation responses, payments, and low inventory alerts.
                  </p>
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllNotificationsRead}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-200">
                {notifications.length === 0 ? (
                  <p className="p-8 text-center text-sm text-slate-500">No owner notifications yet.</p>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-5 flex items-start justify-between gap-4 ${!n.is_read ? 'bg-amber-50/40' : ''}`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                        <p className="text-xs text-slate-600 mt-1">{n.message}</p>
                        <p className="text-[11px] font-mono text-slate-400 mt-2">{formatDateShort(n.created_at)}</p>
                      </div>
                      {!n.is_read && (
                        <button
                          onClick={() => markNotificationRead(n.id)}
                          className="text-xs font-semibold text-amber-700 hover:text-amber-800 whitespace-nowrap cursor-pointer"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
