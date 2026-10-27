/** Bolds every occurrence of the query inside a suggestion label (accent- and case-insensitive). */
const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").toLowerCase();

export default function HighlightedText({ text, query, className = "" }: { text: string; query: string; className?: string }) {
  const needle = fold(query.trim());
  if (!needle || fold(text).length !== text.length) return <span className={className}>{text}</span>;
  const hay = fold(text);
  const parts: { text: string; hit: boolean }[] = [];
  let index = 0;
  while (index < text.length) {
    const found = hay.indexOf(needle, index);
    if (found < 0) { parts.push({ text: text.slice(index), hit: false }); break; }
    if (found > index) parts.push({ text: text.slice(index, found), hit: false });
    parts.push({ text: text.slice(found, found + needle.length), hit: true });
    index = found + needle.length;
  }
  return <span className={className}>{parts.map((part, i) => part.hit ? <mark key={i} className="rounded-sm bg-accent px-0.5 text-accent-foreground">{part.text}</mark> : <span key={i}>{part.text}</span>)}</span>;
}
