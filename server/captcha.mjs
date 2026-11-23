import { randomBytes } from 'node:crypto';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const TTL = 5 * 60 * 1000;
const MAX_ENTRIES = 500;

const store = new Map();

function pick(n) {
  let out = '';
  const bytes = randomBytes(n);
  for (let i = 0; i < n; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

function buildSvg(text) {
  const width = 120;
  const height = 40;
  const chars = text.split('').map((char, index) => {
    const x = 14 + index * 26;
    const y = 27 + Math.random() * 4;
    const rotate = (Math.random() * 24 - 12).toFixed(1);
    const size = 20 + Math.round(Math.random() * 4);
    return `<text x="${x}" y="${y}" font-size="${size}" font-family="Georgia, serif" font-weight="700" fill="#3b4658" transform="rotate(${rotate} ${x} ${y})">${char}</text>`;
  });

  const lines = Array.from({ length: 2 }, () => {
    const x1 = Math.random() * width;
    const y1 = Math.random() * height;
    const x2 = Math.random() * width;
    const y2 = Math.random() * height;
    return `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#9fb0c8" stroke-width="1" opacity="0.7"/>`;
  }).join('');

  const dots = Array.from({ length: 24 }, () => {
    const cx = Math.random() * width;
    const cy = Math.random() * height;
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="0.9" fill="#b8c4d6"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="#eef3fb" rx="8"/>
${dots}${lines}${chars.join('')}
</svg>`;
}

export function issueCaptcha() {
  const now = Date.now();
  for (const [key, value] of store) {
    if (value.expiresAt < now) store.delete(key);
  }
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }

  const id = randomBytes(9).toString('hex');
  const text = pick(4);
  store.set(id, { text, expiresAt: now + TTL });
  return { id, image: `data:image/svg+xml;base64,${Buffer.from(buildSvg(text)).toString('base64')}` };
}

export function verifyCaptcha(id, input) {
  if (!id || typeof input !== 'string') return false;
  const entry = store.get(id);
  if (!entry) return false;
  store.delete(id);
  if (entry.expiresAt < Date.now()) return false;
  return entry.text.toLowerCase() === input.trim().toLowerCase();
}
