import { useEffect, useMemo, useState } from 'react';
import { Modal, Typography } from 'antd';
import { CheckOutlined, PlusOutlined, SearchOutlined, TeamOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useGroupStore } from '@/store/group';
import { groupLight } from '@/features/groups/GroupsPage';

export function GroupSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const groups = useGroupStore((s) => s.groups);
  const activeId = useGroupStore((s) => s.activeId);
  const setActive = useGroupStore((s) => s.setActive);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((group) => group.name.toLowerCase().includes(q));
  }, [groups, query]);

  const choose = (id: string) => {
    setActive(id);
    onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = filtered[index];
      if (target) choose(target.id);
    }
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} closable={false} width={480} styles={{ body: { padding: 0 } }}>
      <div className="switcher">
        <div className="switcher-head">
          <SearchOutlined className="switcher-search-icon" />
          <input
            autoFocus
            className="switcher-input"
            placeholder="切换小组…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>

        <div className="switcher-list">
          {filtered.length === 0 ? (
            <div className="switcher-empty">没有匹配的小组</div>
          ) : (
            filtered.map((group, i) => {
              const light = groupLight(group);
              return (
                <button
                  key={group.id}
                  type="button"
                  className={i === index ? 'switcher-item is-active' : 'switcher-item'}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => choose(group.id)}
                >
                  <span className="group-avatar switcher-avatar">
                    <TeamOutlined />
                  </span>
                  <span className="switcher-main">
                    <span className="switcher-name">
                      {group.name}
                      {group.id === activeId && <CheckOutlined className="switcher-check" />}
                    </span>
                    <span className="switcher-sub">
                      <i className="group-light" style={{ background: light.color }} />
                      {light.label} · {group.memberCount} 人
                    </span>
                  </span>
                  <span className="switcher-count">{group.openTasks}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="switcher-foot">
          <button
            type="button"
            className="switcher-action"
            onClick={() => {
              onClose();
              navigate('/groups');
            }}
          >
            <PlusOutlined /> 创建或加入小组
          </button>
          <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>
            ↑↓ 选择 · Enter 切换 · Esc 关闭
          </Typography.Text>
        </div>
      </div>
    </Modal>
  );
}
