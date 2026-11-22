import { useEffect, useState } from 'react';
import { apiFetch } from './api';

export interface ModelOption {
  id: string;
  label: string;
  free: boolean;
  note?: string;
  provider?: string;
}

let cache: ModelOption[] | null = null;

/**
 * 可用模型列表。
 * 服务端只返回「配了 Key 的」模型 —— 没配 Key 的不会出现在下拉里，
 * 避免用户选了一个必然失败的选项。
 */
export function useModels(): ModelOption[] {
  const [models, setModels] = useState<ModelOption[]>(cache ?? []);

  useEffect(() => {
    if (cache) return;
    let alive = true;
    apiFetch('/models')
      .then((res) => res.json())
      .then((data: { models: ModelOption[] }) => {
        cache = data.models ?? [];
        if (alive) setModels(cache);
      })
      .catch(() => {
        if (alive) setModels([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  return models;
}
