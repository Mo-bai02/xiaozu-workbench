import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioOutlined,
  BulbOutlined,
  FileTextOutlined,
  SearchOutlined,
  ThunderboltFilled,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useNotesStore } from '@/features/notes/store';
import { useUIStore } from '@/store/ui';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'ai-console:fab';
// 4px 以内算点击，超过算拖拽
const SIZE = 54;
const MARGIN = 12;

interface Point {
  x: number;
  y: number;
}

function clamp(point: Point): Point {
  const maxX = window.innerWidth - SIZE - MARGIN;
  const maxY = window.innerHeight - SIZE - MARGIN;
  return {
    x: Math.min(Math.max(MARGIN, point.x), Math.max(MARGIN, maxX)),
    y: Math.min(Math.max(MARGIN, point.y), Math.max(MARGIN, maxY)),
  };
}

function loadPoint(): Point {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Point;
      if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) return clamp(parsed);
    }
  } catch {
  }
  return clamp({ x: window.innerWidth - SIZE - 24, y: window.innerHeight - SIZE - 96 });
}

export function FloatingBall() {
  const navigate = useNavigate();
  const createNote = useNotesStore((s) => s.create);
  const toggleDark = useUIStore((s) => s.toggleDark);
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);

  const [point, setPoint] = useState<Point | null>(null);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const dragRef = useRef<{ startX: number; startY: number; origin: Point; moved: boolean } | null>(null);

  useEffect(() => {
    setPoint(loadPoint());
    const onResize = () => {
      setPoint((prev) => {
        if (!prev) return prev;
        const clamped = clamp(prev);
        const snapLeft = clamped.x + SIZE / 2 < window.innerWidth / 2;
        const snapped = clamp({
          x: snapLeft ? MARGIN + 8 : window.innerWidth - SIZE - MARGIN - 8,
          y: clamped.y,
        });
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(snapped));
        } catch {
        }
        return snapped;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!point) return;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
      }
      dragRef.current = { startX: event.clientX, startY: event.clientY, origin: point, moved: false };
      suppressClickRef.current = false;
      setDragging(true);
    },
    [point],
  );

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    suppressClickRef.current = true;
    setOpen(false);
    setPoint(clamp({ x: drag.origin.x + dx, y: drag.origin.y + dy }));
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag || !drag.moved) return;
    setPoint((prev) => {
      if (!prev) return prev;
      const snapped = clamp({
        x: prev.x < window.innerWidth / 2 ? MARGIN + 8 : window.innerWidth - SIZE - MARGIN - 8,
        y: prev.y,
      });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapped));
      } catch {
      }
      return snapped;
    });
  }, []);

  if (!point) return null;

  const onLeft = point.x + SIZE / 2 < window.innerWidth / 2;
  const opensBelow = point.y < 220;

  const actions = [
    {
      key: 'voice',
      label: '语音提问',
      icon: <AudioOutlined />,
      run: () => navigate('/chat?voice=1'),
    },
    {
      key: 'note',
      label: '新建笔记',
      icon: <FileTextOutlined />,
      run: () => {
        createNote();
        navigate('/notes');
      },
    },
    {
      key: 'palette',
      label: '命令面板',
      icon: <SearchOutlined />,
      run: () => setPaletteOpen(true),
    },
    {
      key: 'theme',
      label: '切换主题',
      icon: <BulbOutlined />,
      run: () => toggleDark(),
    },
  ];

  return (
    <div
      ref={rootRef}
      className={cn('fab-root', onLeft && 'is-left', opensBelow && 'is-below')}
      style={{ left: point.x, top: point.y }}
    >
      {open && (
        <div className="fab-menu">
          {actions.map((action, index) => (
            <button
              key={action.key}
              type="button"
              className="fab-item"
              style={{ animationDelay: `${index * 45}ms` }}
              onClick={() => {
                action.run();
                setOpen(false);
              }}
            >
              <span className="fab-item-label">{action.label}</span>
              <span className="fab-item-icon">{action.icon}</span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        aria-label="快捷操作"
        aria-expanded={open}
        className={cn('fab', dragging && 'is-dragging', open && 'is-open')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          setOpen((v) => !v);
        }}
      >
        <ThunderboltFilled />
      </button>
    </div>
  );
}
