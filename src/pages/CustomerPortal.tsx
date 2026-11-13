import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  Download,
  FileText,
  Home,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import { apiRequest, formatDateShort, formatINR, uploadImageFile } from '../lib/api';
import { downloadBookingInvoicePDF } from '../lib/exportUtils';
import { useAuth } from '../context/AuthContext';
import { BrandMark, ImageWithFallback, StatusText, TableSkeleton } from '../components/CommonUI';
import type { Booking, SavedAddress, ServiceItem } from '../types';

type CustomerTab = 'dashboard' | 'services' | 'book' | 'bookings' | 'notifications' | 'profile';

export default function CustomerPortal({ initialTab }: { initialTab?: CustomerTab }) {
  const {
    profile,
    customer,
    notifications,
    unreadCount,
    lastRealtimeEvent,
    logout,
    refreshUser,
    markNotificationRead,
    markAllNotificationsRead,
    showToast,
  } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<CustomerTab>(initialTab || 'dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [bookingFilter, setBookingFilter] = useState<'all' | 'active' | 'completed'>('all');

  // Booking Form State
  const [bookingForm, setBookingForm] = useState({
    customer_name: profile?.full_name || '',
    mobile_number: profile?.phone || '',
    event_type: 'Diwali Celebration',
    event_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    event_location: '',
    service_id: searchParams.get('service') || '',
    package_id: '',
    venue_size: '',
    estimated_budget: '35000',
    lighting_requirements: '',
    additional_instructions: '',
    reference_images: [] as string[],
  });
  const [uploadingRefImg, setUploadingRefImg] = useState(false);
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [createdBookingCode, setCreatedBookingCode] = useState<string | null>(null);

  // Review Form State
  const [reviewBookingId, setReviewBookingId] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Profile State
  const [profileForm, setProfileForm] = useState({
    full_name: profile?.full_name || '',
    phone: profile?.phone || '',
    company_name: customer?.company_name || '',
  });
  const [addresses, setAddresses] = useState<SavedAddress[]>(customer?.saved_addresses || []);
  const [newAddress, setNewAddress] = useState({ label: '', addressLine: '', city: '', pincode: '' });
  const [savingProfile, setSavingProfile] = useState(false);

  // Contact owner quick message
  const [ownerMsg, setOwnerMsg] = useState('');

  const loadPortalData = useCallback(async () => {
    try {
      const [svcList, bList] = await Promise.all([
        apiRequest<ServiceItem[]>('/api/services'),
        apiRequest<Booking[]>('/api/bookings'),
      ]);
      setServices(svcList);
      setBookings(bList);
      if (!bookingForm.service_id && svcList.length > 0) {
        const paramService = searchParams.get('service');
        setBookingForm((prev) => ({
          ...prev,
          service_id: paramService || svcList[0].id,
        }));
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load portal data', 'error');
    } finally {
      setLoadingData(false);
    }
  }, [searchParams, showToast]);

  useEffect(() => {
    loadPortalData();
  }, [loadPortalData]);

  // Real-time WebSocket updates
  useEffect(() => {
    if (!lastRealtimeEvent) return;
    if (
      ['booking:created', 'booking:updated', 'payment:recorded', 'service:updated'].includes(
        lastRealtimeEvent.type
      )
    ) {
      loadPortalData();
    }
  }, [lastRealtimeEvent, loadPortalData]);

  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name,
        phone: profile.phone,
        company_name: customer?.company_name || '',
      });
      setBookingForm((prev) => ({
        ...prev,
        customer_name: prev.customer_name || profile.full_name,
        mobile_number: prev.mobile_number || profile.phone,
        event_location:
          prev.event_location ||
          customer?.saved_addresses?.find((a) => a.isDefault)?.addressLine ||
          '',
      }));
      setAddresses(customer?.saved_addresses || []);
    }
  }, [profile, customer]);

  useEffect(() => {
    const svc = searchParams.get('service');
    if (svc) {
      setBookingForm((prev) => ({ ...prev, service_id: svc, package_id: '' }));
      setActiveTab('book');
    }
  }, [searchParams]);

  // Computed metrics (zero hardcoded figures)
  const metrics = useMemo(() => {
    const active = bookings.filter((b) => !['Completed', 'Cancelled'].includes(b.status));
    const completed = bookings.filter((b) => b.status === 'Completed');
    const previous = bookings.filter((b) => ['Completed', 'Cancelled'].includes(b.status));
    const pendingPayments = bookings
      .filter((b) => b.status !== 'Cancelled')
      .reduce((sum, b) => sum + Number(b.remaining_balance || 0), 0);
    return {
      activeCount: active.length,
      completedCount: completed.length,
      previousCount: previous.length,
      pendingPayments,
    };
  }, [bookings]);

  const selectedService = services.find((s) => s.id === bookingForm.service_id);
  const selectedBooking = bookings.find((b) => b.id === selectedBookingId) || null;

  const filteredBookings = bookings.filter((b) => {
    if (bookingFilter === 'active') return !['Completed', 'Cancelled'].includes(b.status);
    if (bookingFilter === 'completed') return ['Completed', 'Cancelled'].includes(b.status);
    return true;
  });

  const handleUploadReferenceImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingRefImg(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const url = await uploadImageFile(file);
        urls.push(url);
      }
      setBookingForm((prev) => ({
        ...prev,
        reference_images: [...prev.reference_images, ...urls],
      }));
      showToast('Reference image uploaded.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Image upload failed', 'error');
    } finally {
      setUploadingRefImg(false);
    }
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingBooking(true);
    try {
      const created = await apiRequest<Booking>('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          ...bookingForm,
          estimated_budget: Number(bookingForm.estimated_budget || 0),
          package_id: bookingForm.package_id || null,
        }),
      });
      setCreatedBookingCode(created.booking_code);
      showToast(`Booking ${created.booking_code} submitted!`, 'success');
      await loadPortalData();
      setBookingForm((prev) => ({
        ...prev,
        venue_size: '',
        lighting_requirements: '',
        additional_instructions: '',
        reference_images: [],
      }));
    } catch (err: any) {
      showToast(err.message || 'Could not submit booking', 'error');
    } finally {
      setSubmittingBooking(false);
    }
  };

  const handleQuotationResponse = async (quotationId: string, action: 'Accepted' | 'Rejected') => {
    try {
      const updated = await apiRequest<Booking>(`/api/quotations/${quotationId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      showToast(
        action === 'Accepted'
          ? 'Quotation accepted! Your booking is now approved.'
          : 'Quotation declined. Our engineer will schedule a revision.',
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Action failed', 'error');
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewBookingId) return;
    setSubmittingReview(true);
    try {
      await apiRequest('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          booking_id: reviewBookingId,
          rating: reviewRating,
          comment: reviewComment,
        }),
      });
      showToast('Thank you! Your review is now published.', 'success');
      setReviewBookingId(null);
      setReviewComment('');
    } catch (err: any) {
      showToast(err.message || 'Could not submit review', 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await apiRequest('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          ...profileForm,
          saved_addresses: addresses,
        }),
      });
      await refreshUser();
      showToast('Profile and saved addresses updated.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const addSavedAddress = () => {
    if (!newAddress.label.trim() || !newAddress.addressLine.trim() || !newAddress.city.trim()) {
      showToast('Please enter label, street address, and city.', 'error');
      return;
    }
    const item: SavedAddress = {
      id: crypto.randomUUID(),
      label: newAddress.label.trim(),
      addressLine: newAddress.addressLine.trim(),
      city: newAddress.city.trim(),
      pincode: newAddress.pincode.trim(),
      isDefault: addresses.length === 0,
    };
    setAddresses((prev) => [...prev, item]);
    setNewAddress({ label: '', addressLine: '', city: '', pincode: '' });
  };

  const handleSendMessageToOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerMsg.trim()) return;
    try {
      await apiRequest('/api/inquiries', {
        method: 'POST',
        body: JSON.stringify({
          name: profile?.full_name || 'Customer',
          phone: profile?.phone || 'N/A',
          email: profile?.email,
          message: ownerMsg,
        }),
      });
      setOwnerMsg('');
      showToast('Message sent directly to the Shop Owner.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to send message', 'error');
    }
  };

  const navItems: { id: CustomerTab; label: string; Icon: React.ComponentType<any>; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
    { id: 'services', label: 'Services', Icon: Sparkles },
    { id: 'book', label: 'Book a Service', Icon: Calendar },
    { id: 'bookings', label: 'My Bookings', Icon: FileText, badge: bookings.length },
    { id: 'notifications', label: 'Notifications', Icon: Bell, badge: unreadCount },
    { id: 'profile', label: 'Profile', Icon: User },
  ];

  const statusSteps = [
    'Pending',
    'Request Received',
    'Site Visit Required',
    'Quotation Sent',
    'Approved',
    'Work in Progress',
    'Completed',
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
            <p className="text-xs font-semibold text-white truncate">{profile?.full_name}</p>
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
            <div className="truncate">
              <p className="text-xs text-slate-500">Customer Portal / {navItems.find((n) => n.id === activeTab)?.label}</p>
            </div>
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
              onClick={() => setActiveTab('book')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 hover:text-slate-950 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Booking</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-5 sm:p-8 max-w-6xl w-full mx-auto space-y-8">
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
                    Welcome back, {profile?.full_name}
                  </h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Track your electrical lighting bookings, review quotations, and manage payments in real time.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('book')}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Calendar className="h-4 w-4" />
                  <span>Book a Service</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-medium text-slate-500">Active Bookings</p>
                  <p className="font-mono text-2xl font-bold text-slate-900 mt-2 tabular-nums">
                    {metrics.activeCount}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-medium text-slate-500">Previous Bookings</p>
                  <p className="font-mono text-2xl font-bold text-slate-900 mt-2 tabular-nums">
                    {metrics.previousCount}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-medium text-slate-500">Pending Payments</p>
                  <p className="font-mono text-2xl font-bold text-amber-700 mt-2 tabular-nums">
                    {formatINR(metrics.pendingPayments)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-medium text-slate-500">Completed Projects</p>
                  <p className="font-mono text-2xl font-bold text-emerald-700 mt-2 tabular-nums">
                    {metrics.completedCount}
                  </p>
                </div>
              </div>

              {/* Active Bookings Quick View */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-semibold text-slate-900">Your Recent Bookings</h2>
                  <button
                    onClick={() => setActiveTab('bookings')}
                    className="text-xs font-semibold text-amber-700 hover:text-amber-800 cursor-pointer"
                  >
                    View all bookings →
                  </button>
                </div>

                {loadingData ? (
                  <TableSkeleton rows={3} />
                ) : bookings.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                    <p className="text-sm font-medium text-slate-700 mb-2">No bookings submitted yet.</p>
                    <button
                      onClick={() => setActiveTab('book')}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 hover:text-slate-950 cursor-pointer"
                    >
                      Create Your First Booking
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <tr>
                          <th className="px-5 py-3">Booking ID</th>
                          <th className="px-5 py-3">Service &amp; Event</th>
                          <th className="px-5 py-3">Event Date</th>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-5 py-3 text-right">Balance</th>
                          <th className="px-5 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {bookings.slice(0, 5).map((b) => (
                          <tr key={b.id} className="hover:bg-slate-50/70">
                            <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-900">
                              {b.booking_code}
                            </td>
                            <td className="px-5 py-3.5">
                              <p className="font-medium text-slate-900">{b.service_name || b.event_type}</p>
                              <p className="text-xs text-slate-500 truncate max-w-xs">{b.event_location}</p>
                            </td>
                            <td className="px-5 py-3.5 font-mono text-xs text-slate-600 tabular-nums">
                              {formatDateShort(b.event_date)}
                            </td>
                            <td className="px-5 py-3.5">
                              <StatusText status={b.status} />
                            </td>
                            <td className="px-5 py-3.5 text-right font-mono text-xs font-semibold tabular-nums text-slate-900">
                              {formatINR(b.remaining_balance)}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <button
                                onClick={() => {
                                  setSelectedBookingId(b.id);
                                  setActiveTab('bookings');
                                }}
                                className="text-xs font-semibold text-amber-700 hover:text-amber-800 cursor-pointer"
                              >
                                Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Available Services Preview + Recent Notifications */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-lg font-semibold text-slate-900">Available Services</h2>
                    <button
                      onClick={() => setActiveTab('services')}
                      className="text-xs font-semibold text-amber-700 hover:text-amber-800 cursor-pointer"
                    >
                      Browse all {services.length} →
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {services.slice(0, 4).map((s) => (
                      <div key={s.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <div className="aspect-[4/3] bg-slate-900">
                          <ImageWithFallback src={s.image_url} alt={s.name} className="h-full w-full object-cover" />
                        </div>
                        <div className="p-4 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{s.name}</p>
                            <p className="font-mono text-xs text-slate-500 tabular-nums">
                              From {formatINR(s.starting_price)}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setBookingForm((prev) => ({ ...prev, service_id: s.id, package_id: '' }));
                              setActiveTab('book');
                            }}
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 hover:text-slate-950 shrink-0 cursor-pointer"
                          >
                            Book
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-lg font-semibold text-slate-900">Recent Notifications</h2>
                    <button
                      onClick={() => setActiveTab('notifications')}
                      className="text-xs font-semibold text-amber-700 hover:text-amber-800 cursor-pointer"
                    >
                      View all →
                    </button>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <p className="p-5 text-xs text-slate-500">No notifications yet.</p>
                    ) : (
                      notifications.slice(0, 4).map((n) => (
                        <div key={n.id} className={`p-4 ${!n.is_read ? 'bg-amber-50/40' : ''}`}>
                          <p className="text-xs font-semibold text-slate-900">{n.title}</p>
                          <p className="text-xs text-slate-600 mt-1">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: SERVICES & PACKAGES */}
          {activeTab === 'services' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-slate-900">Electrical &amp; Event Lighting Services</h1>
                <p className="text-sm text-slate-600 mt-1">
                  Select a service or package to pre-fill your booking request.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {services.map((s) => (
                  <div key={s.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
                    <div className="aspect-[4/3] bg-slate-900">
                      <ImageWithFallback src={s.image_url} alt={s.name} className="h-full w-full object-cover" />
                    </div>
                    <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                      <div>
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1">
                          <span>{s.category}</span>
                          <span className="font-mono font-semibold text-slate-900 tabular-nums">
                            Starting {formatINR(s.starting_price)}
                          </span>
                        </div>
                        <h3 className="font-display text-xl font-bold text-slate-900 mb-2">{s.name}</h3>
                        <p className="text-sm text-slate-600 leading-relaxed">{s.description}</p>

                        {s.packages.length > 0 && (
                          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                            <p className="text-xs font-semibold text-slate-700">Available Packages</p>
                            {s.packages.map((pkg) => (
                              <div
                                key={pkg.id}
                                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-900">{pkg.name}</p>
                                  <p className="text-[11px] text-slate-500 truncate">{pkg.description}</p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="font-mono text-xs font-bold text-slate-900 tabular-nums">
                                    {formatINR(pkg.price)}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setBookingForm((prev) => ({
                                        ...prev,
                                        service_id: s.id,
                                        package_id: pkg.id,
                                        estimated_budget: String(pkg.price),
                                      }));
                                      setActiveTab('book');
                                    }}
                                    className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer"
                                  >
                                    Select
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          setBookingForm((prev) => ({
                            ...prev,
                            service_id: s.id,
                            package_id: '',
                            estimated_budget: String(s.starting_price || 25000),
                          }));
                          setActiveTab('book');
                        }}
                        className="w-full rounded-lg bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-amber-500 hover:text-slate-950 transition-colors cursor-pointer"
                      >
                        Request Custom Booking for {s.name}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: BOOKING FORM */}
          {activeTab === 'book' && (
            <div className="max-w-3xl space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-slate-900">Book Electrical &amp; Lighting Service</h1>
                <p className="text-sm text-slate-600 mt-1">
                  Submit your venue requirements to receive a unique booking ID and customized engineering quotation.
                </p>
              </div>

              {createdBookingCode && (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-950">
                        Booking Submitted Successfully — ID: <span className="font-mono">{createdBookingCode}</span>
                      </p>
                      <p className="text-xs text-emerald-800 mt-0.5">
                        The shop owner has been notified in real time. Track status updates under My Bookings.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setCreatedBookingCode(null);
                      setActiveTab('bookings');
                    }}
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 shrink-0 cursor-pointer"
                  >
                    Track Booking
                  </button>
                </div>
              )}

              <form onSubmit={handleBookingSubmit} className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Customer Name *</label>
                    <input
                      type="text"
                      required
                      value={bookingForm.customer_name}
                      onChange={(e) => setBookingForm({ ...bookingForm, customer_name: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Mobile Number *</label>
                    <input
                      type="tel"
                      required
                      value={bookingForm.mobile_number}
                      onChange={(e) => setBookingForm({ ...bookingForm, mobile_number: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Required Service *</label>
                    <select
                      required
                      value={bookingForm.service_id}
                      onChange={(e) => setBookingForm({ ...bookingForm, service_id: e.target.value, package_id: '' })}
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-amber-500 focus:outline-none bg-white"
                    >
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} (From {formatINR(s.starting_price)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Package (Optional)</label>
                    <select
                      value={bookingForm.package_id}
                      onChange={(e) => {
                        const pid = e.target.value;
                        const pkg = selectedService?.packages.find((p) => p.id === pid);
                        setBookingForm({
                          ...bookingForm,
                          package_id: pid,
                          estimated_budget: pkg ? String(pkg.price) : bookingForm.estimated_budget,
                        });
                      }}
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-amber-500 focus:outline-none bg-white"
                    >
                      <option value="">Custom Quotation</option>
                      {selectedService?.packages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {formatINR(p.price)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Event Type *</label>
                    <input
                      type="text"
                      required
                      value={bookingForm.event_type}
                      onChange={(e) => setBookingForm({ ...bookingForm, event_type: e.target.value })}
                      placeholder="e.g., Diwali Home Decor, Wedding Sangeet"
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Event Date *</label>
                    <input
                      type="date"
                      required
                      value={bookingForm.event_date}
                      onChange={(e) => setBookingForm({ ...bookingForm, event_date: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700">Event Location / Address *</label>
                    {addresses.length > 0 && (
                      <select
                        onChange={(e) => {
                          if (e.target.value) setBookingForm({ ...bookingForm, event_location: e.target.value });
                        }}
                        defaultValue=""
                        className="text-xs text-amber-700 font-medium bg-transparent cursor-pointer"
                      >
                        <option value="" disabled>
                          Use saved address...
                        </option>
                        {addresses.map((a) => (
                          <option key={a.id} value={`${a.addressLine}, ${a.city} ${a.pincode}`}>
                            {a.label} ({a.city})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    value={bookingForm.event_location}
                    onChange={(e) => setBookingForm({ ...bookingForm, event_location: e.target.value })}
                    placeholder="Full street address, landmark, city"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Decoration Area / Venue Size *</label>
                    <input
                      type="text"
                      required
                      value={bookingForm.venue_size}
                      onChange={(e) => setBookingForm({ ...bookingForm, venue_size: e.target.value })}
                      placeholder="e.g., 4,500 sq.ft lawn / 3-story facade"
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Estimated Budget (₹) *</label>
                    <input
                      type="number"
                      min={1000}
                      required
                      value={bookingForm.estimated_budget}
                      onChange={(e) => setBookingForm({ ...bookingForm, estimated_budget: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-mono tabular-nums focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Lighting Requirements *</label>
                  <textarea
                    rows={3}
                    required
                    value={bookingForm.lighting_requirements}
                    onChange={(e) => setBookingForm({ ...bookingForm, lighting_requirements: e.target.value })}
                    placeholder="Describe color temperature (e.g., 2700K warm gold), curtain drops, truss size, chandeliers, or generator load needs..."
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Additional Instructions</label>
                  <textarea
                    rows={2}
                    value={bookingForm.additional_instructions}
                    onChange={(e) => setBookingForm({ ...bookingForm, additional_instructions: e.target.value })}
                    placeholder="Site access timings, society permissions, or preferred site-visit slot..."
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Upload Reference Images</label>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
                      <Upload className="h-4 w-4" />
                      <span>{uploadingRefImg ? 'Uploading...' : 'Select Venue / Reference Photos'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleUploadReferenceImage}
                        className="hidden"
                      />
                    </label>
                  </div>
                  {bookingForm.reference_images.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 sm:grid-cols-5 gap-3">
                      {bookingForm.reference_images.map((url, idx) => (
                        <div key={idx} className="relative rounded-lg overflow-hidden border border-slate-200 aspect-square">
                          <img src={url} alt={`Reference ${idx + 1}`} className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() =>
                              setBookingForm((prev) => ({
                                ...prev,
                                reference_images: prev.reference_images.filter((_, i) => i !== idx),
                              }))
                            }
                            className="absolute top-1 right-1 rounded-full bg-slate-950/80 p-1 text-white hover:bg-rose-600 cursor-pointer"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingBooking}
                    className="rounded-lg bg-amber-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {submittingBooking ? 'Submitting Request...' : 'Submit Booking Request'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 4: MY BOOKINGS, QUOTATIONS, PAYMENTS & INVOICES */}
          {activeTab === 'bookings' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">Bookings, Quotations &amp; Invoices</h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Track real-time project progress, accept customized quotations, and download PDF invoices.
                  </p>
                </div>

                <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1 self-start">
                  {(['all', 'active', 'completed'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setBookingFilter(f)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize cursor-pointer ${
                        bookingFilter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 space-y-3">
                  {filteredBookings.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                      No bookings match this filter.
                    </div>
                  ) : (
                    filteredBookings.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => setSelectedBookingId(b.id)}
                        className={`w-full text-left rounded-xl border p-4 transition-colors cursor-pointer ${
                          selectedBooking?.id === b.id
                            ? 'border-amber-500 bg-amber-50/40'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-mono text-xs font-bold text-slate-900">{b.booking_code}</span>
                          <StatusText status={b.status} />
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{b.service_name || b.event_type}</p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{b.event_location}</p>
                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
                          <span className="text-slate-500">{formatDateShort(b.event_date)}</span>
                          <span className="font-mono font-semibold text-slate-900 tabular-nums">
                            Balance: {formatINR(b.remaining_balance)}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="lg:col-span-7">
                  {!selectedBooking ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                      Select a booking from the left to view live progress, quotation details, payments, and invoice downloads.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
                      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm font-bold text-slate-900">
                              {selectedBooking.booking_code}
                            </span>
                            <StatusText status={selectedBooking.status} />
                          </div>
                          <h2 className="font-display text-xl font-bold text-slate-900 mt-1">
                            {selectedBooking.service_name || selectedBooking.event_type}
                          </h2>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {selectedBooking.event_date} · {selectedBooking.event_location} · {selectedBooking.venue_size}
                          </p>
                        </div>

                        <button
                          onClick={() => downloadBookingInvoicePDF(selectedBooking)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Download PDF Invoice</span>
                        </button>
                      </div>

                      {/* Progress Tracker */}
                      {selectedBooking.status !== 'Cancelled' && (
                        <div>
                          <p className="text-xs font-semibold text-slate-700 mb-3">Live Progress</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                            {statusSteps.map((step, idx) => {
                              const currentIdx = statusSteps.indexOf(selectedBooking.status);
                              const done = idx <= currentIdx;
                              return (
                                <div
                                  key={step}
                                  className={`rounded-md border px-2 py-2 text-[11px] font-medium ${
                                    done
                                      ? 'border-amber-400 bg-amber-50 text-amber-950'
                                      : 'border-slate-200 bg-slate-50 text-slate-400'
                                  }`}
                                >
                                  <span className="font-mono block text-[10px]">0{idx + 1}</span>
                                  <span className="line-clamp-2">{step}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Quotation Card */}
                      {selectedBooking.quotation ? (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold text-slate-500">
                                Customized Quotation · {selectedBooking.quotation.quotation_number}
                              </p>
                              <p className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                                Total: {formatINR(selectedBooking.quotation.total_amount)}
                              </p>
                            </div>
                            <StatusText status={selectedBooking.quotation.status} />
                          </div>

                          <div className="divide-y divide-slate-200 border-y border-slate-200 bg-white rounded-lg overflow-hidden">
                            {selectedBooking.quotation.line_items.map((item) => (
                              <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs">
                                <span className="text-slate-800 font-medium">{item.description}</span>
                                <span className="font-mono text-slate-600 tabular-nums whitespace-nowrap">
                                  {item.quantity} × {formatINR(item.unit_price)} ={' '}
                                  <strong className="text-slate-900">{formatINR(item.total)}</strong>
                                </span>
                              </div>
                            ))}
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
                            <span>Advance Required: {formatINR(selectedBooking.quotation.advance_required)}</span>
                            <span>Valid Until: {formatDateShort(selectedBooking.quotation.valid_until)}</span>
                          </div>

                          {selectedBooking.quotation.notes && (
                            <p className="text-xs text-slate-600">Note: {selectedBooking.quotation.notes}</p>
                          )}

                          {selectedBooking.quotation.status === 'Sent' && (
                            <div className="flex flex-wrap items-center gap-3 pt-1">
                              <button
                                onClick={() => handleQuotationResponse(selectedBooking.quotation!.id, 'Accepted')}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                              >
                                <Check className="h-3.5 w-3.5" />
                                <span>Accept Quotation</span>
                              </button>
                              <button
                                onClick={() => handleQuotationResponse(selectedBooking.quotation!.id, 'Rejected')}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
                              >
                                <X className="h-3.5 w-3.5" />
                                <span>Request Revision / Decline</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                          Awaiting customized quotation from the LuminaCraft engineering desk. Estimated budget:{' '}
                          <span className="font-mono font-semibold text-slate-900">
                            {formatINR(selectedBooking.estimated_budget)}
                          </span>
                        </div>
                      )}

                      {/* Financial & Payment Breakdown */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-lg border border-slate-200 p-3.5">
                          <p className="text-xs text-slate-500">Total Cost</p>
                          <p className="font-mono text-base font-bold text-slate-900 tabular-nums mt-1">
                            {formatINR(
                              selectedBooking.quotation
                                ? selectedBooking.quotation.total_amount
                                : selectedBooking.estimated_cost
                            )}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3.5">
                          <p className="text-xs text-slate-500">Advance &amp; Paid</p>
                          <p className="font-mono text-base font-bold text-emerald-700 tabular-nums mt-1">
                            {formatINR(selectedBooking.total_paid)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3.5">
                          <p className="text-xs text-slate-500">Remaining Balance</p>
                          <p className="font-mono text-base font-bold text-amber-700 tabular-nums mt-1">
                            {formatINR(selectedBooking.remaining_balance)}
                          </p>
                        </div>
                      </div>

                      {selectedBooking.payments && selectedBooking.payments.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-700 mb-2">Payment History</p>
                          <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 text-xs">
                            {selectedBooking.payments.map((p) => (
                              <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                                <div>
                                  <span className="font-semibold text-slate-900">{p.payment_type}</span> ·{' '}
                                  <span className="text-slate-600">{p.payment_method}</span>
                                  {p.reference_no && (
                                    <span className="font-mono text-slate-400 ml-2">({p.reference_no})</span>
                                  )}
                                </div>
                                <div className="text-right">
                                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                                    {formatINR(p.amount)}
                                  </span>
                                  <span className="block text-[11px] text-slate-400">
                                    {formatDateShort(p.payment_date)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Completed Project Photos & Review */}
                      {selectedBooking.completed_photos.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-700 mb-2">Completed Project Photos</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {selectedBooking.completed_photos.map((url, idx) => (
                              <img
                                key={idx}
                                src={url}
                                alt={`Completed setup ${idx + 1}`}
                                className="rounded-lg border border-slate-200 aspect-[4/3] object-cover"
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedBooking.status === 'Completed' && (
                        <div className="border-t border-slate-100 pt-4">
                          {reviewBookingId === selectedBooking.id ? (
                            <form onSubmit={handleReviewSubmit} className="space-y-3 bg-slate-50 rounded-lg p-4 border border-slate-200">
                              <p className="text-xs font-semibold text-slate-800">Rate Your Experience</p>
                              <div className="flex items-center gap-2">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button
                                    key={star}
                                    type="button"
                                    onClick={() => setReviewRating(star)}
                                    className={`p-1 cursor-pointer ${
                                      star <= reviewRating ? 'text-amber-500' : 'text-slate-300'
                                    }`}
                                  >
                                    <Star className="h-5 w-5 fill-current" />
                                  </button>
                                ))}
                              </div>
                              <textarea
                                required
                                rows={2}
                                value={reviewComment}
                                onChange={(e) => setReviewComment(e.target.value)}
                                placeholder="Share feedback on lighting quality, wiring neatness, and team punctuality..."
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="submit"
                                  disabled={submittingReview}
                                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 hover:text-slate-950 cursor-pointer"
                                >
                                  {submittingReview ? 'Submitting...' : 'Publish Review'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setReviewBookingId(null)}
                                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-600 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          ) : (
                            <button
                              onClick={() => setReviewBookingId(selectedBooking.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer"
                            >
                              <Star className="h-3.5 w-3.5" />
                              <span>Submit Rating &amp; Review</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <div className="max-w-3xl space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">Notifications</h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Real-time alerts for booking confirmations, quotations, payment receipts, and project completion.
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
                  <p className="p-8 text-center text-sm text-slate-500">You have no notifications yet.</p>
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

          {/* TAB 6: CUSTOMER PROFILE & ADDRESSES */}
          {activeTab === 'profile' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-6">
                <form
                  onSubmit={handleSaveProfile}
                  className="rounded-xl border border-slate-200 bg-white p-6 space-y-5"
                >
                  <h2 className="font-display text-lg font-bold text-slate-900">Personal Details &amp; Saved Addresses</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">Full Name *</label>
                      <input
                        type="text"
                        required
                        value={profileForm.full_name}
                        onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">Mobile Number *</label>
                      <input
                        type="tel"
                        required
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Organization / Residence Name</label>
                    <input
                      type="text"
                      value={profileForm.company_name}
                      onChange={(e) => setProfileForm({ ...profileForm, company_name: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  <div className="border-t border-slate-200 pt-4 space-y-3">
                    <p className="text-xs font-semibold text-slate-700">Saved Event Venues &amp; Addresses</p>
                    {addresses.map((addr) => (
                      <div
                        key={addr.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">
                            {addr.label} {addr.isDefault && <span className="text-amber-700">· Default</span>}
                          </p>
                          <p className="text-slate-600 mt-0.5">
                            {addr.addressLine}, {addr.city} {addr.pincode}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAddresses((prev) => prev.filter((a) => a.id !== addr.id))}
                          className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                      <input
                        type="text"
                        placeholder="Label (e.g., Villa)"
                        value={newAddress.label}
                        onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                      />
                      <input
                        type="text"
                        placeholder="City"
                        value={newAddress.city}
                        onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                      />
                      <input
                        type="text"
                        placeholder="Street Address"
                        value={newAddress.addressLine}
                        onChange={(e) => setNewAddress({ ...newAddress, addressLine: e.target.value })}
                        className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-xs"
                      />
                      <input
                        type="text"
                        placeholder="Pincode"
                        value={newAddress.pincode}
                        onChange={(e) => setNewAddress({ ...newAddress, pincode: e.target.value })}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                      />
                      <button
                        type="button"
                        onClick={addSavedAddress}
                        className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-200 cursor-pointer"
                      >
                        + Add Address
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="rounded-lg bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-amber-500 hover:text-slate-950 transition-colors cursor-pointer"
                  >
                    {savingProfile ? 'Saving...' : 'Save Profile Changes'}
                  </button>
                </form>
              </div>

              <div className="lg:col-span-5 space-y-6">
                <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                  <h2 className="font-display text-lg font-bold text-slate-900">Contact Shop Owner</h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Need an urgent schedule adjustment or electrical site consultation? Message the LuminaCraft owner
                    directly.
                  </p>
                  <div className="text-xs space-y-1.5 text-slate-700">
                    <p className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-amber-600" />
                      <span>Showroom 4, Bund Garden Road, Pune</span>
                    </p>
                    <p className="font-mono">+91 98204 51100 · owner@luminacraft.in</p>
                  </div>
                  <a
                    href="https://wa.me/919820451100"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span>Message on WhatsApp</span>
                  </a>

                  <form onSubmit={handleSendMessageToOwner} className="space-y-3 border-t border-slate-100 pt-4">
                    <label className="block text-xs font-semibold text-slate-700">Direct Portal Message</label>
                    <textarea
                      rows={3}
                      required
                      value={ownerMsg}
                      onChange={(e) => setOwnerMsg(e.target.value)}
                      placeholder="Write a note to Rajesh Verma (Shop Owner)..."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="w-full rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-amber-500 hover:text-slate-950 cursor-pointer"
                    >
                      Send Direct Message
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
