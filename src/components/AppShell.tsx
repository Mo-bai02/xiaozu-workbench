import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Drawer, Grid, Layout, Menu, Select, Space, Tag, Tooltip, Typography } from 'antd';
import {
  BulbFilled,
  BulbOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  WalletOutlined,
  ClockCircleOutlined,
  GithubOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  SearchOutlined,
  MessageOutlined,
  ProjectOutlined,
  SettingOutlined,
  TableOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { env } from '@/env';
import { CommandPalette, SHORTCUT_LABEL } from '@/components/CommandPalette';
import { FloatingBall } from '@/components/FloatingBall';
import { useHealth } from '@/lib/health';
import { useModels, type ModelOption } from '@/lib/models';
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

const MENU_ITEMS = [
  { type: 'group' as const, label: '工作台', children: NAV.slice(0, 6) },
  { type: 'group' as const, label: 'AI 能力', children: NAV.slice(6, 9) },
  { type: 'group' as const, label: '其他', children: NAV.slice(9) },
];

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

  const selectedKey = useMemo(() => {
    const match = NAV.find((item) => location.pathname.startsWith(item.key));
    return match?.key ?? '/overview';
  }, [location.pathname]);

  const menu = (
    <Menu
      mode="inline"
      selectedKeys={[selectedKey]}
      items={MENU_ITEMS}
      onClick={({ key }) => {
        navigate(key);
        setDrawerOpen(false);
      }}
      style={{ borderInlineEnd: 'none', background: 'transparent' }}
    />
  );

  const brand = (
    <div className="brand">
      <span className="brand-mark">AI</span>
      <div className="brand-text">
        <Typography.Text strong>{env.appTitle}</Typography.Text>
        <span className="brand-sub">流式 · 生成式 · 可观测</span>
      </div>
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
          </Space>

          <Space size={8}>
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
              dropdownRender={(menu) => (
                <>
                  {menu}
                  {!models.some((m) => m.free) && (
                    <div className="model-hint">配置任一 Key 后，这里会出现对应模型</div>
                  )}
                </>
              )}
            />
            <Tooltip
              title={
                health.mode === 'live'
                  ? '已连接模型服务'
                  : health.mode === 'mock'
                    ? '服务端未配置 API Key，当前走内置 mock'
                    : health.mode === 'offline'
                      ? '连不上 API 服务，请先运行 npm run dev'
                      : '正在检测服务状态'
              }
            >
              <Tag
                color={health.mode === 'live' ? 'green' : health.mode === 'mock' ? 'gold' : 'red'}
                className="status-tag"
              >
                {health.mode === 'live' ? 'LIVE' : health.mode === 'mock' ? 'MOCK' : 'OFFLINE'}
              </Tag>
            </Tooltip>
            <Tooltip title={dark ? '切换到浅色' : '切换到深色'}>
              <Button
                type="text"
                aria-label="切换主题"
                icon={dark ? <BulbFilled /> : <BulbOutlined />}
                onClick={toggleDark}
              />
            </Tooltip>
            <Tooltip title="源码">
              <Button
                type="text"
                aria-label="GitHub"
                icon={<GithubOutlined />}
                href="https://github.com/mobai02/ai-console"
                target="_blank"
                rel="noreferrer"
              />
            </Tooltip>
          </Space>
        </Header>

        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>

      <CommandPalette />
      <FloatingBall />

      <Drawer
        open={drawerOpen}
        placement="left"
        width={240}
        onClose={() => setDrawerOpen(false)}
        title={brand}
        styles={{ body: { padding: 8 } }}
      >
        {menu}
      </Drawer>
    </Layout>
  );
}
