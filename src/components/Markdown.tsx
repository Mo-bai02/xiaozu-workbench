import { useEffect, useMemo, useRef } from 'react';
import { renderMarkdown } from '@/lib/markdown';
import { copyText } from '@/lib/utils';

interface Props {
  source: string;
  /** 流式生成中：给最后一段加光标、给未闭合代码块加标识 */
  streaming?: boolean;
}

/**
 * Markdown 渲染。
 *
 * 两个细节值得说：
 * 1) 所有模型输出都经过 DOMPurify，永远不直接把字符串塞进 innerHTML；
 * 2) 代码块在流式阶段会被「补全」，所以复制按钮能立刻点到，不用等生成结束。
 */
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
