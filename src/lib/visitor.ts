const KEY = 'ai-console:visitor';

export function getVisitorId(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && /^[a-zA-Z0-9_-]{8,64}$/.test(saved)) return saved;
    const id = `v${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return 'anonymous';
  }
}
