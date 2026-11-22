import { useCallback, useEffect, useRef, useState } from 'react';
import { BulbOutlined, ClearOutlined, DownOutlined, ThunderboltFilled } from '@ant-design/icons';
import { cn } from '@/lib/utils';

interface Props {
  onNewChat: () => void;
  onScrollBottom: () => void;
  onToggleTheme: () => void;
}

const STORAGE_KEY = 'ai-console:fab';
const SIZE = 52;
const MARGIN = 10;

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
    /* 忽略损坏的存储 */
  }
  return clamp({ x: window.innerWidth - SIZE - 24, y: window.innerHeight - SIZE - 120 });
}

/**
 * 悬浮球：可拖动、可吸附、点击弹出快捷操作。
 *
 * 实现要点（面试可讲）：
 * - 用 Pointer Events 统一鼠标/触摸，不用分别写 mouse + touch；
 * - 拖动阈值 4px：小于它算"点击"，大于它算"拖拽"，避免拖完手一松就误触菜单；
 * - 位置存 localStorage，窗口 resize 时重新夹紧到视口内，防止球跑到屏幕外找不回来。
 */
export function FloatingBall({ onNewChat, onScrollBottom, onToggleTheme }: Props) {
  const [point, setPoint] = useState<Point | null>(null);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origin: Point; moved: boolean } | null>(null);

  useEffect(() => {
    setPoint(loadPoint());
    const onResize = () => setPoint((prev) => (prev ? clamp(prev) : prev));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!point) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        origin: point,
        moved: false,
      };
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
    if (drag && !drag.moved) {
      setOpen((v) => !v);
      return;
    }
    setPoint((prev) => {
      if (!prev) return prev;
      // 松手后吸附到最近的水平边缘，视觉上更稳
      const snapped = clamp({ x: prev.x < window.innerWidth / 2 ? MARGIN + 8 : window.innerWidth - SIZE - MARGIN - 8, y: prev.y });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapped));
      } catch {
        /* 隐私模式忽略 */
      }
      return snapped;
    });
  }, []);

  if (!point) return null;

  const menuAbove = point.y > 260;

  return (
    <div className="fab-root" style={{ left: point.x, top: point.y }}>
      {open && (
        <div className={cn('fab-menu', menuAbove ? 'is-above' : 'is-below')}>
          <button
            type="button"
            onClick={() => {
              onNewChat();
              setOpen(false);
            }}
          >
            <ClearOutlined /> 新建对话
          </button>
          <button
            type="button"
            onClick={() => {
              onScrollBottom();
              setOpen(false);
            }}
          >
            <DownOutlined /> 回到最新
          </button>
          <button
            type="button"
            onClick={() => {
              onToggleTheme();
              setOpen(false);
            }}
          >
            <BulbOutlined /> 切换主题
          </button>
        </div>
      )}

      <button
        type="button"
        aria-label="快捷操作"
        className={cn('fab', dragging && 'is-dragging', open && 'is-open')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <ThunderboltFilled />
      </button>
    </div>
  );
}
