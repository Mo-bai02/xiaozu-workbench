import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { App as AntApp, ConfigProvider, Spin, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AppShell } from '@/components/AppShell';
import { useAuthStore } from '@/store/auth';
import { useGroupStore } from '@/store/group';
import { useUIStore } from '@/store/ui';

const ChatPage = lazy(() => import('@/features/chat/ChatPage').then((m) => ({ default: m.ChatPage })));
const OverviewPage = lazy(() => import('@/features/workspace/OverviewPage').then((m) => ({ default: m.OverviewPage })));
const BoardPage = lazy(() => import('@/features/workspace/BoardPage').then((m) => ({ default: m.BoardPage })));
const MembersPage = lazy(() => import('@/features/workspace/MembersPage').then((m) => ({ default: m.MembersPage })));
const NotesPage = lazy(() => import('@/features/notes/NotesPage').then((m) => ({ default: m.NotesPage })));
const ExpensesPage = lazy(() => import('@/features/expenses/ExpensesPage').then((m) => ({ default: m.ExpensesPage })));
const FocusPage = lazy(() => import('@/features/focus/FocusPage').then((m) => ({ default: m.FocusPage })));
const GeneratorPage = lazy(() =>
  import('@/features/generator/GeneratorPage').then((m) => ({ default: m.GeneratorPage })),
);
const LogsPage = lazy(() => import('@/features/logs/LogsPage').then((m) => ({ default: m.LogsPage })));
const SharePage = lazy(() => import('@/features/notes/SharePage').then((m) => ({ default: m.SharePage })));
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const LoginPage = lazy(() => import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const GroupsPage = lazy(() => import('@/features/groups/GroupsPage').then((m) => ({ default: m.GroupsPage })));

function PageFallback() {
  return (
    <div className="center-box">
      <Spin />
    </div>
  );
}

function RequireAuth() {
  const user = useAuthStore((state) => state.user);
  const ready = useAuthStore((state) => state.ready);
  const location = useLocation();

  if (!ready) return <PageFallback />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function App() {
  const dark = useUIStore((state) => state.dark);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const user = useAuthStore((state) => state.user);
  const fetchGroups = useGroupStore((state) => state.fetchGroups);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (user) void fetchGroups();
    else useGroupStore.setState({ groups: [], loaded: false, activeId: null });
  }, [user, fetchGroups]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#3b6ef6',
          borderRadius: 10,
          fontSize: 14,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Layout: {
            headerBg: 'transparent',
            bodyBg: 'transparent',
            siderBg: 'transparent',
          },
        },
      }}
    >
      <AntApp>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/share/:id" element={<SharePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/groups" element={<GroupsPage />} />
            </Route>
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<Navigate to="/overview" replace />} />
                <Route path="/overview" element={<OverviewPage />} />
                <Route path="/board" element={<BoardPage />} />
                <Route path="/members" element={<MembersPage />} />
                <Route path="/notes" element={<NotesPage />} />
                <Route path="/expenses" element={<ExpensesPage />} />
                <Route path="/focus" element={<FocusPage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/generator" element={<GeneratorPage />} />
                <Route path="/logs" element={<LogsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/overview" replace />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </AntApp>
    </ConfigProvider>
  );
}
