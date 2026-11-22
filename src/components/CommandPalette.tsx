import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Empty, Input, Modal, Tag, Typography } from 'antd';
import {
  DashboardOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  MessageOutlined,
  PlusOutlined,
  ProjectOutlined,
  SettingOutlined,
  SwapOutlined,
  TableOutlined,
  TeamOutlined,
  WalletOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '@/store/ui';
import { useNotesStore } from '@/features/notes/store';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const SHORTCUT_LABEL = isMac ? '⌘K' : 'Ctrl K';

interface Command {
  id: string;
  title: string;
  hint?: string;
  group: '页面' | '操作';
  icon: React.ReactNode;
  run: () => void;
}

/** 纯函数，方便单测：按标题/提示做不区分大小写的包含匹配，前缀命中排前面 */
export function filterCommands(commands: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  return commands
    .filter((cmd) => {
      const haystack = `${cmd.title} ${cmd.hint ?? ''}`.toLowerCase();
      return haystack.includes(q);
    })
    .sort((a, b) => {
      const aStarts = a.title.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.title.toLowerCase().startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.title.length - b.title.length;
    });
}

export function CommandPalette() {
  const navigate = useNavigate();
  const toggleDark = useUIStore((s) => s.toggleDark);
  const createNote = useNotesStore((s) => s.create);
  const open = useUIStore((s) => s.paletteOpen);
  const setOpen = useUIStore((s) => s.setPaletteOpen);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }, [setOpen]);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      navigate(path);
      close();
    };
    return [
      { id: 'overview', title: '项目概览', group: '页面', icon: <DashboardOutlined />, run: go('/overview') },
      { id: 'board', title: '任务看板', group: '页面', icon: <ProjectOutlined />, run: go('/board') },
      { id: 'members', title: '成员管理', group: '页面', icon: <TeamOutlined />, run: go('/members') },
      { id: 'notes', title: '笔记', group: '页面', icon: <FileTextOutlined />, run: go('/notes') },
      { id: 'expenses', title: '经费账本', group: '页面', icon: <WalletOutlined />, run: go('/expenses') },
      { id: 'focus', title: '专注计时', group: '页面', icon: <ClockCircleOutlined />, run: go('/focus') },
      { id: 'chat', title: '智能助手', group: '页面', icon: <MessageOutlined />, run: go('/chat') },
      { id: 'generator', title: '表单生成', group: '页面', icon: <ExperimentOutlined />, run: go('/generator') },
      { id: 'logs', title: 'AI 调用记录', group: '页面', icon: <TableOutlined />, run: go('/logs') },
      { id: 'settings', title: '设置与数据', group: '页面', icon: <SettingOutlined />, run: go('/settings') },
      {
        id: 'new-note',
        title: '新建笔记',
        hint: '创建后跳到笔记页',
        group: '操作',
        icon: <PlusOutlined />,
        run: () => {
          createNote();
          navigate('/notes');
          close();
        },
      },
      {
        id: 'new-task',
        title: '新建任务',
        hint: '打开看板',
        group: '操作',
        icon: <PlusOutlined />,
        run: go('/board'),
      },
      {
        id: 'theme',
        title: '切换深浅色主题',
        hint: '当前设置会记住',
        group: '操作',
        icon: <SwapOutlined />,
        run: () => {
          toggleDark();
          close();
        },
      },
    ];
  }, [close, createNote, navigate, toggleDark]);

  const results = useMemo(() => filterCommands(commands, query), [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // ?palette=1 直接打开，方便演示和截图
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('palette') === '1') setOpen(true);
  }, [setOpen]);

  // 全局快捷键：Ctrl/Cmd + K
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(!useUIStore.getState().paletteOpen);
        setQuery('');
        setActiveIndex(0);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setOpen]);

  const onListKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      results[activeIndex]?.run();
    }
  };

  return (
    <>
      <Modal
        open={open}
        onCancel={close}
        footer={null}
        closable={false}
        width={560}
        styles={{ body: { padding: 0 } }}
        destroyOnClose
      >
        <div className="palette">
          <Input
            ref={inputRef as never}
            autoFocus
            variant="borderless"
            size="large"
            placeholder="搜索页面或操作…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onListKeyDown}
            className="palette-input"
            prefix={<span className="palette-prefix">›</span>}
          />

          <div className="palette-list">
            {results.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的项" />
            ) : (
              results.map((cmd, index) => (
                <button
                  key={cmd.id}
                  type="button"
                  className={index === activeIndex ? 'palette-item is-active' : 'palette-item'}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={cmd.run}
                >
                  <span className="palette-icon">{cmd.icon}</span>
                  <span className="palette-title">{cmd.title}</span>
                  {cmd.hint && <span className="palette-hint">{cmd.hint}</span>}
                  <Tag bordered={false} className="palette-group">
                    {cmd.group}
                  </Tag>
                </button>
              ))
            )}
          </div>

          <div className="palette-foot">
            <Typography.Text type="secondary">↑↓ 选择 · Enter 执行 · Esc 关闭</Typography.Text>
            <Typography.Text type="secondary">{SHORTCUT_LABEL}</Typography.Text>
          </div>
        </div>
      </Modal>
    </>
  );
}
