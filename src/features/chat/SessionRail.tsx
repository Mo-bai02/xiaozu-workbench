import { useState } from 'react';
import { Button, Dropdown, Empty, Input, Modal, Tooltip, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, MessageOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { useSessionStore } from '@/store/sessions';

interface Props {
  /** 流式生成中禁止切换，避免把正在写的消息丢掉 */
  disabled: boolean;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

function timeLabel(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function SessionRail({ disabled, onSwitch, onNew, onDelete }: Props) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeId);
  const rename = useSessionStore((s) => s.rename);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);

  return (
    <div className="session-rail">
      <div className="rail-head">
        <Typography.Text strong>会话</Typography.Text>
        <Tooltip title="新建会话">
          <Button size="small" type="text" icon={<PlusOutlined />} onClick={onNew} disabled={disabled} />
        </Tooltip>
      </div>

      <div className="rail-list">
        {sessions.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有会话" />
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              role="button"
              tabIndex={0}
              className={session.id === activeId ? 'rail-item is-active' : 'rail-item'}
              onClick={() => !disabled && onSwitch(session.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !disabled) onSwitch(session.id);
              }}
            >
              <MessageOutlined className="rail-icon" />
              <span className="rail-title">{session.title}</span>
              <span className="rail-time">{timeLabel(session.updatedAt)}</span>
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    { key: 'rename', icon: <EditOutlined />, label: '重命名' },
                    { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true },
                  ],
                  onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation();
                    if (key === 'rename') setRenaming({ id: session.id, title: session.title });
                    if (key === 'delete') onDelete(session.id);
                  },
                }}
              >
                <button
                  type="button"
                  className="rail-more"
                  aria-label="会话操作"
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreOutlined />
                </button>
              </Dropdown>
            </div>
          ))
        )}
      </div>

      <div className="rail-foot">
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          存在浏览器本地，换设备看不到
        </Typography.Text>
      </div>

      <Modal
        open={Boolean(renaming)}
        title="重命名会话"
        okText="保存"
        cancelText="取消"
        onCancel={() => setRenaming(null)}
        onOk={() => {
          if (renaming) rename(renaming.id, renaming.title);
          setRenaming(null);
        }}
      >
        <Input
          value={renaming?.title ?? ''}
          maxLength={30}
          showCount
          autoFocus
          onChange={(event) =>
            setRenaming((prev) => (prev ? { ...prev, title: event.target.value } : prev))
          }
          onPressEnter={() => {
            if (renaming) rename(renaming.id, renaming.title);
            setRenaming(null);
          }}
        />
      </Modal>
    </div>
  );
}
