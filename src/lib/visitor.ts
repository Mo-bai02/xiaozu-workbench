const KEY = 'ai-console:visitor';

/**
 * 访客标识：第一次打开页面时随机生成，存本地。
 *
 * 它**不是账号**，只是让服务端能把日志按浏览器分开：
 * 你把项目内网穿透给别人用，他们看到的是自己的调用记录，不是你的。
 * 想做到"换个人也看不到"需要真正的登录鉴权，这里刻意没做（演示项目）。
 */
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
