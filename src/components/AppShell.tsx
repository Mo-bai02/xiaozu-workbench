import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Drawer, Grid, Layout, Menu, Space, Tag, Tooltip, Typography } from 'antd';
import {
  BulbFilled,
  BulbOutlined,
  ExperimentOutlined,
  GithubOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { env } from '@/env';
import { useHealth } from '@/lib/health';
import { useUIStore } from '@/store/ui';

const { Header, Sider, Content } = Layout;

const NAV = [
  { key: '/chat', icon: <MessageOutlined />, label: '流式对话' },
  { key: '/generator', icon: <ExperimentOutlined />, label: '生成式 UI' },
  { key: '/logs', icon: <TableOutlined />, label: '调用日志' },
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

  const selectedKey = useMemo(() => {
    const match = NAV.find((item) => location.pathname.startsWith(item.key));
    return match?.key ?? '/chat';
  }, [location.pathname]);

  const menu = (
    <Menu
      mode="inline"
      selectedKeys={[selectedKey]}
      items={NAV}
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
            <Tooltip
              title={
                health.mode === 'live'
                  ? `已接入真实模型：${health.model ?? ''}`
                  : health.mode === 'mock'
                    ? '服务端未配置 LLM_API_KEY，当前走内置 mock'
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
