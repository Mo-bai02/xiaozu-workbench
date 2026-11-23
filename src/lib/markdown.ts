import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

export function repairStreamingMarkdown(input: string): string {
  let text = input;

  const fenceCount = (text.match(/^\s*```/gm) ?? []).length;
  if (fenceCount % 2 === 1) {
    return `${text}\n\`\`\``;
  }

  const withoutFences = text.replace(/```[\s\S]*?```/g, '');
  const boldCount = (withoutFences.match(/\*\*/g) ?? []).length;
  if (boldCount % 2 === 1) {
    text += '**';
  }

  return text;
}

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
    return `<p>${escapeHtml(source)}</p>`;
  }
}
