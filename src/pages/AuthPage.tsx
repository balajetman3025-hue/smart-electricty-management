import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, KeyRound, ShieldCheck, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BrandMark } from '../components/CommonUI';

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const initialRole = searchParams.get('role') === 'admin' ? 'admin' : 'customer';
  const initialMode = searchParams.get('mode') === 'register' && initialRole === 'customer' ? 'register' : 'login';
  const nextPath = searchParams.get('next');

  const [roleTab, setRoleTab] = useState<'customer' | 'admin'>(initialRole);
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login, register, showToast } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (roleTab === 'customer' && mode === 'register') {
        await register({
          full_name: fullName,
          email,
          phone,
          password,
          company_name: companyName || undefined,
        });
        showToast('Welcome to LuminaCraft! Your customer account is ready.', 'success');
        navigate(nextPath || '/customer');
      } else {
        const loggedProfile = await login(email, password, roleTab);
        showToast(`Signed in as ${loggedProfile.full_name}`, 'success');
        if (loggedProfile.role === 'admin') {
          navigate('/admin');
        } else {
          navigate(nextPath || '/customer');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = (role: 'customer' | 'admin') => {
    setRoleTab(role);
    setMode('login');
    setError('');
    if (role === 'admin') {
      setEmail('owner@luminacraft.in');
      setPassword('admin123');
    } else {
      setEmail('ananya.sharma@example.com');
      setPassword('customer123');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800/80 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8">
          <Link to="/">
            <BrandMark dark />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-300 hover:text-amber-400 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Home</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 sm:p-8 shadow-2xl">
          {/* Role Switcher */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-950 p-1 mb-6 border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setRoleTab('customer');
                setError('');
              }}
              className={`flex items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition-colors cursor-pointer ${
                roleTab === 'customer' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              <span>Customer Portal</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRoleTab('admin');
                setMode('login');
                setError('');
              }}
              className={`flex items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition-colors cursor-pointer ${
                roleTab === 'admin' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Shop Owner Admin</span>
            </button>
          </div>

          <h1 className="font-display text-2xl font-bold text-white mb-1">
            {roleTab === 'admin'
              ? 'Shop Owner Sign In'
              : mode === 'register'
                ? 'Create Customer Account'
                : 'Customer Sign In'}
          </h1>
          <p className="text-xs text-slate-400 mb-6">
            {roleTab === 'admin'
              ? 'Authorized access for bookings, inventory, crew & financial ledger.'
              : 'Track bookings, approve quotations, and download invoices in real time.'}
          </p>

          {error && (
            <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-950/60 px-3.5 py-2.5 text-xs text-rose-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {roleTab === 'customer' && mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ananya Sharma"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Mobile Number *</label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98112 34091"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Organization (Opt.)</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Sharma Events"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={roleTab === 'admin' ? 'owner@luminacraft.in' : 'you@example.com'}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Password *</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {submitting
                ? 'Please wait...'
                : roleTab === 'admin'
                  ? 'Sign In to Admin Panel'
                  : mode === 'register'
                    ? 'Register & Continue'
                    : 'Sign In to Customer Panel'}
            </button>
          </form>

          {roleTab === 'customer' && (
            <div className="mt-4 text-center text-xs text-slate-400">
              {mode === 'login' ? (
                <>
                  New to LuminaCraft?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setError('');
                    }}
                    className="font-semibold text-amber-400 hover:text-amber-300 cursor-pointer"
                  >
                    Create a customer account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError('');
                    }}
                    className="font-semibold text-amber-400 hover:text-amber-300 cursor-pointer"
                  >
                    Sign in here
                  </button>
                </>
              )}
            </div>
          )}

          {/* Quick Demo Fill */}
          <div className="mt-6 border-t border-slate-800 pt-5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-3">
              <KeyRound className="h-3.5 w-3.5 text-amber-400" />
              <span>Quick Demo Credentials</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => fillDemo('customer')}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-left text-xs hover:border-amber-500/60 transition-colors cursor-pointer"
              >
                <p className="font-semibold text-white">Fill Customer</p>
                <p className="font-mono text-[11px] text-slate-400 truncate">ananya.sharma@example.com</p>
              </button>
              <button
                type="button"
                onClick={() => fillDemo('admin')}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-left text-xs hover:border-amber-500/60 transition-colors cursor-pointer"
              >
                <p className="font-semibold text-white">Fill Shop Owner</p>
                <p className="font-mono text-[11px] text-slate-400 truncate">owner@luminacraft.in</p>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
