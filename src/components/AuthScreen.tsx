import React, { useState } from 'react';
import { BookOpenCheck, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import type { AuthUser, UserRole } from '../types.ts';

interface AuthScreenProps {
  initialMode?: 'login' | 'register';
  onModeChange?: (mode: 'login' | 'register') => void;
  onAuthenticated: (token: string, user: AuthUser) => void;
}

const DEMO_ACCOUNTS: Array<{
  label: string;
  roleLabel: string;
  role: UserRole;
  email: string;
  password: string;
}> = [
  {
    label: 'Maria Reyes',
    roleLabel: 'Teacher · IT2R2, ARCH2A',
    role: 'teacher',
    email: 'maria.reyes@sample.ph',
    password: 'teacher123',
  },
  {
    label: 'Joseph Cruz',
    roleLabel: 'Teacher · IT2R1',
    role: 'teacher',
    email: 'joseph.cruz@sample.ph',
    password: 'teacher123',
  },
  {
    label: 'Rafael Lim',
    roleLabel: 'Administrator',
    role: 'admin',
    email: 'rafael.lim@sample.ph',
    password: 'admin123',
  },
];

export function AuthScreen({ initialMode = 'login', onModeChange, onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [roleTab, setRoleTab] = useState<UserRole>('teacher');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === 'register') {
        const res = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ name, email, password }),
        });
        onAuthenticated(res.token, res.user);
      } else {
        const res = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password, role: roleTab }),
        });
        onAuthenticated(res.token, res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demo: (typeof DEMO_ACCOUNTS)[number]) => {
    setMode('login');
    setRoleTab(demo.role);
    setEmail(demo.email);
    setPassword(demo.password);
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: demo.email, password: demo.password, role: demo.role }),
      });
      onAuthenticated(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Academic System Overview */}
        <div className="lg:col-span-6 flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-8">
          <div>
            <div className="flex items-center gap-2.5 text-blue-800">
              <BookOpenCheck className="h-6 w-6 shrink-0" />
              <span className="font-display text-lg font-bold tracking-tight text-slate-900">
                ScholarLedger
              </span>
            </div>

            <h1 className="mt-8 font-display text-3xl font-bold tracking-tight text-slate-900 text-balance">
              Academic records with built-in administrative accountability.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              Manage course sections, enrolled students, assessments, student scores, and subject attendance in one structured ledger. Every sensitive edit or deletion requires a documented reason for administrative review.
            </p>

            <div className="mt-8 border-t border-slate-200 pt-6 space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Teacher Workspace
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Scoped strictly to sections you handle. Enroll or sort students, record assessment scores, log attendance, and submit documented change reasons.
                </p>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Administrative Oversight
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Review teacher-submitted reasons, approve or reject flagged student deletions with automatic restoration, and maintain log capacity.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-200 pt-5 text-xs text-slate-500">
            Relational Student Management System · Teacher &amp; Admin Portal
          </div>
        </div>

        {/* Right Sign-In / Registration Card */}
        <div className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <h2 className="font-display text-xl font-semibold text-slate-900">
                {mode === 'login' ? 'Sign in to your account' : 'Register Teacher Account'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  const next = mode === 'login' ? 'register' : 'login';
                  setMode(next);
                  onModeChange?.(next);
                  setError(null);
                }}
                className="text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline whitespace-nowrap shrink-0"
              >
                {mode === 'login' ? 'New teacher? Register' : 'Back to sign in'}
              </button>
            </div>

            {mode === 'login' && (
              <div className="mt-5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setRoleTab('teacher');
                    setError(null);
                  }}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    roleTab === 'teacher'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Teacher Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRoleTab('admin');
                    setError(null);
                  }}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    roleTab === 'admin'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Administrator
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {mode === 'register' && (
                <div>
                  <label htmlFor="reg-name" className="block text-sm font-medium text-slate-700">
                    Full Name
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Elena Mercado"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className="block text-sm font-medium text-slate-700">
                  Institutional Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={
                    mode === 'login' && roleTab === 'admin'
                      ? 'rafael.lim@sample.ph'
                      : 'maria.reyes@sample.ph'
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div>
                <label htmlFor="auth-password" className="block text-sm font-medium text-slate-700">
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password (min. 6 characters)"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {loading
                  ? 'Authenticating...'
                  : mode === 'register'
                  ? 'Create Teacher Account'
                  : roleTab === 'admin'
                  ? 'Sign In as Administrator'
                  : 'Sign In as Teacher'}
              </button>
            </form>
          </div>

          <div className="mt-8 border-t border-slate-200 pt-5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <ShieldCheck className="h-4 w-4 text-slate-400" />
              <span>Quick Demo Access (Seeded Sample Accounts)</span>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {DEMO_ACCOUNTS.map((demo) => (
                <button
                  key={demo.email}
                  type="button"
                  disabled={loading}
                  onClick={() => handleDemoLogin(demo)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left transition-colors hover:border-slate-300 hover:bg-slate-100 disabled:opacity-50"
                >
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    {demo.label}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {demo.roleLabel}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
