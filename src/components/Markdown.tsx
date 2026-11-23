import { useEffect, useMemo, useRef } from 'react';
import { renderMarkdown } from '@/lib/markdown';
import { copyText } from '@/lib/utils';

interface Props {
  source: string;
  streaming?: boolean;
}

export function Markdown({ source, streaming = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderMarkdown(source), [source]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    root.querySelectorAll('pre').forEach((pre) => {
      if (pre.querySelector('.code-copy')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'code-copy';
      button.textContent = '复制';
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
        const ok = await copyText(code);
        button.textContent = ok ? '已复制' : '失败';
        window.setTimeout(() => {
          button.textContent = '复制';
        }, 1400);
      });
      pre.appendChild(button);
    });
  }, [html]);

  return (
    <div
      ref={containerRef}
      className={streaming ? 'md md-streaming' : 'md'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
