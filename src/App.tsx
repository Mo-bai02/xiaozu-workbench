import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { App as AntApp, ConfigProvider, Spin, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AppShell } from '@/components/AppShell';
import { useAuthStore } from '@/store/auth';
import { useGroupStore } from '@/store/group';
import { useUIStore } from '@/store/ui';

/**
 * 路由级懒加载：每个页面单独一个 chunk。
 * 这是"脚手架"该给的默认值 —— 新页面只要 lazy 一下，就自动拆包。
 */
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

/** 登录守卫：没登录一律回登录页；登录态还没拉回来时先别闪 */
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

  // 登录后拉一次小组列表；退出登录时清空，避免换账号还看到上一个人的数据
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
            {/* 分享页在 AppShell 之外：外部访客不该看到工作台的导航与数据入口 */}
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
