import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

/**
 * 流式 Markdown 最大的体验问题不是「渲染得不好看」，而是「闪烁 + 结构崩坏」：
 * 模型刚吐到 "```py" 的时候，围栏还没闭合，marked 会把后面所有内容当成代码块，
 * 于是页面在「代码块」和「正文」之间反复横跳。
 *
 * 解决思路：解析前先「补全」未闭合的结构（围栏、加粗），
 * 让每一帧都是一份合法的 Markdown，渲染结果才是稳定的。
 * 这就是函数名 repair 的含义 —— 它修补的是"半成品"，不是 bug。
 */
export function repairStreamingMarkdown(input: string): string {
  let text = input;

  const fenceCount = (text.match(/^\s*```/gm) ?? []).length;
  if (fenceCount % 2 === 1) {
    // 未闭合的代码围栏：补一个闭合，避免后续内容被吞进代码块
    return `${text}\n\`\`\``;
  }

  // 只在代码块之外修补加粗：代码里的 ** 是运算符，不是标记
  const withoutFences = text.replace(/```[\s\S]*?```/g, '');
  const boldCount = (withoutFences.match(/\*\*/g) ?? []).length;
  if (boldCount % 2 === 1) {
    text += '**';
  }

  return text;
}

/** 判断当前是否处在未闭合的代码块里（用于给代码块加"生成中"光标） */
export function isInsideFence(input: string): boolean {
  return (input.match(/^\s*```/gm) ?? []).length % 2 === 1;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let hookInstalled = false;
function installHook(): void {
  if (hookInstalled) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  hookInstalled = true;
}

/** Markdown → 安全 HTML。所有模型输出都必须走这里，不能直接 dangerouslySetInnerHTML。 */
export function renderMarkdown(source: string): string {
  if (!source.trim()) return '';
  installHook();

  try {
    const html = marked.parse(repairStreamingMarkdown(source), { async: false }) as string;
    return DOMPurify.sanitize(html, {
      ADD_ATTR: ['target', 'rel'],
      FORBID_TAGS: ['style', 'iframe', 'form', 'input'],
      FORBID_ATTR: ['style', 'onerror', 'onload'],
    });
  } catch {
    // 极端输入（比如超长未闭合表格）导致解析器抛错时，退化成纯文本，别白屏
    return `<p>${escapeHtml(source)}</p>`;
  }
}
