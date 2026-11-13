import React, { useState } from 'react';
import { AlertTriangle, Edit2, Plus, Search, Trash2 } from 'lucide-react';
import { apiRequest, formatINR } from '../../lib/api';
import { INVENTORY_CATEGORIES, type InventoryCategory, type InventoryItem } from '../../types';

export default function AdminInventoryView({
  inventory,
  onReload,
  showToast,
}: {
  inventory: InventoryItem[];
  onReload: () => Promise<void>;
  showToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string>('All');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const emptyForm = {
    product_name: '',
    category: 'LED lights' as InventoryCategory,
    quantity_available: '20',
    unit: 'pcs',
    purchase_price: '500',
    selling_price: '900',
    min_stock_alert: '10',
    supplier_name: '',
    supplier_contact: '',
  };

  const [form, setForm] = useState(emptyForm);

  const filtered = inventory.filter((item) => {
    const matchesCat = catFilter === 'All' || item.category === catFilter;
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      item.product_name.toLowerCase().includes(q) ||
      item.supplier_name.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  const lowStockCount = inventory.filter((i) => i.quantity_available <= i.min_stock_alert).length;

  const openEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    setForm({
      product_name: item.product_name,
      category: item.category,
      quantity_available: String(item.quantity_available),
      unit: item.unit,
      purchase_price: String(item.purchase_price),
      selling_price: String(item.selling_price),
      min_stock_alert: String(item.min_stock_alert),
      supplier_name: item.supplier_name,
      supplier_contact: item.supplier_contact,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        quantity_available: Number(form.quantity_available || 0),
        purchase_price: Number(form.purchase_price || 0),
        selling_price: Number(form.selling_price || 0),
        min_stock_alert: Number(form.min_stock_alert || 5),
      };
      if (editingId) {
        await apiRequest(`/api/inventory/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Inventory item updated.', 'success');
      } else {
        await apiRequest('/api/inventory', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Inventory item added.', 'success');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      await onReload();
    } catch (err: any) {
      showToast(err.message || 'Save failed', 'error');
    }
  };

  const handleQuickStockAdjust = async (item: InventoryItem, delta: number) => {
    try {
      await apiRequest(`/api/inventory/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ quantity_available: Math.max(0, item.quantity_available + delta) }),
      });
      await onReload();
    } catch (err: any) {
      showToast(err.message || 'Update failed', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiRequest(`/api/inventory/${id}`, { method: 'DELETE' });
      await onReload();
      showToast('Inventory item removed.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Delete failed', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Electrical &amp; Equipment Inventory</h1>
          <p className="text-sm text-slate-600 mt-1">
            {inventory.length} stock SKUs ·{' '}
            <span className={lowStockCount > 0 ? 'text-amber-700 font-semibold' : ''}>
              {lowStockCount} low-stock {lowStockCount === 1 ? 'alert' : 'alerts'}
            </span>
          </p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setForm(emptyForm);
            setShowForm(!showForm);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer self-start"
        >
          <Plus className="h-4 w-4" />
          <span>{showForm ? 'Close Form' : 'Add Equipment / Stock'}</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-slate-900">
            {editingId ? 'Edit Inventory Item' : 'Add New Electrical Item'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Product Name *</label>
              <input
                type="text"
                required
                value={form.product_name}
                onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category *</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as InventoryCategory })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                {INVENTORY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity Available *</label>
              <input
                type="number"
                min={0}
                required
                value={form.quantity_available}
                onChange={(e) => setForm({ ...form, quantity_available: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Unit *</label>
              <input
                type="text"
                required
                placeholder="pcs, reels, rolls, coils"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Min Stock Alert *</label>
              <input
                type="number"
                min={0}
                required
                value={form.min_stock_alert}
                onChange={(e) => setForm({ ...form, min_stock_alert: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Purchase Price (₹) *</label>
              <input
                type="number"
                min={0}
                required
                value={form.purchase_price}
                onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Selling / Rental Price (₹) *</label>
              <input
                type="number"
                min={0}
                required
                value={form.selling_price}
                onChange={(e) => setForm({ ...form, selling_price: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier Name</label>
              <input
                type="text"
                value={form.supplier_name}
                onChange={(e) => setForm({ ...form, supplier_name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier Contact</label>
              <input
                type="text"
                value={form.supplier_contact}
                onChange={(e) => setForm({ ...form, supplier_contact: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-amber-500 hover:text-slate-950 cursor-pointer"
            >
              {editingId ? 'Save Changes' : 'Add to Inventory'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products, categories, or suppliers..."
            className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2 text-sm"
          />
        </div>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm"
        >
          <option value="All">All Categories</option>
          {INVENTORY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Available</th>
              <th className="px-4 py-3 text-right">Purchase</th>
              <th className="px-4 py-3 text-right">Selling / Rental</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.map((item) => {
              const isLow = item.quantity_available <= item.min_stock_alert;
              return (
                <tr key={item.id} className={isLow ? 'bg-amber-50/40' : 'hover:bg-slate-50/60'}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{item.product_name}</p>
                    {isLow && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 mt-0.5">
                        <AlertTriangle className="h-3 w-3" />
                        <span>Low stock (min {item.min_stock_alert})</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{item.category}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => handleQuickStockAdjust(item, -1)}
                        className="h-6 w-6 rounded border border-slate-300 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                      >
                        -
                      </button>
                      <span className="font-mono text-xs font-bold tabular-nums min-w-[48px] text-center">
                        {item.quantity_available} {item.unit}
                      </span>
                      <button
                        onClick={() => handleQuickStockAdjust(item, 1)}
                        className="h-6 w-6 rounded border border-slate-300 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-600">
                    {formatINR(item.purchase_price)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums text-slate-900">
                    {formatINR(item.selling_price)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    <p>{item.supplier_name || '—'}</p>
                    <p className="font-mono text-[11px] text-slate-400">{item.supplier_contact}</p>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => openEdit(item)}
                      className="p-1.5 text-slate-500 hover:text-amber-700 cursor-pointer"
                      title="Edit"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-600 cursor-pointer ml-1"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
