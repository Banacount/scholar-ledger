import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  BookOpenCheck,
  ClipboardCheck,
  GraduationCap,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  X,
} from 'lucide-react';
import { AuditLogsView } from './components/AuditLogsView.tsx';
import { AuthScreen } from './components/AuthScreen.tsx';
import { CatalogDirectoryView } from './components/CatalogDirectoryView.tsx';
import { GradebookView } from './components/GradebookView.tsx';
import { OverviewView } from './components/OverviewView.tsx';
import { SectionsView } from './components/SectionsView.tsx';
import { StudentsView } from './components/StudentsView.tsx';
import { apiRequest, getStoredToken, setStoredToken } from './lib/api.ts';
import { useAppRouter } from './lib/router.ts';
import type { AuthUser, DashboardSummary } from './types.ts';

type ActiveTab = 'overview' | 'sections' | 'students' | 'gradebook' | 'logs' | 'catalog' | 'not-found';

const TAB_LABELS: Record<ActiveTab, string> = {
  overview: 'Overview',
  sections: 'Sections',
  students: 'Students',
  gradebook: 'Gradebook',
  logs: 'Audit & Review',
  catalog: 'Catalog & Faculty',
  'not-found': 'Page Not Found',
};

function resolveRoute(
  pathname: string,
  searchParams: URLSearchParams,
  isAdmin: boolean
): {
  tab: ActiveTab;
  gradebookSubTab: 'scores' | 'assessments' | 'attendance';
  sectionId: number | null;
  studentId: number | null;
  logStatus: string | undefined;
} {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const sectionParam = searchParams.get('sectionId');
  const studentParam = searchParams.get('studentId');
  const statusParam = searchParams.get('status') || undefined;

  let sectionId = sectionParam ? Number(sectionParam) : null;
  if (sectionId !== null && Number.isNaN(sectionId)) sectionId = null;

  let studentId = studentParam ? Number(studentParam) : null;
  if (studentId !== null && Number.isNaN(studentId)) studentId = null;

  // Support /sections/:id/students
  const secStudentsMatch = clean.match(/^\/sections\/(\d+)\/students$/);
  if (secStudentsMatch) {
    return {
      tab: 'students',
      gradebookSubTab: 'scores',
      sectionId: Number(secStudentsMatch[1]),
      studentId,
      logStatus: undefined,
    };
  }

  if (clean === '/' || clean === '/overview' || clean === '/login' || clean === '/register') {
    return {
      tab: 'overview',
      gradebookSubTab: 'scores',
      sectionId: null,
      studentId: null,
      logStatus: undefined,
    };
  }
  if (clean === '/sections') {
    return {
      tab: 'sections',
      gradebookSubTab: 'scores',
      sectionId: null,
      studentId: null,
      logStatus: undefined,
    };
  }
  if (clean === '/students') {
    return {
      tab: 'students',
      gradebookSubTab: 'scores',
      sectionId,
      studentId: null,
      logStatus: undefined,
    };
  }
  if (clean === '/gradebook') {
    return {
      tab: 'gradebook',
      gradebookSubTab: 'scores',
      sectionId,
      studentId,
      logStatus: undefined,
    };
  }
  if (clean === '/gradebook/assessments') {
    return {
      tab: 'gradebook',
      gradebookSubTab: 'assessments',
      sectionId,
      studentId,
      logStatus: undefined,
    };
  }
  if (clean === '/gradebook/attendance') {
    return {
      tab: 'gradebook',
      gradebookSubTab: 'attendance',
      sectionId,
      studentId,
      logStatus: undefined,
    };
  }
  if (clean === '/audit-logs' || clean === '/logs') {
    return {
      tab: 'logs',
      gradebookSubTab: 'scores',
      sectionId: null,
      studentId: null,
      logStatus: statusParam,
    };
  }
  if (clean === '/catalog') {
    return {
      tab: isAdmin ? 'catalog' : 'overview',
      gradebookSubTab: 'scores',
      sectionId: null,
      studentId: null,
      logStatus: undefined,
    };
  }

  return {
    tab: 'not-found',
    gradebookSubTab: 'scores',
    sectionId: null,
    studentId: null,
    logStatus: undefined,
  };
}

