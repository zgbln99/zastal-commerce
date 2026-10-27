import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import PageContent from "../../../components/PageContent";

export const dynamic = "force-dynamic";
type Page = { slug: string; title: string; content: string; published_at: string | null };
const backend = () => process.env.ZASTAL_CMS_API || "http://127.0.0.1:8880";

async function load(slug: string): Promise<Page | null> {
  if (!/^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/.test(slug) && !/^[a-z0-9]$/.test(slug)) return null;
  try {
    const response = await fetch(`${backend()}/api/store/pages/${slug}`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data?.content === "string" && typeof data?.title === "string" ? data : null;
  } catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = await load((await params).slug);
  return { title: page?.title || "Informacje", robots: page ? undefined : { index: false } };
}

export default async function InfoPage({ params }: { params: Promise<{ slug: string }> }) {
  const page = await load((await params).slug);
  if (!page) notFound();
  const published = page.published_at ? new Date(page.published_at).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" }) : "";
  return <div className="container info-page"><div className="breadcrumbs"><Link href="/">Strona główna</Link><ChevronRight size={11}/><span>{page.title}</span></div><PageContent content={page.content}/>{published && <p className="info-page-meta">Ostatnia publikacja: {published}</p>}</div>;
}
