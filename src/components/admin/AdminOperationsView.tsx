import React, { useState } from 'react';
import { Edit2, Plus, Trash2, Upload } from 'lucide-react';
import { apiRequest, formatDateShort, formatINR, uploadImageFile } from '../../lib/api';
import { StatusText } from '../CommonUI';
import type { Booking, CustomerRecord, ServiceItem, Worker } from '../../types';

export function AdminCustomersView({
  customers,
  bookings,
  onReload,
  showToast,
}: {
  customers: CustomerRecord[];
  bookings: Booking[];
  onReload: () => Promise<void>;
  showToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(customers[0]?.id || null);
  const selected = customers.find((c) => c.id === selectedId) || null;
  const [noteInput, setNoteInput] = useState('');

  React.useEffect(() => {
    if (selected) setNoteInput(selected.private_notes || '');
  }, [selected?.id]);

  const customerBookings = bookings.filter((b) => b.customer_id === selected?.id);

  const saveNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    await apiRequest(`/api/customers/${selected.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ private_notes: noteInput }),
    });
    await onReload();
    showToast('Customer notes saved.', 'success');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Customer Management</h1>
        <p className="text-sm text-slate-600 mt-1">
          View registered clients, contact details, booking history, payment balances, and private owner notes.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-2.5">
          {customers.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left rounded-xl border p-4 transition-colors cursor-pointer ${
                selected?.id === c.id
                  ? 'border-amber-500 bg-amber-50/40'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sm text-slate-900">{c.full_name}</p>
                <span className="font-mono text-xs font-bold text-slate-900 tabular-nums">
                  {formatINR(c.total_paid)} paid
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {c.email} · {c.phone}
              </p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>{c.booking_count || 0} bookings</span>
                {(c.outstanding_balance || 0) > 0 && (
                  <span className="text-rose-700 font-semibold font-mono">
                    Due: {formatINR(c.outstanding_balance)}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-7">
          {selected && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
              <div className="border-b border-slate-200 pb-4">
                <h2 className="font-display text-xl font-bold text-slate-900">{selected.full_name}</h2>
                <p className="text-xs text-slate-600 mt-1">
                  {selected.email} · <span className="font-mono">{selected.phone}</span>
                  {selected.company_name && ` · ${selected.company_name}`}
                </p>
                <div className="mt-3 flex flex-wrap gap-6 text-xs">
                  <span>
                    Total Paid: <strong className="font-mono text-emerald-700">{formatINR(selected.total_paid)}</strong>
                  </span>
                  <span>
                    Outstanding:{' '}
                    <strong className="font-mono text-rose-700">{formatINR(selected.outstanding_balance)}</strong>
                  </span>
                </div>
              </div>

              <form onSubmit={saveNotes} className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">Private Owner Notes</label>
                <textarea
                  rows={2}
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="Preferences, site access notes, credit terms..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 hover:text-slate-950 cursor-pointer"
                >
                  Save Private Note
                </button>
              </form>

              <div>
                <h3 className="text-xs font-bold text-slate-800 mb-2">
                  Booking History ({customerBookings.length})
                </h3>
                <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 text-xs">
                  {customerBookings.length === 0 ? (
                    <p className="p-4 text-slate-500">No bookings yet.</p>
                  ) : (
                    customerBookings.map((b) => (
                      <div key={b.id} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {b.booking_code} · {b.service_name}
                          </p>
                          <p className="text-slate-500">
                            {formatDateShort(b.event_date)} · {b.event_location}
                          </p>
                        </div>
                        <StatusText status={b.status} />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminWorkersView({
  workers,
  bookings,
  onReload,
  showToast,
}: {
  workers: Worker[];
  bookings: Booking[];
  onReload: () => Promise<void>;
  showToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    specialty: '',
    daily_rate: '1300',
    status: 'Available' as Worker['status'],
  });
  const [assign, setAssign] = useState({
    worker_id: workers[0]?.id || '',
    booking_id: bookings[0]?.id || '',
    scheduled_date: new Date().toISOString().slice(0, 10),
    shift: 'Full Day',
    role_notes: '',
  });

  const handleAddWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/workers', {
        method: 'POST',
        body: JSON.stringify({ ...form, daily_rate: Number(form.daily_rate) }),
      });
      setForm({ full_name: '', phone: '', specialty: '', daily_rate: '1300', status: 'Available' });
      await onReload();
      showToast('Technician added to roster.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to add worker', 'error');
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/worker-assignments', {
        method: 'POST',
        body: JSON.stringify(assign),
      });
      setAssign((prev) => ({ ...prev, role_notes: '' }));
      await onReload();
      showToast('Worker schedule updated.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Assignment failed', 'error');
    }
  };

  const handleDeleteWorker = async (id: string) => {
    await apiRequest(`/api/workers/${id}`, { method: 'DELETE' });
    await onReload();
    showToast('Worker removed.', 'success');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Worker &amp; Crew Management</h1>
        <p className="text-sm text-slate-600 mt-1">
          Manage electricians, riggers, DMX operators, and track event shift schedules.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={handleAddWorker} className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
          <h2 className="font-display text-base font-bold text-slate-900">Add Technician</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              placeholder="Full Name *"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <input
              type="tel"
              required
              placeholder="Phone Number *"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <input
              type="text"
              required
              placeholder="Specialty (e.g., Truss Rigging)"
              value={form.specialty}
              onChange={(e) => setForm({ ...form, specialty: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <input
              type="number"
              required
              placeholder="Daily Rate (₹)"
              value={form.daily_rate}
              onChange={(e) => setForm({ ...form, daily_rate: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Worker</span>
          </button>
        </form>

        <form onSubmit={handleAssign} className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
          <h2 className="font-display text-base font-bold text-slate-900">Schedule Worker Assignment</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              required
              value={assign.worker_id}
              onChange={(e) => setAssign({ ...assign, worker_id: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white"
            >
              <option value="">Select worker...</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.full_name}
                </option>
              ))}
            </select>
            <select
              required
              value={assign.booking_id}
              onChange={(e) => setAssign({ ...assign, booking_id: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white"
            >
              <option value="">Select booking...</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.booking_code} — {b.customer_name}
                </option>
              ))}
            </select>
            <input
              type="date"
              required
              value={assign.scheduled_date}
              onChange={(e) => setAssign({ ...assign, scheduled_date: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <input
              type="text"
              required
              placeholder="Shift (e.g., Night 6 PM - 1 AM)"
              value={assign.shift}
              onChange={(e) => setAssign({ ...assign, shift: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 hover:text-slate-950 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Assign to Event</span>
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {workers.map((w) => (
          <div key={w.id} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{w.full_name}</h3>
                <p className="text-xs text-slate-600">{w.specialty}</p>
                <p className="font-mono text-xs text-slate-500 mt-1">
                  {w.phone} · {formatINR(w.daily_rate)}/day
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusText status={w.status} />
                <button
                  onClick={() => handleDeleteWorker(w.id)}
                  className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {w.assignments && w.assignments.length > 0 && (
              <div className="border-t border-slate-100 pt-3 space-y-1.5">
                <p className="text-[11px] font-semibold text-slate-500">Assigned Projects</p>
                {w.assignments.map((a) => (
                  <div key={a.id} className="text-xs text-slate-700 flex justify-between">
                    <span>
                      <strong className="font-mono">{a.booking_code}</strong> · {a.shift}
                    </span>
                    <span className="font-mono text-slate-500">{formatDateShort(a.scheduled_date)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminServicesView({
  services,
  onReload,
  showToast,
}: {
  services: ServiceItem[];
  onReload: () => Promise<void>;
  showToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    category: 'Festive',
    description: '',
    image_url: '/src/assets/images/hero_event_lighting_1794573598488.jpg',
    starting_price: '15000',
    is_active: true,
    featured: false,
    packages: [{ name: 'Standard Setup', description: 'Complete installation & takedown', price: 15000, duration_hours: 8 }],
  });

  const openEdit = (s: ServiceItem) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      category: s.category,
      description: s.description,
      image_url: s.image_url,
      starting_price: String(s.starting_price),
      is_active: s.is_active,
      featured: s.featured,
      packages: s.packages.length
        ? s.packages.map((p) => ({
            name: p.name,
            description: p.description,
            price: p.price,
            duration_hours: p.duration_hours,
          }))
        : [{ name: 'Standard Package', description: '', price: s.starting_price, duration_hours: 8 }],
    });
    setShowForm(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImageFile(file);
      setForm((prev) => ({ ...prev, image_url: url }));
      showToast('Service image uploaded.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...form, starting_price: Number(form.starting_price || 0) };
      if (editingId) {
        await apiRequest(`/api/services/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Service updated.', 'success');
      } else {
        await apiRequest('/api/services', { method: 'POST', body: JSON.stringify(payload) });
        showToast('New service published.', 'success');
      }
      setShowForm(false);
      setEditingId(null);
      await onReload();
    } catch (err: any) {
      showToast(err.message || 'Save failed', 'error');
    }
  };

  const toggleActive = async (s: ServiceItem) => {
    await apiRequest(`/api/services/${s.id}`, {
      method: 'PUT',
      body: JSON.stringify({ is_active: !s.is_active }),
    });
    await onReload();
    showToast(`${s.name} ${s.is_active ? 'disabled' : 'enabled'}.`, 'info');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Service &amp; Package Management</h1>
          <p className="text-sm text-slate-600 mt-1">
            Add services, upload project photography, configure pricing packages, or toggle storefront visibility.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setForm({
              name: '',
              category: 'Festive',
              description: '',
              image_url: '/src/assets/images/hero_event_lighting_1794573598488.jpg',
              starting_price: '15000',
              is_active: true,
              featured: false,
              packages: [{ name: 'Standard Setup', description: '', price: 15000, duration_hours: 8 }],
            });
            setShowForm(!showForm);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer self-start"
        >
          <Plus className="h-4 w-4" />
          <span>{showForm ? 'Close Form' : 'Add New Service'}</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-slate-900">
            {editingId ? 'Edit Service' : 'Create Electrical Lighting Service'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Service Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category *</label>
              <input
                type="text"
                required
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Description *</label>
              <textarea
                rows={2}
                required
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Starting Price (₹) *</label>
              <input
                type="number"
                required
                value={form.starting_price}
                onChange={(e) => setForm({ ...form, starting_price: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
              <Upload className="h-3.5 w-3.5" />
              <span>{uploading ? 'Uploading...' : 'Upload Service Image'}</span>
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <span>Enabled on storefront</span>
            </label>
          </div>

          <div className="border-t border-slate-200 pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-800">Packages</p>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    packages: [...form.packages, { name: '', description: '', price: 20000, duration_hours: 8 }],
                  })
                }
                className="text-xs font-semibold text-amber-700 cursor-pointer"
              >
                + Add Package
              </button>
            </div>
            {form.packages.map((p, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input
                  type="text"
                  placeholder="Package Name"
                  value={p.name}
                  onChange={(e) => {
                    const next = [...form.packages];
                    next[idx].name = e.target.value;
                    setForm({ ...form, packages: next });
                  }}
                  className="col-span-4 rounded border border-slate-300 px-2.5 py-1.5 text-xs"
                />
                <input
                  type="text"
                  placeholder="Highlights / Scope"
                  value={p.description}
                  onChange={(e) => {
                    const next = [...form.packages];
                    next[idx].description = e.target.value;
                    setForm({ ...form, packages: next });
                  }}
                  className="col-span-5 rounded border border-slate-300 px-2.5 py-1.5 text-xs"
                />
                <input
                  type="number"
                  placeholder="Price"
                  value={p.price}
                  onChange={(e) => {
                    const next = [...form.packages];
                    next[idx].price = Number(e.target.value || 0);
                    setForm({ ...form, packages: next });
                  }}
                  className="col-span-2 rounded border border-slate-300 px-2 py-1.5 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, packages: form.packages.filter((_, i) => i !== idx) })}
                  className="col-span-1 text-slate-400 hover:text-rose-600 flex justify-center cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-amber-500 hover:text-slate-950 cursor-pointer"
          >
            {editingId ? 'Save Service Changes' : 'Publish Service'}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {services.map((s) => (
          <div
            key={s.id}
            className={`rounded-xl border bg-white overflow-hidden flex flex-col ${
              s.is_active ? 'border-slate-200' : 'border-slate-200 opacity-65'
            }`}
          >
            <img src={s.image_url} alt={s.name} className="aspect-[4/3] w-full object-cover" />
            <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>{s.category}</span>
                  <span className={s.is_active ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                    {s.is_active ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <h3 className="font-display text-lg font-bold text-slate-900">{s.name}</h3>
                <p className="font-mono text-xs font-semibold text-amber-700 mt-1 tabular-nums">
                  Starting {formatINR(s.starting_price)} · {s.packages.length} packages
                </p>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <button
                  onClick={() => openEdit(s)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-amber-700 cursor-pointer"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => toggleActive(s)}
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {s.is_active ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
