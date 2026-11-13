import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Calendar,
  Check,
  Database,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Star,
  X,
} from 'lucide-react';
import { apiRequest, formatINR } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { BrandMark, ImageWithFallback } from '../components/CommonUI';
import type { ReviewItem, ServiceItem } from '../types';

export default function LandingPage() {
  const { profile, showToast } = useAuth();
  const navigate = useNavigate();

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [inquiryForm, setInquiryForm] = useState({ name: '', phone: '', email: '', message: '' });
  const [submittingInquiry, setSubmittingInquiry] = useState(false);
  const [inquirySent, setInquirySent] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);

  useEffect(() => {
    apiRequest<ServiceItem[]>('/api/services')
      .then(setServices)
      .catch(() => {});
    apiRequest<ReviewItem[]>('/api/reviews')
      .then(setReviews)
      .catch(() => {});
  }, []);

  const categories = ['All', ...Array.from(new Set(services.map((s) => s.category)))];
  const filteredServices =
    selectedCategory === 'All' ? services : services.filter((s) => s.category === selectedCategory);

  const handleBookClick = (serviceId?: string) => {
    const target = serviceId ? `/customer/book?service=${serviceId}` : '/customer/book';
    if (profile?.role === 'customer') {
      navigate(target);
    } else if (profile?.role === 'admin') {
      navigate('/admin');
    } else {
      navigate(`/auth?mode=login&role=customer&next=${encodeURIComponent(target)}`);
    }
  };

  const handleInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inquiryForm.name.trim() || !inquiryForm.phone.trim() || !inquiryForm.message.trim()) {
      showToast('Please enter your name, mobile number, and inquiry details.', 'error');
      return;
    }
    setSubmittingInquiry(true);
    try {
      await apiRequest('/api/inquiries', {
        method: 'POST',
        body: JSON.stringify(inquiryForm),
      });
      setInquirySent(true);
      setInquiryForm({ name: '', phone: '', email: '', message: '' });
      showToast('Inquiry received! Our lighting team will reach out shortly.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to send inquiry', 'error');
    } finally {
      setSubmittingInquiry(false);
    }
  };

  const galleryProjects = [
    {
      title: 'Koregaon Park Courtyard Wedding',
      meta: '3,000m Micro-LED Canopy · 6 Crystal Chandeliers',
      image: '/src/assets/images/service_wedding_mandap_1794573599361.jpg',
    },
    {
      title: 'Mulshi Estate Diwali Elevation',
      meta: '1,400m Golden Serial Curtain · IP65 Timer Box',
      image: '/src/assets/images/service_diwali_decor_1794573599562.jpg',
    },
    {
      title: 'Sangeet Arena DMX Truss Rig',
      meta: '16 Moving-Head Beams · 3-Phase Load Distro',
      image: '/src/assets/images/service_stage_dj_1794573600790.jpg',
    },
    {
      title: 'Indiranagar Villa Landscape',
      meta: '12 Tree Wraps · Brass Pathway Bollards',
      image: '/src/assets/images/service_garden_outdoor_1794573601741.jpg',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Bar Contract: 3 zones, gap-8, single-line controls */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-4">
          <Link to="/" className="shrink-0">
            <BrandMark dark />
          </Link>

          <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-slate-300">
            <a href="#services" className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0">
              Services
            </a>
            <a href="#projects" className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0">
              Projects
            </a>
            <a href="#reviews" className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0">
              Reviews
            </a>
            <Link
              to={profile?.role === 'customer' ? '/customer' : '/auth?mode=login&role=customer'}
              className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
            >
              {profile?.role === 'customer' ? 'Customer Panel' : 'Customer Login'}
            </Link>
            <Link
              to={profile?.role === 'admin' ? '/admin' : '/auth?mode=login&role=admin'}
              className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
            >
              {profile?.role === 'admin' ? 'Owner Panel' : 'Owner Login'}
            </Link>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => handleBookClick()}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Book a Service</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-800/70 bg-slate-950">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/3 h-[420px] w-[620px] rounded-full bg-amber-500/12 blur-[120px]"
        />
        <div className="mx-auto max-w-7xl px-6 py-16 lg:py-22">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="lg:col-span-6 flex flex-col justify-center"
            >
              <p className="text-xs font-medium tracking-wide text-amber-400 mb-4">
                Architectural Event Lighting · Licensed Electrical Contracting
              </p>
              <h1
                className="font-display font-bold tracking-tight text-white leading-[1.08] mb-5"
                style={{ fontSize: 'clamp(2.25rem, 3.8vw, 3.5rem)', textWrap: 'balance' }}
              >
                Illuminate Your Celebrations, Create Unforgettable Memories.
              </h1>
              <p className="text-base leading-relaxed text-slate-300 max-w-xl mb-8">
                Full-service Diwali facade curtains, wedding starlight canopies, DMX concert stage rigs, and certified
                three-phase power distribution—engineered with live online booking, itemized quotations, and transparent
                payment tracking.
              </p>

              <div className="flex flex-wrap items-center gap-4 mb-8">
                <button
                  onClick={() => handleBookClick()}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Calendar className="h-4 w-4" />
                  <span>Book a Service</span>
                </button>
                <a
                  href="#services"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:border-amber-500/60 hover:text-amber-300 transition-colors whitespace-nowrap"
                >
                  <span>Explore Services</span>
                </a>
              </div>

              <div className="flex flex-wrap items-center gap-5 border-t border-slate-800/80 pt-6 text-sm text-slate-400">
                <Link
                  to="/auth?mode=register&role=customer"
                  className="font-medium text-slate-200 hover:text-amber-400 transition-colors underline underline-offset-4 decoration-slate-700"
                >
                  Customer Login / Register
                </Link>
                <span aria-hidden="true">·</span>
                <Link
                  to="/auth?mode=login&role=admin"
                  className="font-medium text-slate-200 hover:text-amber-400 transition-colors underline underline-offset-4 decoration-slate-700"
                >
                  Shop Owner Login
                </Link>
                <span aria-hidden="true">·</span>
                <a
                  href="https://wa.me/919820451100?text=Hello%20LuminaCraft%2C%20I%20would%20like%20to%20inquire%20about%20event%20lighting."
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>WhatsApp Us</span>
                </a>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="lg:col-span-6 relative rounded-xl overflow-hidden border border-slate-800 bg-slate-900 min-h-[340px]"
            >
              <ImageWithFallback
                src="/src/assets/images/hero_event_lighting_1794573598488.jpg"
                alt="Courtyard wedding and Diwali illumination by LuminaCraft"
                className="h-full w-full object-cover lg:h-full"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />
              <div className="absolute bottom-5 left-5 right-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs text-amber-300 font-medium">Featured Installation</p>
                  <p className="text-base font-display font-semibold text-white">
                    Heritage Estate Courtyard Canopy &amp; Uplighting
                  </p>
                </div>
                <span className="font-mono text-xs text-slate-300 tabular-nums">
                  2700K Warm Gold · 63A Distro
                </span>
              </div>
            </motion.div>
          </div>

          {/* 4-column spec strip below hero split */}
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-t border-slate-800/80 pt-8">
            <div className="rounded-lg border border-slate-800/90 bg-slate-900/60 p-4">
              <p className="font-mono text-lg font-semibold text-amber-400 tabular-nums">{services.length || 9} Services</p>
              <p className="text-xs text-slate-400 mt-1">Diwali, weddings, DMX stage, garden &amp; custom electrical</p>
            </div>
            <div className="rounded-lg border border-slate-800/90 bg-slate-900/60 p-4">
              <p className="font-mono text-lg font-semibold text-white tabular-nums">IP65 Rated</p>
              <p className="text-xs text-slate-400 mt-1">Weather-sealed joints with RCCB earth-leakage safety</p>
            </div>
            <div className="rounded-lg border border-slate-800/90 bg-slate-900/60 p-4">
              <p className="font-mono text-lg font-semibold text-white tabular-nums">Live Quotes</p>
              <p className="text-xs text-slate-400 mt-1">Review itemized quotations and download PDF invoices</p>
            </div>
            <div className="rounded-lg border border-slate-800/90 bg-slate-900/60 p-4">
              <p className="font-mono text-lg font-semibold text-white tabular-nums">Standby Crew</p>
              <p className="text-xs text-slate-400 mt-1">Dedicated electricians on-site throughout your event</p>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section (Light high-contrast editorial section) */}
      <section id="services" className="bg-slate-50 text-slate-900 py-20 border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
            <div>
              <p className="text-xs font-semibold tracking-wide text-amber-700 mb-2">
                01. Electrical &amp; Lighting Catalog
              </p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900">
                Services Tailored to Every Venue Scale
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-200/70 p-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredServices.map((service) => (
              <div
                key={service.id}
                className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-colors hover:border-amber-400"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-slate-900">
                  <ImageWithFallback
                    src={service.image_url}
                    alt={service.name}
                    className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03]"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                    <span>{service.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{service.packages.length} {service.packages.length === 1 ? 'package' : 'packages'}</span>
                  </div>
                  <h3 className="font-display text-lg font-semibold text-slate-900 mb-2">{service.name}</h3>
                  <p className="text-sm leading-relaxed text-slate-600 mb-5 flex-1">{service.description}</p>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                    <div>
                      <p className="text-xs text-slate-500">Starting from</p>
                      <p className="font-mono text-base font-semibold text-slate-900 tabular-nums">
                        {formatINR(service.starting_price)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleBookClick(service.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 hover:text-slate-950 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <span>Book Service</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recent Projects & Gallery */}
      <section id="projects" className="bg-slate-950 text-slate-100 py-20 border-b border-slate-800/80">
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-semibold tracking-wide text-amber-400 mb-2">02. Recent Installations</p>
            <h2 className="font-display text-3xl font-bold tracking-tight text-white mb-3">
              Recent Lighting Projects &amp; Gallery
            </h2>
            <p className="text-sm text-slate-400">
              Every project is pre-tested for load balance, concealed cable routing, and weather protection before your
              first guest arrives.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {galleryProjects.map((proj) => (
              <div
                key={proj.title}
                className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900 aspect-[4/3]"
              >
                <ImageWithFallback
                  src={proj.image}
                  alt={proj.title}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/25 to-transparent" />
                <div className="absolute bottom-5 left-5 right-5">
                  <p className="text-xs font-mono text-amber-300 mb-1">{proj.meta}</p>
                  <h3 className="font-display text-xl font-semibold text-white">{proj.title}</h3>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Customer Testimonials */}
      <section id="reviews" className="bg-white text-slate-900 py-20 border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
            <div>
              <p className="text-xs font-semibold tracking-wide text-amber-700 mb-2">03. Client Proof</p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900">
                Trusted by Families, Planners &amp; Showrooms
              </h2>
            </div>
            <p className="text-sm text-slate-500 tabular-nums">
              {reviews.length} verified client {reviews.length === 1 ? 'review' : 'reviews'} from completed bookings
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {reviews.slice(0, 6).map((rev) => (
              <div key={rev.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1 text-amber-500 mb-4" aria-label={`${rev.rating} out of 5 stars`}>
                    {Array.from({ length: rev.rating }).map((_, idx) => (
                      <Star key={idx} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                  <p className="text-sm leading-relaxed text-slate-700 mb-6">“{rev.comment}”</p>
                </div>
                <div className="border-t border-slate-200 pt-4 text-xs">
                  <p className="font-semibold text-slate-900">{rev.customer_name}</p>
                  <p className="text-slate-500 mt-0.5">{rev.service_name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact & Inquiry Section */}
      <section id="contact" className="bg-slate-950 text-slate-100 py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-5">
              <p className="text-xs font-semibold tracking-wide text-amber-400 mb-2">04. Direct Dispatch</p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-white mb-4">
                Plan Your Event Illumination
              </h2>
              <p className="text-sm leading-relaxed text-slate-400 mb-8">
                Need a rapid site visit, load calculation, or festive quotation? Reach our engineering desk directly or
                message us on WhatsApp.
              </p>

              <div className="space-y-4 text-sm text-slate-300 mb-8">
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-amber-400 shrink-0" />
                  <span className="font-mono tabular-nums">+91 98204 51100</span>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-amber-400 shrink-0" />
                  <span>hello@luminacraft.in</span>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-amber-400 shrink-0" />
                  <span>Showroom 4, Bund Garden Road, Pune 411001 · Serving Mumbai &amp; Jaipur</span>
                </div>
              </div>

              <a
                href="https://wa.me/919820451100?text=Hello%20LuminaCraft%2C%20I%20would%20like%20to%20book%20event%20lighting."
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2.5 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                <span>Chat on WhatsApp</span>
              </a>
            </div>

            <div className="lg:col-span-7">
              <form
                onSubmit={handleInquirySubmit}
                className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8 space-y-5"
              >
                <h3 className="font-display text-xl font-semibold text-white">Request a Callback</h3>
                {inquirySent && (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/60 px-4 py-3 text-sm text-emerald-200">
                    <Check className="h-4 w-4 shrink-0" />
                    <span>Your inquiry has been dispatched to the shop owner dashboard.</span>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Your Name *</label>
                    <input
                      type="text"
                      required
                      value={inquiryForm.name}
                      onChange={(e) => setInquiryForm({ ...inquiryForm, name: e.target.value })}
                      placeholder="Rohan Kulkarni"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Mobile Number *</label>
                    <input
                      type="tel"
                      required
                      value={inquiryForm.phone}
                      onChange={(e) => setInquiryForm({ ...inquiryForm, phone: e.target.value })}
                      placeholder="+91 98200 12345"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Email (Optional)</label>
                  <input
                    type="email"
                    value={inquiryForm.email}
                    onChange={(e) => setInquiryForm({ ...inquiryForm, email: e.target.value })}
                    placeholder="rohan@example.com"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Event &amp; Lighting Details *</label>
                  <textarea
                    rows={3}
                    required
                    value={inquiryForm.message}
                    onChange={(e) => setInquiryForm({ ...inquiryForm, message: e.target.value })}
                    placeholder="Venue location, approximate sq.ft area, and event dates..."
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingInquiry}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <span>{submittingInquiry ? 'Sending...' : 'Send Inquiry'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-8 text-xs text-slate-400">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-4 px-6">
          <p>© {new Date().getFullYear()} LuminaCraft Electrical &amp; Event Lighting. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-5">
            <Link to="/auth?mode=login&role=customer" className="hover:text-amber-400 transition-colors">
              Customer Portal
            </Link>
            <Link to="/auth?mode=login&role=admin" className="hover:text-amber-400 transition-colors">
              Shop Owner Admin
            </Link>
            <button
              onClick={() => setShowSetupModal(true)}
              className="inline-flex items-center gap-1.5 hover:text-amber-400 transition-colors cursor-pointer"
            >
              <Database className="h-3.5 w-3.5" />
              <span>Supabase &amp; Schema Guide</span>
            </button>
          </div>
        </div>
      </footer>

      {showSetupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="max-w-xl w-full rounded-xl border border-slate-700 bg-slate-900 p-6 text-slate-200 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-amber-400" />
                <h3 className="font-display text-lg font-semibold text-white">Supabase &amp; Database Integration</h3>
              </div>
              <button
                onClick={() => setShowSetupModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-slate-300">
              <p>
                LuminaCraft runs live right now using a full-stack Express + persistent SQLite (<code className="text-amber-300">node:sqlite</code>) + WebSocket server on Port 3000 so all bookings, quotations, inventory, worker schedules, and charts persist immediately.
              </p>
              <p>
                To connect your own external <strong>Supabase PostgreSQL</strong> project:
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-300">
                <li>Run <code className="text-amber-300">/supabase/schema.sql</code> in your Supabase SQL Editor (creates all 15 tables, RLS policies, Storage bucket, and Realtime publications).</li>
                <li>Set <code className="text-amber-300">VITE_SUPABASE_URL</code> and <code className="text-amber-300">VITE_SUPABASE_ANON_KEY</code> in your environment secrets.</li>
                <li>Never expose your <code className="text-amber-300">service_role</code> key in frontend code.</li>
              </ol>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowSetupModal(false)}
                className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