export default function App() {
  const { pathname, searchParams, navigate } = useAppRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [dashLoading, setDashLoading] = useState(false);

  const loadDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      const data = await apiRequest<DashboardSummary>('/api/dashboard');
      setDashboard(data);
    } catch {
      // Handled gracefully
    } finally {
      setDashLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthChecking(false);
      return;
    }
    apiRequest<{ user: AuthUser }>('/api/auth/me')
      .then((res) => {
        setUser(res.user);
      })
      .catch(() => {
        setStoredToken(null);
        setUser(null);
      })
      .finally(() => {
        setAuthChecking(false);
      });
  }, []);

  useEffect(() => {
    if (user) {
      loadDashboard();
    }
  }, [user, loadDashboard]);

  // Normalize URL when authenticated on /login or /register
  useEffect(() => {
    if (user && (pathname === '/login' || pathname === '/register')) {
      navigate('/overview', { replace: true });
    }
  }, [user, pathname, navigate]);

  const handleAuthenticated = (token: string, authenticatedUser: AuthUser) => {
    setStoredToken(token);
    setUser(authenticatedUser);
    navigate('/overview', { replace: true });
  };

  const handleSignOut = () => {
    setStoredToken(null);
    setUser(null);
    setDashboard(null);
    setMobileMenuOpen(false);
    navigate('/login', { replace: true });
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Loading workspace...</div>
      </div>
    );
  }

  if (!user) {
    const initialMode = pathname === '/register' ? 'register' : 'login';
    return (
      <AuthScreen
        initialMode={initialMode}
        onModeChange={(nextMode) => navigate(nextMode === 'register' ? '/register' : '/login')}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const isAdmin = user.role === 'admin';
  const route = resolveRoute(pathname, searchParams, isAdmin);
  const activeTab = route.tab;
  const pendingCount = dashboard?.metrics.pendingReviews ?? 0;

  const navigateTab = (tab: string, sectionId?: number) => {
    setMobileMenuOpen(false);
    switch (tab) {
      case 'overview':
        navigate('/overview');
        break;
      case 'sections':
        navigate('/sections');
        break;
      case 'students':
        navigate(sectionId ? `/sections/${sectionId}/students` : '/students');
        break;
      case 'gradebook':
        navigate(sectionId ? `/gradebook?sectionId=${sectionId}` : '/gradebook');
        break;
      case 'logs':
        navigate('/audit-logs');
        break;
      case 'catalog':
        navigate('/catalog');
        break;
      default:
        navigate('/overview');
    }
  };

  const navItems: Array<{
    id: ActiveTab;
    path: string;
    label: string;
    icon: typeof LayoutDashboard;
    count?: number;
  }> = [
    { id: 'overview', path: '/overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'sections', path: '/sections', label: isAdmin ? 'All Sections' : 'My Sections', icon: Layers },
    { id: 'students', path: '/students', label: isAdmin ? 'All Students' : 'Students', icon: Users },
    { id: 'gradebook', path: '/gradebook', label: 'Gradebook', icon: GraduationCap },
    {
      id: 'logs',
      path: '/audit-logs',
      label: isAdmin ? 'Audit & Review' : 'My Audit Log',
      icon: ClipboardCheck,
      count: pendingCount > 0 ? pendingCount : undefined,
    },
    ...(isAdmin
      ? [{ id: 'catalog' as ActiveTab, path: '/catalog', label: 'Catalog & Faculty', icon: BookOpen }]
      : []),
  ];

  const SidebarContent = () => (
    <div className="flex h-full flex-col justify-between bg-white border-r border-slate-200">
      <div>
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <button
            type="button"
            onClick={() => {
              navigate('/overview');
              setMobileMenuOpen(false);
            }}
            className="flex items-center gap-2.5 text-left"
          >
            <BookOpenCheck className="h-5 w-5 text-blue-700 shrink-0" />
            <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
              ScholarLedger
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation"
            className="lg:hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="p-3 space-y-1" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <a
                key={item.id}
                href={item.path}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(item.path);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-blue-700' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.count !== undefined && (
                  <span className="font-mono text-xs font-semibold text-amber-700 tabular-nums shrink-0">
                    {item.count}
                  </span>
                )}
              </a>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-slate-200 p-4 space-y-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">{user.name}</div>
          <div className="text-xs text-slate-500 truncate">
            {isAdmin ? `Administrator · ${user.email}` : `Teacher · ${user.email}`}
          </div>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-50 w-64 max-w-[80vw] h-full">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Workspace Main Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 border-b border-slate-200 bg-white px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
              className="lg:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 shrink-0"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">
                ScholarLedger
              </span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-display font-semibold text-slate-900 truncate">
                {TAB_LABELS[activeTab]}
              </h1>
            </div>
          </div>

          <div className="shrink-0">
            {isAdmin ? (
              <button
                type="button"
                onClick={() => navigate('/audit-logs')}
                className="rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0"
              >
                {pendingCount > 0 ? `Review Queue (${pendingCount})` : 'Audit Logs'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/gradebook')}
                className="rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0"
              >
                Open Gradebook
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {activeTab === 'overview' && (
            <OverviewView
              data={dashboard}
              loading={dashLoading}
              onNavigate={navigateTab}
            />
          )}

          {activeTab === 'sections' && (
            <SectionsView
              user={user}
              onOpenStudents={(secId) => navigate(`/sections/${secId}/students`)}
              onDataChanged={loadDashboard}
            />
          )}

          {activeTab === 'students' && (
            <StudentsView
              user={user}
              initialSectionId={route.sectionId}
              onOpenGradebookForStudent={(stuId, secId) =>
                navigate(`/gradebook?sectionId=${secId}&studentId=${stuId}`)
              }
              onDataChanged={loadDashboard}
            />
          )}

          {activeTab === 'gradebook' && (
            <GradebookView
              user={user}
              initialSubTab={route.gradebookSubTab}
              onSubTabChange={(sub) => {
                const suffix = sub === 'scores' ? '' : `/${sub}`;
                const qs = new URLSearchParams();
                if (route.sectionId) qs.set('sectionId', String(route.sectionId));
                if (route.studentId) qs.set('studentId', String(route.studentId));
                const query = qs.toString() ? `?${qs.toString()}` : '';
                navigate(`/gradebook${suffix}${query}`);
              }}
              initialSectionId={route.sectionId}
              initialStudentId={route.studentId}
              onDataChanged={loadDashboard}
            />
          )}

          {activeTab === 'logs' && (
            <AuditLogsView
              user={user}
              defaultStatus={route.logStatus}
              onDataChanged={loadDashboard}
            />
          )}

          {activeTab === 'catalog' && isAdmin && <CatalogDirectoryView />}

          {activeTab === 'not-found' && (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-14 text-center">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Route not found
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                No workspace page exists at <span className="font-mono">{pathname}</span>.
              </p>
              <button
                type="button"
                onClick={() => navigate('/overview')}
                className="mt-5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
              >
                Return to Overview
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
