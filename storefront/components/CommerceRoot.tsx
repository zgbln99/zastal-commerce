"use client";
import { usePathname } from "next/navigation";
import { StoreProvider } from "./StoreProvider";
import StoreShell from "./StoreShell";
export default function CommerceRoot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return <>{children}</>;
  return <StoreProvider><StoreShell>{children}</StoreShell></StoreProvider>;
}
