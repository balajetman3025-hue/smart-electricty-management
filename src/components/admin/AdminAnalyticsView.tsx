import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatINR } from '../../lib/api';
import type { AdminAnalytics } from '../../types';

const PIE_COLORS = ['#0f172a', '#f59e0b', '#10b981', '#e11d48'];

export default function AdminAnalyticsView({
  analytics,
  onOpenBookings,
  onOpenInventory,
}: {
  analytics: AdminAnalytics | null;
  onOpenBookings: () => void;
  onOpenInventory: () => void;
}) {
  if (!analytics) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-slate-200 bg-white animate-pulse" />
        ))}
      </div>
    );
  }

  const { kpis, monthlyRevenue, monthlyBookings, popularServices, paymentStats } = analytics;

  const cards = [
    { label: 'Total Customers', value: String(kpis.totalCustomers), accent: 'text-slate-900' },
    { label: 'Total Bookings', value: String(kpis.totalBookings), accent: 'text-slate-900' },
    { label: "Today's Bookings", value: String(kpis.todaysBookings), accent: 'text-sky-700' },
    { label: 'Pending Requests', value: String(kpis.pendingRequests), accent: 'text-amber-700' },
    { label: 'Active Projects', value: String(kpis.activeProjects), accent: 'text-indigo-700' },
    { label: 'Completed Projects', value: String(kpis.completedProjects), accent: 'text-emerald-700' },
    { label: 'Total Revenue', value: formatINR(kpis.totalRevenue), accent: 'text-emerald-700' },
    { label: 'Outstanding Payments', value: formatINR(kpis.outstandingPayments), accent: 'text-rose-700' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Business Overview</h1>
          <p className="text-sm text-slate-600 mt-1">
            Live operational metrics computed directly from bookings, quotations, payments, and stock ledger.
          </p>
        </div>

        {kpis.lowStockCount > 0 && (
          <button
            onClick={onOpenInventory}
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer self-start"
          >
            {kpis.lowStockCount} Low Stock {kpis.lowStockCount === 1 ? 'Item' : 'Items'} — Restock Inventory
          </button>
        )}
      </div>

      {/* 8 Real-Time KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">{c.label}</p>
            <p className={`font-mono text-2xl font-bold mt-2 tabular-nums ${c.accent}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* 4 Recharts Analytics Graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Revenue & Expenses */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">Monthly Revenue &amp; Expenses</h2>
              <p className="text-xs text-slate-500">Collected payments vs recorded operational costs</p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#475569' }} />
                <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip formatter={(val: any) => formatINR(Number(val))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="revenue" name="Revenue" fill="#0f172a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly Bookings */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">Monthly Bookings Trend</h2>
              <p className="text-xs text-slate-500">Total inquiries booked vs completed events</p>
            </div>
            <button
              onClick={onOpenBookings}
              className="text-xs font-semibold text-amber-700 hover:text-amber-800 cursor-pointer"
            >
              Manage →
            </button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyBookings}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#475569' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="bookings" name="Total Bookings" stroke="#0f172a" strokeWidth={2.5} />
                <Line type="monotone" dataKey="completed" name="Completed" stroke="#10b981" strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Most Popular Services */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-display text-base font-bold text-slate-900 mb-1">Most Popular Services</h2>
          <p className="text-xs text-slate-500 mb-4">Booking volume by electrical decoration category</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={popularServices} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis dataKey="name" type="category" width={145} tick={{ fontSize: 11, fill: '#334155' }} />
                <Tooltip />
                <Bar dataKey="count" name="Bookings" fill="#d97706" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Statistics */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-display text-base font-bold text-slate-900 mb-1">Payment Statistics</h2>
          <p className="text-xs text-slate-500 mb-4">Collection breakdown across advances, partials, settlements &amp; dues</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={paymentStats}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={88}
                  paddingAngle={3}
                >
                  {paymentStats.map((_, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val: any) => formatINR(Number(val))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
