import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Plus, Trash2 } from 'lucide-react';
import { apiRequest, formatDateShort, formatINR } from '../../lib/api';
import { downloadFinancialExcelReport, downloadFinancialPDFReport } from '../../lib/exportUtils';
import type { Booking, ExpenseRecord, PaymentRecord } from '../../types';

export default function AdminFinanceView({
  bookings,
  payments,
  expenses,
  onReload,
  showToast,
}: {
  bookings: Booking[];
  payments: PaymentRecord[];
  expenses: ExpenseRecord[];
  onReload: () => Promise<void>;
  showToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const [period, setPeriod] = useState<'all' | 'daily' | 'monthly' | 'yearly'>('all');
  const [refDate, setRefDate] = useState(new Date().toISOString().slice(0, 10));

  // Record Payment State
  const [payForm, setPayForm] = useState({
    booking_id: bookings.find((b) => (b.remaining_balance || 0) > 0)?.id || bookings[0]?.id || '',
    payment_type: 'Partial' as 'Advance' | 'Partial' | 'Final',
    amount: '',
    payment_method: 'UPI',
    reference_no: '',
    payment_date: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  // Record Expense State
  const [expForm, setExpForm] = useState({
    category: 'Materials & Cables',
    description: '',
    amount: '',
    expense_date: new Date().toISOString().slice(0, 10),
    booking_id: '',
    vendor: '',
  });

  const filterByPeriod = (dateStr: string) => {
    if (period === 'all') return true;
    if (period === 'daily') return dateStr === refDate;
    if (period === 'monthly') return dateStr.slice(0, 7) === refDate.slice(0, 7);
    if (period === 'yearly') return dateStr.slice(0, 4) === refDate.slice(0, 4);
    return true;
  };

  const filteredPayments = useMemo(
    () => payments.filter((p) => filterByPeriod(p.payment_date)),
    [payments, period, refDate]
  );
  const filteredExpenses = useMemo(
    () => expenses.filter((e) => filterByPeriod(e.expense_date)),
    [expenses, period, refDate]
  );

  const totalCollected = filteredPayments.reduce((s, p) => s + Number(p.amount), 0);
  const totalExpenses = filteredExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const outstandingBookings = bookings.filter((b) => b.status !== 'Cancelled' && (b.remaining_balance || 0) > 0);
  const totalOutstanding = outstandingBookings.reduce((s, b) => s + Number(b.remaining_balance || 0), 0);

  const periodLabel =
    period === 'all'
      ? 'All Time'
      : period === 'daily'
        ? `Daily (${refDate})`
        : period === 'monthly'
          ? `Monthly (${refDate.slice(0, 7)})`
          : `Yearly (${refDate.slice(0, 4)})`;

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/payments', {
        method: 'POST',
        body: JSON.stringify({ ...payForm, amount: Number(payForm.amount) }),
      });
      setPayForm((prev) => ({ ...prev, amount: '', reference_no: '', notes: '' }));
      await onReload();
      showToast('Payment recorded and customer notified.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to record payment', 'error');
    }
  };

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          ...expForm,
          amount: Number(expForm.amount),
          booking_id: expForm.booking_id || null,
        }),
      });
      setExpForm((prev) => ({ ...prev, description: '', amount: '', vendor: '' }));
      await onReload();
      showToast('Expense entry recorded.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to record expense', 'error');
    }
  };

  const handleDeleteExpense = async (id: string) => {
    await apiRequest(`/api/expenses/${id}`, { method: 'DELETE' });
    await onReload();
    showToast('Expense removed.', 'success');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Financial Management &amp; Reports</h1>
          <p className="text-sm text-slate-600 mt-1">
            Record advance/partial/final payments, log expenses, and export daily, monthly, or yearly reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
            {(['all', 'daily', 'monthly', 'yearly'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize cursor-pointer ${
                  period === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {period !== 'all' && (
            <input
              type="date"
              value={refDate}
              onChange={(e) => setRefDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
            />
          )}
          <button
            onClick={() => downloadFinancialExcelReport(periodLabel, filteredPayments, filteredExpenses)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 cursor-pointer"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Export Excel</span>
          </button>
          <button
            onClick={() => downloadFinancialPDFReport(periodLabel, filteredPayments, filteredExpenses)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-500 hover:text-slate-950 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Revenue ({periodLabel})</p>
          <p className="font-mono text-2xl font-bold text-emerald-700 mt-1.5 tabular-nums">
            {formatINR(totalCollected)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Expenses ({periodLabel})</p>
          <p className="font-mono text-2xl font-bold text-rose-700 mt-1.5 tabular-nums">
            {formatINR(totalExpenses)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Net Cash Flow</p>
          <p className="font-mono text-2xl font-bold text-slate-900 mt-1.5 tabular-nums">
            {formatINR(totalCollected - totalExpenses)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">Total Outstanding Dues</p>
          <p className="font-mono text-2xl font-bold text-amber-700 mt-1.5 tabular-nums">
            {formatINR(totalOutstanding)}
          </p>
        </div>
      </div>

      {/* Forms: Record Payment & Record Expense */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={handleRecordPayment} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-slate-900">Record Customer Payment</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Booking *</label>
              <select
                required
                value={payForm.booking_id}
                onChange={(e) => setPayForm({ ...payForm, booking_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white"
              >
                <option value="">Select booking...</option>
                {bookings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.booking_code} — {b.customer_name} (Bal: {formatINR(b.remaining_balance)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Type *</label>
              <select
                value={payForm.payment_type}
                onChange={(e) => setPayForm({ ...payForm, payment_type: e.target.value as any })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white"
              >
                <option value="Advance">Advance</option>
                <option value="Partial">Partial</option>
                <option value="Final">Final</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (₹) *</label>
              <input
                type="number"
                min={1}
                required
                value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Method *</label>
              <select
                value={payForm.payment_method}
                onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white"
              >
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="NEFT">NEFT</option>
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date *</label>
              <input
                type="date"
                required
                value={payForm.payment_date}
                onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reference / Transaction ID</label>
              <input
                type="text"
                value={payForm.reference_no}
                onChange={(e) => setPayForm({ ...payForm, reference_no: e.target.value })}
                placeholder="UTR / UPI Ref No."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Record Payment</span>
          </button>
        </form>

        <form onSubmit={handleRecordExpense} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-slate-900">Record Business Expense</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category *</label>
              <select
                value={expForm.category}
                onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white"
              >
                <option>Materials &amp; Cables</option>
                <option>Crew Labor</option>
                <option>Transport &amp; Logistics</option>
                <option>Generator Fuel</option>
                <option>Equipment Purchase</option>
                <option>Shop Rent &amp; Utilities</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (₹) *</label>
              <input
                type="number"
                min={1}
                required
                value={expForm.amount}
                onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Description *</label>
              <input
                type="text"
                required
                value={expForm.description}
                onChange={(e) => setExpForm({ ...expForm, description: e.target.value })}
                placeholder="e.g., 4-core armored cable coil or technician overtime"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Vendor</label>
              <input
                type="text"
                value={expForm.vendor}
                onChange={(e) => setExpForm({ ...expForm, vendor: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date *</label>
              <input
                type="date"
                required
                value={expForm.expense_date}
                onChange={(e) => setExpForm({ ...expForm, expense_date: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 hover:text-slate-950 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Expense</span>
          </button>
        </form>
      </div>

      {/* Outstanding Balances + Ledger Tables */}
      {outstandingBookings.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-bold text-slate-900">Outstanding Customer Balances</h3>
          </div>
          <div className="divide-y divide-slate-200">
            {outstandingBookings.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-xs">
                <div>
                  <span className="font-mono font-bold text-slate-900">{b.booking_code}</span> ·{' '}
                  <span className="font-semibold text-slate-800">{b.customer_name}</span> ·{' '}
                  <span className="text-slate-500">{b.service_name}</span>
                </div>
                <div className="font-mono tabular-nums">
                  <span className="text-slate-500 mr-4">Paid: {formatINR(b.total_paid)}</span>
                  <span className="font-bold text-rose-700">Balance: {formatINR(b.remaining_balance)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-bold text-slate-900">Payments Ledger ({filteredPayments.length})</h3>
          </div>
          <div className="divide-y divide-slate-200 max-h-80 overflow-y-auto">
            {filteredPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3 text-xs">
                <div>
                  <p className="font-semibold text-slate-900">
                    {p.booking_code} · {p.customer_name}
                  </p>
                  <p className="text-slate-500">
                    {p.payment_type} · {p.payment_method} · {formatDateShort(p.payment_date)}
                  </p>
                </div>
                <span className="font-mono font-bold text-emerald-700 tabular-nums">+{formatINR(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-bold text-slate-900">Expenses Ledger ({filteredExpenses.length})</h3>
          </div>
          <div className="divide-y divide-slate-200 max-h-80 overflow-y-auto">
            {filteredExpenses.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-5 py-3 text-xs gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{e.description}</p>
                  <p className="text-slate-500">
                    {e.category} · {e.vendor || 'General'} · {formatDateShort(e.expense_date)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono font-bold text-rose-700 tabular-nums">-{formatINR(e.amount)}</span>
                  <button
                    onClick={() => handleDeleteExpense(e.id)}
                    className="text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
