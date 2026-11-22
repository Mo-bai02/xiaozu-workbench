import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Empty,
  Input,
  Popconfirm,
  Modal,
  Segmented,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  DeleteOutlined,
  DownloadOutlined,
  PushpinFilled,
  PushpinOutlined,
  PlusOutlined,
  RobotOutlined,
  ShareAltOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Markdown } from '@/components/Markdown';
import { createShare, revokeShare } from '@/lib/api';
import { cn } from '@/lib/utils';
import { filterNotes, useNotesStore, type Note } from './store';


function excerpt(content: string, max = 56): string {
  const text = content
    .replace(/^[#>*\-\s]+/gm, '')
    .replace(/[*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, max) || '空白笔记';
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function NotesPage() {
  const navigate = useNavigate();
  const { notes, shareIds, load, update, create, togglePin, remove, setShareId } = useNotesStore();
  const [keyword, setKeyword] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [shareTarget, setShareTarget] = useState<Note | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState('');

  useEffect(() => {
    void load();
  }, [load]);

  const tags = useMemo(() => {
    const map = new Map<string, number>();
    for (const note of notes) for (const t of note.tags) map.set(t, (map.get(t) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [notes]);

  const visible = useMemo(() => filterNotes(notes, { keyword, tag }), [notes, keyword, tag]);

  const active: Note | undefined = notes.find((note) => note.id === activeId) ?? visible[0];

  // 输入即预览；停止输入 600ms 后写盘，避免每个字符都打 localStorage
  const [draft, setDraft] = useState<{ title: string; content: string }>({ title: '', content: '' });

  useEffect(() => {
    if (!active) return;
    setDraft({ title: active.title, content: active.content });
  }, [active?.id]);

  useEffect(() => {
    if (!active) return;
    if (draft.title === active.title && draft.content === active.content) return;
    const timer = window.setTimeout(() => {
      update(active.id, { title: draft.title, content: draft.content });
      setSavedAt(Date.now());
    }, 600);
    return () => window.clearTimeout(timer);
  }, [draft, active, update]);

  const addNote = async () => {
    const id = await create();
    setActiveId(id);
    setMode('edit');
  };

  const exportNote = () => {
    if (!active) return;
    const blob = new Blob(
      [`# ${active.title}\n\n> 更新于 ${new Date(active.updatedAt).toLocaleString('zh-CN')}\n\n${active.content}\n`],
      { type: 'text/markdown;charset=utf-8' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${active.title.replace(/[\\/:*?"<>|]/g, '_') || '笔记'}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const openShare = async () => {
    if (!active) return;
    setShareTarget(active);
    setShareError('');
    const existing = shareIds[active.id];
    if (existing) {
      setShareUrl(`${window.location.origin}/share/${existing}`);
      return;
    }
    setShareUrl('');
    setSharing(true);
    try {
      const id = await createShare({ title: active.title, content: active.content });
      setShareId(active.id, id);
      setShareUrl(`${window.location.origin}/share/${id}`);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : String(error));
    } finally {
      setSharing(false);
    }
  };

  const revoke = async () => {
    if (!shareTarget) return;
    const existing = shareIds[shareTarget.id];
    if (!existing) return;
    await revokeShare(existing);
    setShareId(shareTarget.id, undefined);
    setShareUrl('');
  };

  const summarize = () => {
    if (!active) return;
    const prompt = `请把下面这条笔记整理成会议纪要：提炼结论、待办事项（带负责人）、风险点。原文：\n\n${active.title}\n${active.content}`;
    navigate(`/chat?ask=${encodeURIComponent(prompt)}`);
  };

  return (
    <div className="page">
      <div className="page-head row-between">
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            笔记
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            支持 Markdown，停止输入自动保存。
          </Typography.Paragraph>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={addNote}>
          新建笔记
        </Button>
      </div>

      <div className="notes-layout">
        <Card size="small" className="panel notes-list">
          <Input.Search
            allowClear
            placeholder="搜索标题 / 正文 / 标签"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            style={{ marginBottom: 10 }}
          />

          {tags.length > 0 && (
            <Space size={4} wrap style={{ marginBottom: 10 }}>
              <Tag.CheckableTag checked={tag === null} onChange={() => setTag(null)}>
                全部
              </Tag.CheckableTag>
              {tags.map(([name, count]) => (
                <Tag.CheckableTag key={name} checked={tag === name} onChange={() => setTag(name)}>
                  #{name} {count}
                </Tag.CheckableTag>
              ))}
            </Space>
          )}

          <div className="note-items">
            {visible.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的笔记" />
            ) : (
              visible.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  className={cn('note-item', note.id === active?.id && 'is-active')}
                  onClick={() => setActiveId(note.id)}
                >
                  <div className="note-item-top">
                    {note.pinned && <PushpinFilled className="pin" />}
                    <span className="note-item-title">{note.title || '未命名笔记'}</span>
                    <span className="note-item-time">{formatTime(note.updatedAt)}</span>
                  </div>
                  <div className="note-item-excerpt">{excerpt(note.content)}</div>
                  {note.tags.length > 0 && (
                    <div className="note-item-tags">
                      {note.tags.map((t) => (
                        <Tag key={t} bordered={false} style={{ fontSize: 10 }}>
                          #{t}
                        </Tag>
                      ))}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </Card>

        <Card size="small" className="panel notes-editor">
          {!active ? (
            <Empty description="左侧选一条笔记，或新建一条" style={{ padding: '60px 0' }} />
          ) : (
            <>
              <div className="note-toolbar">
                <Input
                  value={draft.title}
                  onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="标题"
                  variant="borderless"
                  className="note-title-input"
                  maxLength={60}
                />
                <Space size={4}>
                  <span className="save-hint">
                    {savedAt ? <><SaveOutlined /> 已保存</> : null}
                  </span>
                  <Segmented
                    size="small"
                    value={mode}
                    onChange={(value) => setMode(value as 'edit' | 'preview')}
                    options={[
                      { label: '编辑', value: 'edit' },
                      { label: '预览', value: 'preview' },
                    ]}
                  />
                  <Tooltip title={active.pinned ? '取消置顶' : '置顶'}>
                    <Button
                      size="small"
                      type="text"
                      icon={active.pinned ? <PushpinFilled /> : <PushpinOutlined />}
                      onClick={() => togglePin(active.id)}
                    />
                  </Tooltip>
                  <Tooltip title={shareIds[active.id] ? '管理分享链接' : '分享这条笔记'}>
                    <Button
                      size="small"
                      type="text"
                      icon={<ShareAltOutlined />}
                      onClick={() => void openShare()}
                    />
                  </Tooltip>
                  <Tooltip title="导出 Markdown">
                    <Button size="small" type="text" icon={<DownloadOutlined />} onClick={exportNote} />
                  </Tooltip>
                  <Tooltip title="让 AI 整理成会议纪要">
                    <Button size="small" type="text" icon={<RobotOutlined />} onClick={summarize} />
                  </Tooltip>
                  <Popconfirm
                    title="删除这条笔记？"
                    okText="删除"
                    cancelText="取消"
                    onConfirm={() => {
                      remove(active.id);
                      setActiveId(null);
                    }}
                  >
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              </div>

              {mode === 'edit' ? (
                <Input.TextArea
                  value={draft.content}
                  onChange={(event) => setDraft((prev) => ({ ...prev, content: event.target.value }))}
                  placeholder="支持 Markdown，用 #标签 归类"
                  autoSize={{ minRows: 16, maxRows: 30 }}
                  className="note-body-input"
                />
              ) : (
                <div className="note-preview">
                  <Markdown source={draft.content || '_（空白）_'} />
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <Modal
        open={Boolean(shareTarget)}
        title="分享这条笔记"
        onCancel={() => setShareTarget(null)}
        footer={
          <Space>
            {shareUrl && (
              <Button danger onClick={() => void revoke()}>
                撤销分享
              </Button>
            )}
            <Button type="primary" onClick={() => setShareTarget(null)}>
              完成
            </Button>
          </Space>
        }
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          生成只读链接，撤销后立即失效。
        </Typography.Paragraph>

        {sharing && <Typography.Text type="secondary">正在生成链接…</Typography.Text>}
        {shareError && <Typography.Text type="danger">{shareError}</Typography.Text>}

        {shareUrl && (
          <Space.Compact style={{ width: '100%', marginTop: 8 }}>
            <Input readOnly value={shareUrl} />
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(shareUrl).catch(() => undefined);
              }}
            >
              复制
            </Button>
          </Space.Compact>
        )}
      </Modal>
    </div>
  );
}
