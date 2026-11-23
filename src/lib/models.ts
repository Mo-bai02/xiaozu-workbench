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
