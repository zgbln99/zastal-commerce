"use client";
import { usePathname } from "next/navigation";
import { StoreProvider } from "./StoreProvider";
import StoreShell from "./StoreShell";
import AuthProvider from "./AuthProvider";
export default function CommerceRoot({ children, initialUrls=[] }: { children: React.ReactNode; initialUrls?:{id:number;slug?:string}[] }) {
  const pathname = usePathname();
  return <AuthProvider><StoreProvider initialUrls={initialUrls}>
    {pathname?.startsWith("/admin")?children:<StoreShell>{children}</StoreShell>}
  </StoreProvider></AuthProvider>;
}
