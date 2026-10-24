export type Inline = { type: 'text'; text: string } | { type: 'link'; text: string; href: string };
export type Block = { type: 'h1' | 'h2' | 'h3' | 'p'; inline: Inline[] } | { type: 'ul'; items: Inline[][] };
export function parseInline(text: string): Inline[];
export function parseBlocks(content: string): Block[];
export function placeholderCount(content: string): number;
