const KEYS = [
  'ai-console:workspace',
  'ai-console:notes',
  'ai-console:expenses',
  'ai-console:focus',
  'ai-console:sessions',
  'ai-console:theme',
  'ai-console:model',
] as const;

const PREFIX = 'ai-console:';

export interface BackupFile {
  app: 'ai-console';
  version: 1;
  exportedAt: number;
  data: Record<string, unknown>;
}

export function collectBackup(): BackupFile {
  const data: Record<string, unknown> = {};
  for (const key of KEYS) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try {
      data[key] = JSON.parse(raw);
    } catch {
      data[key] = raw;
    }
  }
  return { app: 'ai-console', version: 1, exportedAt: Date.now(), data };
}

export function downloadBackup(): void {
  const backup = collectBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `ai-console-backup-${stamp}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function importBackup(file: File): Promise<{ keys: number }> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('不是合法的 JSON 文件');
  }

  const backup = parsed as Partial<BackupFile>;
  if (backup.app !== 'ai-console' || !backup.data || typeof backup.data !== 'object') {
    throw new Error('不是本应用导出的备份文件');
  }

  let keys = 0;
  for (const [key, value] of Object.entries(backup.data)) {
    localStorage.setItem(key, JSON.stringify(value));
    keys += 1;
  }
  return { keys };
}

export function clearAll(): void {
  for (const key of KEYS) localStorage.removeItem(key);
  localStorage.removeItem('ai-console:token');
  localStorage.removeItem('ai-console:visitor');
  localStorage.removeItem('ai-console:active-group');
}

export function storageUsage(): { bytes: number; entries: number } {
  let bytes = 0;
  let entries = 0;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(PREFIX)) continue;
    entries += 1;
    bytes += (localStorage.getItem(key)?.length ?? 0) * 2; // UTF-16，一个字符 2 字节
  }
  return { bytes, entries };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
