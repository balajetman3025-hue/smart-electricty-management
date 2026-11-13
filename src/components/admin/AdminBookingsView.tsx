import React, { useEffect, useState } from 'react';
import {
  Check,
  Download,
  FileText,
  Package,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { apiRequest, formatDateShort, formatINR, uploadImageFile } from '../../lib/api';
import { downloadBookingInvoicePDF } from '../../lib/exportUtils';
import { StatusText } from '../CommonUI';
import {
  BOOKING_STATUSES,
  type Booking,
  type BookingStatus,
  type InventoryItem,
  type QuotationLineItem,
  type Worker,
} from '../../types';

export default function AdminBookingsView({
  bookings,
  inventory,
  workers,
  onReload,
  showToast,
}: {
  bookings: Booking[];
  inventory: InventoryItem[];
  workers: Worker[];
  onReload: () => Promise<void>;
  showToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [selectedId, setSelectedId] = useState<string | null>(bookings[0]?.id || null);

  const selected = bookings.find((b) => b.id === selectedId) || null;

  // Booking Edit State
  const [editStatus, setEditStatus] = useState<BookingStatus>('Pending');
  const [siteVisitDate, setSiteVisitDate] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Quotation Builder State
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [lineItems, setLineItems] = useState<QuotationLineItem[]>([]);
  const [taxAmount, setTaxAmount] = useState('0');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [advanceRequired, setAdvanceRequired] = useState('');
  const [validUntil, setValidUntil] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [quoteNotes, setQuoteNotes] = useState('');

  // Worker Assignment State
  const [assignWorkerId, setAssignWorkerId] = useState('');
  const [assignDate, setAssignDate] = useState('');
  const [assignShift, setAssignShift] = useState('Morning (9 AM - 6 PM)');
  const [assignNotes, setAssignNotes] = useState('');

  // Inventory Allocation State
  const [allocInvId, setAllocInvId] = useState('');
  const [allocQty, setAllocQty] = useState('1');

  useEffect(() => {
    if (!selected && bookings.length > 0) {
      setSelectedId(bookings[0].id);
    }
  }, [bookings, selected]);

  useEffect(() => {
    if (!selected) return;
    setEditStatus(selected.status);
    setSiteVisitDate(selected.site_visit_date || '');
    setEstimatedCost(String(selected.estimated_cost || 0));
    setInternalNotes(selected.internal_notes || '');
    setAssignDate(selected.event_date);
    setShowQuoteForm(false);
    if (selected.quotation?.line_items?.length) {
      setLineItems(selected.quotation.line_items);
      setTaxAmount(String(selected.quotation.tax_amount || 0));
      setDiscountAmount(String(selected.quotation.discount_amount || 0));
      setAdvanceRequired(String(selected.quotation.advance_required || 0));
      setValidUntil(selected.quotation.valid_until);
      setQuoteNotes(selected.quotation.notes || '');
    } else {
      setLineItems([
        {
          id: crypto.randomUUID(),
          description: `${selected.service_name || selected.event_type} (${selected.venue_size})`,
          quantity: 1,
          unit_price: Number(selected.estimated_budget || 25000),
          total: Number(selected.estimated_budget || 25000),
        },
      ]);
      setTaxAmount('0');
      setDiscountAmount('0');
      setAdvanceRequired('');
      setQuoteNotes('Includes setup, weatherproof connections, and standby technician.');
    }
  }, [selected?.id]);

  const filtered = bookings.filter((b) => {
    const matchesStatus = statusFilter === 'All' || b.status === statusFilter;
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      b.booking_code.toLowerCase().includes(q) ||
      b.customer_name.toLowerCase().includes(q) ||
      b.event_location.toLowerCase().includes(q) ||
      (b.service_name || '').toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const handleSaveBookingUpdate = async (overrideStatus?: BookingStatus) => {
    if (!selected) return;
    try {
      await apiRequest(`/api/bookings/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: overrideStatus || editStatus,
          site_visit_date: siteVisitDate || null,
          estimated_cost: Number(estimatedCost || 0),
          internal_notes: internalNotes,
        }),
      });
      await onReload();
      showToast(`Booking ${selected.booking_code} updated.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Update failed', 'error');
    }
  };

  const handleUploadCompletedPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selected || !e.target.files?.length) return;
    setUploadingPhoto(true);
    try {
      const urls = [...selected.completed_photos];
      for (const file of Array.from(e.target.files)) {
        urls.push(await uploadImageFile(file));
      }
      await apiRequest(`/api/bookings/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed_photos: urls }),
      });
      await onReload();
      showToast('Completed project photo uploaded.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSendQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    try {
      await apiRequest(`/api/bookings/${selected.id}/quotations`, {
        method: 'POST',
        body: JSON.stringify({
          line_items: lineItems,
          tax_amount: Number(taxAmount || 0),
          discount_amount: Number(discountAmount || 0),
          advance_required: advanceRequired ? Number(advanceRequired) : undefined,
          valid_until: validUntil,
          notes: quoteNotes,
        }),
      });
      setShowQuoteForm(false);
      await onReload();
      showToast('Customized quotation sent to customer in real time!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to send quotation', 'error');
    }
  };

  const handleAssignWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !assignWorkerId) return;
    try {
      await apiRequest('/api/worker-assignments', {
        method: 'POST',
        body: JSON.stringify({
          booking_id: selected.id,
          worker_id: assignWorkerId,
          scheduled_date: assignDate || selected.event_date,
          shift: assignShift,
          role_notes: assignNotes,
        }),
      });
      setAssignWorkerId('');
      setAssignNotes('');
      await onReload();
      showToast('Technician assigned to booking.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Worker assignment failed', 'error');
    }
  };

  const handleAllocateInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !allocInvId) return;
    try {
      await apiRequest(`/api/bookings/${selected.id}/items`, {
        method: 'POST',
        body: JSON.stringify({
          inventory_id: allocInvId,
          quantity: Number(allocQty || 1),
        }),
      });
      setAllocInvId('');
      setAllocQty('1');
      await onReload();
      showToast('Inventory material allocated and stock updated.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Allocation failed', 'error');
    }
  };

  const quoteSubtotal = lineItems.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0);
  const quoteTotal = Math.max(0, quoteSubtotal + Number(taxAmount || 0) - Number(discountAmount || 0));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Booking Management</h1>
          <p className="text-sm text-slate-600 mt-1">
            Review requests, schedule site visits, send itemized quotations, assign crew, and allocate equipment.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by booking ID, customer name, service, or venue..."
            className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2 text-sm focus:border-amber-500 focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-amber-500 focus:outline-none"
        >
          <option value="All">All Statuses ({bookings.length})</option>
          {BOOKING_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Booking List */}
        <div className="lg:col-span-5 space-y-2.5 max-h-[760px] overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              No bookings match your search.
            </div>
          ) : (
            filtered.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedId(b.id)}
                className={`w-full text-left rounded-xl border p-4 transition-colors cursor-pointer ${
                  selected?.id === b.id
                    ? 'border-amber-500 bg-amber-50/50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono text-xs font-bold text-slate-900">{b.booking_code}</span>
                  <StatusText status={b.status} />
                </div>
                <p className="text-sm font-semibold text-slate-900">{b.customer_name}</p>
                <p className="text-xs text-slate-600">{b.service_name || b.event_type}</p>
                <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-2">
                  <span>Event: {formatDateShort(b.event_date)}</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    Due: {formatINR(b.remaining_balance)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Complete Booking Details & Controls */}
        <div className="lg:col-span-7">
          {!selected ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              Select a booking request to view complete specifications and manage operations.
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
              {/* Top Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold text-slate-900">{selected.booking_code}</span>
                    <StatusText status={selected.status} />
                  </div>
                  <h2 className="font-display text-xl font-bold text-slate-900 mt-1">
                    {selected.customer_name} · {selected.service_name || selected.event_type}
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    Mobile: <span className="font-mono">{selected.mobile_number}</span> · Event:{' '}
                    {formatDateShort(selected.event_date)} · Area: {selected.venue_size}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{selected.event_location}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selected.status === 'Pending' && (
                    <>
                      <button
                        onClick={() => handleSaveBookingUpdate('Request Received')}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Accept</span>
                      </button>
                      <button
                        onClick={() => handleSaveBookingUpdate('Cancelled')}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Reject</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => downloadBookingInvoicePDF(selected)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Invoice PDF</span>
                  </button>
                </div>
              </div>

              {/* Requirements & Reference Images */}
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-2 text-xs">
                <p className="font-semibold text-slate-800">Lighting Requirements</p>
                <p className="text-slate-700">{selected.lighting_requirements}</p>
                {selected.additional_instructions && (
                  <p className="text-slate-600">
                    <strong>Instructions:</strong> {selected.additional_instructions}
                  </p>
                )}
                <p className="text-slate-600 font-mono">
                  Customer Budget: {formatINR(selected.estimated_budget)} · Total Paid: {formatINR(selected.total_paid)} ·
                  Balance: {formatINR(selected.remaining_balance)}
                </p>
                {selected.reference_images.length > 0 && (
                  <div className="pt-2 flex flex-wrap gap-2">
                    {selected.reference_images.map((url, idx) => (
                      <img
                        key={idx}
                        src={url}
                        alt={`Ref ${idx + 1}`}
                        className="h-16 w-20 rounded border border-slate-200 object-cover"
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Status, Site Visit & Internal Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-b border-slate-200 pb-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Booking Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as BookingStatus)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white"
                  >
                    {BOOKING_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Site Visit Date</label>
                  <input
                    type="date"
                    value={siteVisitDate}
                    onChange={(e) => setSiteVisitDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Estimated Cost (₹)</label>
                  <input
                    type="number"
                    value={estimatedCost}
                    onChange={(e) => setEstimatedCost(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Internal Owner Notes</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                      placeholder="Private engineering notes, rigging specs, generator requirements..."
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveBookingUpdate()}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 hover:text-slate-950 cursor-pointer whitespace-nowrap"
                    >
                      Save Status &amp; Notes
                    </button>
                  </div>
                </div>
              </div>

              {/* Customized Quotation Section */}
              <div className="border-b border-slate-200 pb-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-amber-600" />
                    <h3 className="text-sm font-bold text-slate-900">Quotation</h3>
                    {selected.quotation && <StatusText status={selected.quotation.status} />}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowQuoteForm(!showQuoteForm)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                  >
                    {showQuoteForm
                      ? 'Close Builder'
                      : selected.quotation
                        ? 'Revise Quotation'
                        : 'Create & Send Quotation'}
                  </button>
                </div>

                {selected.quotation && !showQuoteForm && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs space-y-1">
                    <p className="font-semibold text-slate-900">
                      {selected.quotation.quotation_number} · Total: {formatINR(selected.quotation.total_amount)} ·
                      Advance Required: {formatINR(selected.quotation.advance_required)}
                    </p>
                    <p className="text-slate-500">
                      {selected.quotation.line_items.length} line items · Valid until{' '}
                      {formatDateShort(selected.quotation.valid_until)}
                    </p>
                  </div>
                )}

                {showQuoteForm && (
                  <form onSubmit={handleSendQuotation} className="rounded-lg border border-amber-300 bg-amber-50/40 p-4 space-y-3">
                    <p className="text-xs font-bold text-slate-900">Itemized Quotation Builder</p>
                    {lineItems.map((item, idx) => (
                      <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                        <input
                          type="text"
                          required
                          placeholder="Line item description"
                          value={item.description}
                          onChange={(e) => {
                            const next = [...lineItems];
                            next[idx].description = e.target.value;
                            setLineItems(next);
                          }}
                          className="col-span-6 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                        />
                        <input
                          type="number"
                          min={1}
                          required
                          value={item.quantity}
                          onChange={(e) => {
                            const next = [...lineItems];
                            next[idx].quantity = Number(e.target.value || 1);
                            next[idx].total = next[idx].quantity * next[idx].unit_price;
                            setLineItems(next);
                          }}
                          className="col-span-2 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono"
                        />
                        <input
                          type="number"
                          min={0}
                          required
                          value={item.unit_price}
                          onChange={(e) => {
                            const next = [...lineItems];
                            next[idx].unit_price = Number(e.target.value || 0);
                            next[idx].total = next[idx].quantity * next[idx].unit_price;
                            setLineItems(next);
                          }}
                          className="col-span-3 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setLineItems(lineItems.filter((_, i) => i !== idx))}
                          className="col-span-1 text-slate-400 hover:text-rose-600 flex justify-center cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setLineItems([
                          ...lineItems,
                          { id: crypto.randomUUID(), description: '', quantity: 1, unit_price: 0, total: 0 },
                        ])
                      }
                      className="text-xs font-semibold text-amber-800 hover:underline cursor-pointer"
                    >
                      + Add Line Item
                    </button>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                      <div>
                        <label className="block text-[11px] text-slate-600">Tax (₹)</label>
                        <input
                          type="number"
                          value={taxAmount}
                          onChange={(e) => setTaxAmount(e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600">Discount (₹)</label>
                        <input
                          type="number"
                          value={discountAmount}
                          onChange={(e) => setDiscountAmount(e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600">Advance Req. (₹)</label>
                        <input
                          type="number"
                          placeholder={String(Math.round(quoteTotal * 0.4))}
                          value={advanceRequired}
                          onChange={(e) => setAdvanceRequired(e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600">Valid Until</label>
                        <input
                          type="date"
                          value={validUntil}
                          onChange={(e) => setValidUntil(e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                        />
                      </div>
                    </div>

                    <input
                      type="text"
                      placeholder="Quotation notes / terms"
                      value={quoteNotes}
                      onChange={(e) => setQuoteNotes(e.target.value)}
                      className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-xs"
                    />

                    <div className="flex items-center justify-between pt-2">
                      <span className="font-mono text-sm font-bold text-slate-900">
                        Quoted Total: {formatINR(quoteTotal)}
                      </span>
                      <button
                        type="submit"
                        className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer"
                      >
                        Send Quotation to Customer
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Worker Assignment & Equipment Allocation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 border-b border-slate-200 pb-5">
                <div className="space-y-2.5">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <Users className="h-3.5 w-3.5 text-amber-600" />
                    <span>Assigned Crew ({selected.assigned_workers?.length || 0})</span>
                  </p>
                  {selected.assigned_workers?.map((wa) => (
                    <div key={wa.id} className="rounded border border-slate-200 bg-slate-50 p-2.5 text-xs">
                      <p className="font-semibold text-slate-900">{wa.worker_name}</p>
                      <p className="text-slate-500">
                        {formatDateShort(wa.scheduled_date)} · {wa.shift}
                      </p>
                    </div>
                  ))}
                  <form onSubmit={handleAssignWorker} className="space-y-2 pt-1">
                    <select
                      required
                      value={assignWorkerId}
                      onChange={(e) => setAssignWorkerId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                    >
                      <option value="">Select technician...</option>
                      {workers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.full_name} ({w.specialty})
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        required
                        value={assignDate}
                        onChange={(e) => setAssignDate(e.target.value)}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                      />
                      <input
                        type="text"
                        value={assignShift}
                        onChange={(e) => setAssignShift(e.target.value)}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 hover:text-slate-950 cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Assign Worker</span>
                    </button>
                  </form>
                </div>

                <div className="space-y-2.5">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <Package className="h-3.5 w-3.5 text-amber-600" />
                    <span>Allocated Equipment ({selected.allocated_items?.length || 0})</span>
                  </p>
                  {selected.allocated_items?.map((ai) => (
                    <div key={ai.id} className="rounded border border-slate-200 bg-slate-50 p-2.5 text-xs flex justify-between">
                      <span className="font-medium text-slate-900 truncate">{ai.item_name}</span>
                      <span className="font-mono font-semibold text-slate-700">×{ai.quantity}</span>
                    </div>
                  ))}
                  <form onSubmit={handleAllocateInventory} className="space-y-2 pt-1">
                    <select
                      required
                      value={allocInvId}
                      onChange={(e) => setAllocInvId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                    >
                      <option value="">Allocate inventory item...</option>
                      {inventory.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.product_name} ({inv.quantity_available} {inv.unit} avail.)
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={1}
                        required
                        value={allocQty}
                        onChange={(e) => setAllocQty(e.target.value)}
                        className="w-20 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                      />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 hover:text-slate-950 cursor-pointer"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Deduct &amp; Allocate</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Completed Project Photos Upload */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-900">Completed Project Photos</p>
                  <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
                    <Upload className="h-3.5 w-3.5" />
                    <span>{uploadingPhoto ? 'Uploading...' : 'Upload Project Photo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleUploadCompletedPhoto}
                      className="hidden"
                    />
                  </label>
                </div>
                {selected.completed_photos.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {selected.completed_photos.map((url, idx) => (
                      <img
                        key={idx}
                        src={url}
                        alt={`Completed ${idx + 1}`}
                        className="rounded-lg border border-slate-200 aspect-[4/3] object-cover"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
