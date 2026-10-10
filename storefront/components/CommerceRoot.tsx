"use client";
import { usePathname } from "next/navigation";
import { StoreProvider } from "./StoreProvider";
import StoreShell from "./StoreShell";
import AuthProvider from "./AuthProvider";
export default function CommerceRoot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <AuthProvider>{pathname?.startsWith("/admin")?children:<StoreProvider><StoreShell>{children}</StoreShell></StoreProvider>}</AuthProvider>;
}
