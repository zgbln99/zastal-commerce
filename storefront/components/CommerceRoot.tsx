"use client";
import { usePathname } from "next/navigation";
import { StoreProvider } from "./StoreProvider";
import StoreShell from "./StoreShell";
import AuthProvider from "./AuthProvider";
export default function CommerceRoot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <AuthProvider><StoreProvider>
    {pathname?.startsWith("/admin")?children:<StoreShell>{children}</StoreShell>}
  </StoreProvider></AuthProvider>;
}
