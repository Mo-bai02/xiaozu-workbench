import { useMemo, useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  DatePicker,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  DeleteOutlined,
  DragOutlined,
  MoreOutlined,
  PlusOutlined,
  RobotOutlined,
  StarOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from './store';
import type { Priority, Task, TaskStatus } from './types';

type ColumnKey = 'todo' | 'overdue' | 'done';

const COLUMNS: Array<{ key: ColumnKey; label: string; color: string }> = [
  { key: 'todo', label: '待办', color: '#d4a72c' },
  { key: 'done', label: '已完成', color: '#0f9d58' },
  { key: 'overdue', label: '逾期', color: '#e5484d' },
];

function columnOf(task: Task): ColumnKey {
  if (task.status === 'done') return 'done';
  if (task.dueAt !== null && task.dueAt < Date.now()) return 'overdue';
  return 'todo';
}

const DAY = 86_400_000;

function dueTone(task: Task): 'overdue' | 'soon' | 'normal' {
  if (!task.dueAt || task.status === 'done') return 'normal';
  const diff = task.dueAt - Date.now();
  if (diff < 0) return 'overdue';
  if (diff < 2 * DAY) return 'soon';
  return 'normal';
}

export function BoardPage() {
  const navigate = useNavigate();
  const { tasks, members, moveTask, addTask, updateTask, removeTask } = useWorkspaceStore();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<ColumnKey | null>(null);
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<'all' | 'urgent' | 'important'>('all');
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const [form] = Form.useForm();

  const memberName = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m.displayName])),
    [members],
  );

  const filtered = useMemo(() => {
    const lower = keyword.trim().toLowerCase();
    return tasks.filter((task) => {
      if (filter === 'urgent' && task.priority !== 'high') return false;
      if (filter === 'important' && !task.important) return false;
      if (!lower) return true;
      return task.title.toLowerCase().includes(lower) || task.description.toLowerCase().includes(lower);
    });
  }, [tasks, keyword, filter]);

  const columns = COLUMNS.map((column) => ({
    ...column,
    items: filtered.filter((task) => columnOf(task) === column.key),
  }));

  const openNew = (column: ColumnKey) => {
    setEditing('new');
    form.setFieldsValue({
      title: '',
      desc: '',
      status: column === 'done' ? 'done' : 'todo',
      urgent: false,
      important: false,
      assigneeId: null,
      dueAt: column === 'overdue' ? dayjs().subtract(1, 'day') : null,
    });
  };

  const openEdit = (task: Task) => {
    setEditing(task);
    const assigneeExists = members.some((member) => member.id === task.assigneeId);
    form.setFieldsValue({
      title: task.title,
      desc: task.description,
      status: task.status,
      urgent: task.priority === 'high',
      important: task.important,
      assigneeId: assigneeExists ? task.assigneeId : null,
      dueAt: task.dueAt ? dayjs(task.dueAt) : null,
    });
  };

  const submit = async () => {
    const values = await form.validateFields();
    const payload = {
      title: values.title.trim(),
      description: values.desc ?? '',
      status: values.status as TaskStatus,
      priority: (values.urgent ? 'high' : 'mid') as Priority,
      important: Boolean(values.important),
      assigneeId: values.assigneeId ?? null,
      dueAt: values.dueAt ? (values.dueAt as dayjs.Dayjs).valueOf() : null,
    };
    if (editing === 'new') addTask(payload);
    else if (editing) updateTask(editing.id, payload);
    setEditing(null);
  };

  const askSplit = (task: Task) => {
    const prompt = `请把任务「${task.title}」拆解成 3-5 个子任务，每个子任务给出：一句话描述 + 验收标准。用 Markdown 列表输出。`;
    navigate(`/chat?ask=${encodeURIComponent(prompt)}`);
  };

  return (
    <div className="page">
      <div className="page-head row-between">
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            任务看板
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            拖动卡片换列，点击卡片编辑。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Input.Search
            allowClear
            placeholder="搜索任务"
            style={{ width: 200 }}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <Segmented
            size="small"
            value={filter}
            onChange={(value) => setFilter(value as typeof filter)}
            options={[
              { label: '全部', value: 'all' },
              { label: '紧急', value: 'urgent' },
              { label: '重点', value: 'important' },
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openNew('todo')}>
            新建任务
          </Button>
        </Space>
      </div>

      <div className="board">
        {columns.map((column) => (
          <div
            key={column.key}
            className={cn('board-column', overColumn === column.key && 'is-over')}
            onDragOver={(event) => {
              event.preventDefault();
              setOverColumn(column.key);
            }}
            onDragLeave={() => setOverColumn((prev) => (prev === column.key ? null : prev))}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData('text/plain') || draggingId;
              if (id) moveTask(id, column.key);
              setDraggingId(null);
              setOverColumn(null);
            }}
          >
            <div className="board-head">
              <Space size={6}>
                <Badge color={column.color} />
                <span className="board-title">{column.label}</span>
                <span className="board-count">{column.items.length}</span>
              </Space>
              <Tooltip title="在此列新建">
                <Button size="small" type="text" icon={<PlusOutlined />} onClick={() => openNew(column.key)} />
              </Tooltip>
            </div>

            <div className="board-list">
              {column.items.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="拖到这里" />
              ) : (
                column.items.map((task) => (
                  <Card
                    key={task.id}
                    size="small"
                    className={cn('task-card', draggingId === task.id && 'is-dragging')}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', task.id);
                      event.dataTransfer.effectAllowed = 'move';
                      setDraggingId(task.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setOverColumn(null);
                    }}
                    onClick={() => openEdit(task)}
                  >
                    <div className="task-top">
                      <span className={cn('task-title', task.status === 'done' && 'is-done')}>
                        {task.important && <span className="task-star">★</span>}
                        {task.title}
                      </span>
                      <Dropdown
                        trigger={['click']}
                        menu={{
                          items: [
                            {
                              key: 'important',
                              icon: <StarOutlined />,
                              label: task.important ? '取消重点' : '标记重点',
                            },
                            { key: 'split', icon: <RobotOutlined />, label: '让 AI 拆解' },
                            { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true },
                          ],
                          onClick: ({ key, domEvent }) => {
                            domEvent.stopPropagation();
                            if (key === 'important') {
                              void updateTask(task.id, { important: !task.important });
                            }
                            if (key === 'split') askSplit(task);
                            if (key === 'delete') removeTask(task.id);
                          },
                        }}
                      >
                        <Button
                          size="small"
                          type="text"
                          icon={<MoreOutlined />}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </Dropdown>
                    </div>

                    {task.description && <p className="task-desc">{task.description}</p>}

                    <div className="task-meta">
                      {task.priority === 'high' && <Tag color="red">紧急</Tag>}
                      {task.important && <Tag color="gold">重点</Tag>}
                      {task.tags.map((tag) => (
                        <Tag key={tag} bordered={false}>
                          {tag}
                        </Tag>
                      ))}
                      {task.dueAt && (
                        <span className={cn('task-due', `is-${dueTone(task)}`)}>
                          {new Date(task.dueAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                        </span>
                      )}
                      <span className="task-assignee">
                        {task.assigneeId ? (
                          <Avatar size={20} style={{ background: 'var(--accent)', fontSize: 10 }}>
                            {memberName[task.assigneeId]?.slice(0, 1) ?? '?'}
                          </Avatar>
                        ) : (
                          <span className="unassigned">未指派</span>
                        )}
                      </span>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      <Drawer
        open={editing !== null}
        width={460}
        title={editing === 'new' ? '新建任务' : '编辑任务'}
        onClose={() => setEditing(null)}
        extra={
          <Space>
            {editing !== 'new' && editing && (
              <Popconfirm
                title="删除这个任务？"
                okText="删除"
                cancelText="取消"
                onConfirm={() => {
                  removeTask(editing.id);
                  setEditing(null);
                }}
              >
                <Button danger icon={<DeleteOutlined />} />
              </Popconfirm>
            )}
            <Button type="primary" onClick={() => void submit()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入任务标题' }]}>
            <Input maxLength={60} showCount />
          </Form.Item>
          <Form.Item name="desc" label="描述">
            <Input.TextArea rows={3} maxLength={200} showCount />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { value: 'todo', label: '待办' },
                { value: 'done', label: '已完成' },
              ]}
            />
          </Form.Item>
          <Form.Item name="urgent" label="紧急" valuePropName="checked" extra="红色标记，会进提醒">
            <Switch />
          </Form.Item>
          <Form.Item name="important" label="重点" valuePropName="checked" extra="黄色标记，长期跟进">
            <Switch />
          </Form.Item>
          <Form.Item name="assigneeId" label="负责人">
            <Select
              allowClear
              placeholder="未指派"
              options={members.map((m) => ({ value: m.id, label: m.displayName }))}
            />
          </Form.Item>
          <Form.Item name="dueAt" label="截止日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>

        {editing !== 'new' && editing && (
          <Button block icon={<RobotOutlined />} onClick={() => askSplit(editing)}>
            让 AI 拆解这个任务
          </Button>
        )}

        <div className="drawer-hint">
          <DragOutlined /> 移动端可用上方「状态」改列。
        </div>
      </Drawer>
    </div>
  );
}
