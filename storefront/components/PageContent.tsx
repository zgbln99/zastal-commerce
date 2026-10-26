import { parseBlocks, type Inline } from "../lib/page-content.mjs";
import "./page-content.css";
const Line = ({ inline }: { inline: Inline[] }) => <>{inline.map((part, index) => part.type === "link" ? <a key={index} href={part.href} target={part.href.startsWith("/") ? undefined : "_blank"} rel={part.href.startsWith("/") ? undefined : "noreferrer"}>{part.text}</a> : <span key={index}>{part.text}</span>)}</>;
/** Renders restricted page text as headings, paragraphs and lists. Never injects HTML. */
export default function PageContent({ content, className = "" }: { content: string; className?: string }) {
  const blocks = parseBlocks(content);
  return <div className={"page-content " + className}>{blocks.map((block, index) => {
    if (block.type === "ul") return <ul key={index}>{block.items.map((item, i) => <li key={i}><Line inline={item}/></li>)}</ul>;
    if (block.type === "h1") return <h1 key={index}><Line inline={block.inline}/></h1>;
    if (block.type === "h2") return <h2 key={index}><Line inline={block.inline}/></h2>;
    if (block.type === "h3") return <h3 key={index}><Line inline={block.inline}/></h3>;
    return <p key={index}><Line inline={block.inline}/></p>;
  })}</div>;
}
