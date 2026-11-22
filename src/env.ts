import { z } from 'zod';

/**
 * 环境变量在启动时就校验，而不是等到运行时某个地方 undefined。
 * 这是脚手架该做的事：把配置错误挡在第一屏。
 */
const schema = z.object({
  VITE_API_BASE: z.string().default('/api'),
  VITE_APP_TITLE: z.string().default('AI Console'),
});

const parsed = schema.safeParse(import.meta.env);

if (!parsed.success) {
  const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`环境变量校验失败 → ${detail}`);
}

export const env = {
  apiBase: parsed.data.VITE_API_BASE.replace(/\/$/, ''),
  appTitle: parsed.data.VITE_APP_TITLE,
  isDev: import.meta.env.DEV,
} as const;
