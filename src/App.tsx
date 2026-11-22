import { lazy, Suspense, useEffect } from 'react';
import { App as AntApp, ConfigProvider, Spin, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { useUIStore } from '@/store/ui';

/**
 * 路由级懒加载：对话页是首屏，另外两个页面（表格 / 表单很重）按需加载。
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

function PageFallback() {
  return (
    <div className="center-box">
      <Spin />
    </div>
  );
}

export function App() {
  const dark = useUIStore((state) => state.dark);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

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
          </Routes>
        </Suspense>
      </AntApp>
    </ConfigProvider>
  );
}
