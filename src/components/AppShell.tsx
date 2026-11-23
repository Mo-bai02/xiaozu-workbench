import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  Dropdown,
  Empty,
  Grid,
  Layout,
  Menu,
  Popover,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  BellOutlined,
  BulbFilled,
  BulbOutlined,
  ClockCircleOutlined,
  DownOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  GithubOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  ProjectOutlined,
  SearchOutlined,
  SettingOutlined,
  SwapOutlined,
  TableOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { CommandPalette, SHORTCUT_LABEL } from '@/components/CommandPalette';
import { GroupSwitcher } from '@/components/GroupSwitcher';
import { FloatingBall } from '@/components/FloatingBall';
import { api } from '@/lib/http';
import { formatCst } from '@/lib/time';
import { useHealth } from '@/lib/health';
import { useModels, type ModelOption } from '@/lib/models';
import { useExpenseStore } from '@/features/expenses/store';
import { useWorkspaceStore } from '@/features/workspace/store';
import { useAuthStore } from '@/store/auth';
import { useGroupStore } from '@/store/group';
import { useUIStore } from '@/store/ui';

const { Header, Sider, Content } = Layout;

const NAV = [
  { key: '/overview', icon: <DashboardOutlined />, label: '项目概览' },
  { key: '/board', icon: <ProjectOutlined />, label: '任务看板' },
  { key: '/members', icon: <TeamOutlined />, label: '成员管理' },
  { key: '/notes', icon: <FileTextOutlined />, label: '笔记' },
  { key: '/expenses', icon: <WalletOutlined />, label: '经费账本' },
  { key: '/focus', icon: <ClockCircleOutlined />, label: '专注计时' },
  { key: '/chat', icon: <MessageOutlined />, label: '智能助手' },
  { key: '/generator', icon: <ExperimentOutlined />, label: '表单生成' },
  { key: '/logs', icon: <TableOutlined />, label: 'AI 调用记录' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置与数据' },
];

const HEALTH_DOT: Record<string, string> = {
  green: '#2f9e63',
  orange: '#d4a72c',
  red: '#e5484d',
  default: '#c4ccd8',
};

const MENU_ITEMS = [
  { type: 'group' as const, label: '工作台', children: NAV.slice(0, 6) },
  { type: 'group' as const, label: 'AI 能力', children: NAV.slice(6, 9) },
  { type: 'group' as const, label: '其他', children: NAV.slice(9) },
];

interface AlertItem {
  id: string;
  title: string;
  dueAt: number | null;
  priority: 'low' | 'mid' | 'high';
  important: boolean;
  groupId: string;
  groupName: string;
  assignee: string | null;
  overdue: boolean;
  dueToday: boolean;
  read: boolean;
}

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const dark = useUIStore((s) => s.dark);
  const toggleDark = useUIStore((s) => s.toggleDark);
  const collapsed = useUIStore((s) => s.collapsed);
  const setCollapsed = useUIStore((s) => s.setCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const health = useHealth();
  const models = useModels();
  const modelId = useUIStore((s) => s.modelId);
  const setModelId = useUIStore((s) => s.setModelId);
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);
  const activeModel = models.find((m) => m.id === modelId) ?? models[0];

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const groups = useGroupStore((s) => s.groups);
  const activeId = useGroupStore((s) => s.activeId);
  const loaded = useGroupStore((s) => s.loaded);
  const activeGroup = groups.find((group) => group.id === activeId) ?? null;
  const otherOverdue = groups
    .filter((group) => group.id !== activeId)
    .reduce((sum, group) => sum + group.overdue, 0);

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const healthMeta = useMemo(() => {
    switch (health.mode) {
      case 'live':
        return { label: 'LIVE', color: 'green', tooltip: '已接入真实模型' };
      case 'mock':
        return { label: 'MOCK', color: 'orange', tooltip: '服务端没有配置 Key，当前走内置模拟' };
      case 'offline':
        return { label: 'OFFLINE', color: 'red', tooltip: '连不上 API 服务，先运行 npm run dev' };
      default:
        return { label: '…', color: 'default', tooltip: '正在检测服务状态' };
    }
  }, [health.mode]);

  const selectedKey = useMemo(() => {
    const match = NAV.find((item) => location.pathname.startsWith(item.key));
    return match?.key ?? '/overview';
  }, [location.pathname]);

  useEffect(() => {
    if (loaded && groups.length === 0) navigate('/groups', { replace: true });
  }, [loaded, groups.length, navigate]);

  useEffect(() => {
    if (!activeId) return;
    void useWorkspaceStore.getState().load(activeId);
    void useExpenseStore.getState().load(useExpenseStore.getState().month);
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    let alive = true;
    const load = async () => {
      try {
        const data = await api<{ items: AlertItem[]; unread: number }>('/alerts');
        if (!alive) return;
        setAlerts(data.items);
        setUnread(data.unread);
      } catch {
      }
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [activeId]);

  const markRead = async (ids: string[] | 'all') => {
    await api('/alerts/read', { method: 'POST', body: ids === 'all' ? { all: true } : { ids } });
    if (ids === 'all') {
      setAlerts((prev) => prev.map((item) => ({ ...item, read: true })));
      setUnread(0);
      return;
    }
    setAlerts((prev) => prev.map((item) => (ids.includes(item.id) ? { ...item, read: true } : item)));
    setUnread((prev) => Math.max(0, prev - ids.length));
  };

  const menu = (
    <Menu
      mode="inline"
      selectedKeys={[selectedKey]}
      items={MENU_ITEMS}
      onClick={({ key }) => {
        navigate(key);
        setDrawerOpen(false);
      }}
    />
  );

  const brand = (
    <div className="brand">
      <span className="brand-logo">组</span>
      {!collapsed && (
        <div className="brand-text">
          <span className="brand-name">小组工作台</span>
          <span className="brand-sub">{activeGroup?.name ?? '小组工作台'}</span>
        </div>
      )}
    </div>
  );

  const reminderContent = (
    <div className="reminder-pop">
      {alerts.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有需要提醒的任务" />
      ) : (
        <>
          <ul className="reminder-list">
            {alerts.map((item) => (
              <li
                key={item.id}
                className={item.read ? 'is-read' : ''}
                onClick={() => {
                  void markRead([item.id]);
                  navigate('/board');
                }}
              >
                <span className={item.read ? 'reminder-dot is-read' : item.overdue ? 'reminder-dot is-overdue' : 'reminder-dot'} />
                <span className="reminder-title">{item.title}</span>
                <span className="reminder-meta">
                  {item.groupName}
                  {item.dueAt ? ` · ${formatCst(item.dueAt)}` : ''}
                  {item.overdue ? ' 已逾期' : item.dueToday ? ' 今天' : ''}
                  {item.important ? ' · 重点' : ''}
                </span>
              </li>
            ))}
          </ul>
          {unread > 0 && (
            <button type="button" className="reminder-read-all" onClick={() => void markRead('all')}>
              全部标为已读
            </button>
          )}
        </>
      )}
    </div>
  );

  return (
    <Layout className="app-layout">
      {!isMobile && (
        <Sider
          width={228}
          collapsedWidth={72}
          collapsed={collapsed}
          theme={dark ? 'dark' : 'light'}
          className="app-sider"
        >
          {brand}
          {menu}
        </Sider>
      )}

      <Layout>
        <Header className="app-header">
          <Space size={10}>
            {isMobile ? (
              <Button
                type="text"
                icon={<MenuOutlined />}
                aria-label="打开导航"
                onClick={() => setDrawerOpen(true)}
              />
            ) : (
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                aria-label="折叠侧边栏"
                onClick={() => setCollapsed(!collapsed)}
              />
            )}
            <Typography.Text strong className="header-title">
              {NAV.find((item) => item.key === selectedKey)?.label}
            </Typography.Text>

            <Button
              size="small"
              className="group-switch-btn"
              aria-label="切换小组"
              onClick={() => setSwitcherOpen(true)}
            >
              <TeamOutlined />
              <span className="group-switch-name">{activeGroup?.name ?? '选择小组'}</span>
              {otherOverdue > 0 && <span className="group-other-dot" title="其他小组有逾期任务" />}
              <DownOutlined className="group-switch-caret" />
            </Button>
          </Space>

          <Space size={8}>
            <Popover
              trigger="click"
              placement="bottomRight"
              title="今天到期与逾期"
              content={reminderContent}
              arrow={false}
            >
              <Badge count={unread} size="small" offset={[-2, 4]}>
                <Button size="small" type="text" aria-label="任务提醒" icon={<BellOutlined />} />
              </Badge>
            </Popover>

            <span className="header-extra">
            <Tooltip title={SHORTCUT_LABEL + ' 打开命令面板'}>
              <Button
                size="small"
                type="text"
                icon={<SearchOutlined />}
                onClick={() => setPaletteOpen(true)}
              >
                <span className="palette-kbd">{SHORTCUT_LABEL}</span>
              </Button>
            </Tooltip>

            <Select
              size="small"
              aria-label="选择模型"
              className="model-select"
              value={activeModel?.id}
              onChange={setModelId}
              placeholder="选择模型"
              popupMatchSelectWidth={false}
              options={models.map((m) => ({ value: m.id, label: m.label, model: m }))}
              optionRender={(option) => {
                const model = (option.data as { model?: ModelOption }).model;
                if (!model) return option.label;
                return (
                  <span className="model-option">
                    <span className="model-dot" data-free={model.free} />
                    {model.label}
                    {model.free ? <em>免费额度</em> : null}
                  </span>
                );
              }}
              style={{ width: isMobile ? 118 : 174 }}
              dropdownRender={(menuNode) => (
                <>
                  {menuNode}
                  {!models.some((m) => m.free) && (
                    <div className="model-hint">配置任一 Key 后，这里会出现对应模型</div>
                  )}
                </>
              )}
            />

            <Tooltip title={healthMeta.tooltip}>
              <Tag className="health-tag" color={healthMeta.color}>
                {healthMeta.label}
              </Tag>
            </Tooltip>

            <Tooltip title="GitHub">
              <Button
                size="small"
                type="text"
                aria-label="GitHub"
                icon={<GithubOutlined />}
                onClick={() => window.open('https://github.com/mobai02/ai-console', '_blank', 'noopener')}
              />
            </Tooltip>
            </span>

            <Tooltip title={healthMeta.tooltip}>
              <span
                className="health-dot"
                style={{ background: HEALTH_DOT[healthMeta.color] ?? '#c4ccd8' }}
              />
            </Tooltip>

            <Tooltip title={dark ? '切到浅色' : '切到深色'}>
              <Button
                size="small"
                type="text"
                aria-label="切换主题"
                icon={dark ? <BulbFilled /> : <BulbOutlined />}
                onClick={toggleDark}
              />
            </Tooltip>

            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  {
                    key: 'name',
                    label: `${user?.displayName ?? '未登录'}（${user?.username ?? '-'}）`,
                    disabled: true,
                  },
                  { type: 'divider' },
                  { key: 'groups', icon: <SwapOutlined />, label: '切换 / 加入小组' },
                  {
                    key: 'model',
                    icon: <ExperimentOutlined />,
                    label: `模型（${activeModel?.label ?? '-'}）`,
                    children: models.map((model) => ({
                      key: `model:${model.id}`,
                      label: model.label,
                    })),
                  },
                  {
                    key: 'theme',
                    icon: dark ? <BulbFilled /> : <BulbOutlined />,
                    label: dark ? '切到浅色' : '切到深色',
                  },
                  { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
                ],
                onClick: ({ key }) => {
                  if (key === 'groups') navigate('/groups');
                  if (key === 'theme') toggleDark();
                  if (key.startsWith('model:')) setModelId(key.slice(6));
                  if (key === 'logout') {
                    void logout().then(() => navigate('/login', { replace: true }));
                  }
                },
              }}
            >
              <Avatar size={26} className="user-avatar">
                {user?.displayName?.slice(0, 1) ?? '?'}
              </Avatar>
            </Dropdown>
          </Space>
        </Header>

        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>

      <CommandPalette />
      <GroupSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
      <FloatingBall />

      <Drawer
        open={drawerOpen}
        placement="left"
        width={248}
        onClose={() => setDrawerOpen(false)}
        title={brand}
        styles={{ body: { padding: 0 } }}
      >
        {menu}
      </Drawer>
    </Layout>
  );
}
