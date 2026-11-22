import { useEffect, useState } from 'react';
import { env } from '@/env';

export interface Health {
  status: string;
  /** live = 已接入真实模型；mock = 服务端未配置 Key，走内置模拟 */
  mode: 'live' | 'mock' | 'offline' | 'loading';
  model?: string;
}

let cached: Health | null = null;

/**
 * 服务端模式探测。
 * 前端不再自己判断"是不是 mock"——问一次 /api/health，服务端说了算。
 */
export function useHealth(): Health {
  const [health, setHealth] = useState<Health>(cached ?? { status: 'loading', mode: 'loading' });

  useEffect(() => {
    if (cached) return;
    let alive = true;
    fetch(`${env.apiBase}/health`)
      .then((res) => res.json())
      .then((data: Health) => {
        cached = data;
        if (alive) setHealth(data);
      })
      .catch(() => {
        const offline: Health = { status: 'offline', mode: 'offline' };
        cached = offline;
        if (alive) setHealth(offline);
      });
    return () => {
      alive = false;
    };
  }, []);

  return health;
}
