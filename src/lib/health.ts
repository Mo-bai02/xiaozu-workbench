import { useEffect, useState } from 'react';
import { apiFetch } from './api';

export interface Health {
  status: string;
  mode: 'live' | 'mock' | 'offline' | 'loading';
  model?: string;
}

let cached: Health | null = null;

export function useHealth(): Health {
  const [health, setHealth] = useState<Health>(cached ?? { status: 'loading', mode: 'loading' });

  useEffect(() => {
    if (cached) return;
    let alive = true;
    apiFetch('/health')
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
