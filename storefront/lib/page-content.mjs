// Restricted text format → safe block structure. No HTML passes through; links must be https or site-relative.
const LINK = /\[([^\]\n]{1,200})\]\((https:\/\/[^\s)]{1,400}|\/[a-zA-Z0-9_\-./?=&#%]{0,200})\)/g;
export function parseInline(text) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    if (match.index > last) parts.push({ type: 'text', text: text.slice(last, match.index) });
    parts.push({ type: 'link', text: match[1], href: match[2] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) });
  return parts;
}
export function parseBlocks(content) {
  const blocks = [];
  let paragraph = [], list = null;
  const flush = () => {
    if (paragraph.length) { blocks.push({ type: 'p', inline: parseInline(paragraph.join(' ')) }); paragraph = []; }
    if (list) { blocks.push(list); list = null; }
  };
  for (const raw of String(content || '').split('\n')) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const item = /^[-*]\s+(.+)$/.exec(line);
    if (!line.trim()) { flush(); continue; }
    if (heading) { flush(); blocks.push({ type: 'h' + heading[1].length, inline: parseInline(heading[2].trim()) }); continue; }
    if (item) { if (paragraph.length) { blocks.push({ type: 'p', inline: parseInline(paragraph.join(' ')) }); paragraph = []; } list = list || { type: 'ul', items: [] }; list.items.push(parseInline(item[1].trim())); continue; }
    if (list) { blocks.push(list); list = null; }
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}
export function placeholderCount(content) {
  return (String(content || '').match(/\[[^\]\n]{1,80}\]/g) || []).filter(token => !/\]\(/.test(token)).length;
}
