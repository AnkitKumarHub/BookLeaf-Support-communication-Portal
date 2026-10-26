"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { RequireRole, useAuthActions, useMe, type Role } from "@/lib/auth";
import { useTicketStream } from "@/lib/stream";

export type NavItem = { href: string; label: string; match?: string[] };

function matchLength(item: NavItem, pathname: string): number {
  const prefixes = item.match ?? [item.href];
  return prefixes.reduce((best, prefix) => {
    const hit = pathname === prefix || pathname.startsWith(`${prefix}/`);
    return hit ? Math.max(best, prefix.length) : best;
  }, 0);
}

// Header, nav, and the live stream for one portal. Only rendered once the
// signed-in user has the right role.
export function AppShell({
  role,
  nav,
  children,
}: {
  role: Role;
  nav: NavItem[];
  children: ReactNode;
}) {
  return (
    <RequireRole role={role}>
      <Shell nav={nav} role={role}>
        {children}
      </Shell>
    </RequireRole>
  );
}

function Shell({ nav, role, children }: { nav: NavItem[]; role: Role; children: ReactNode }) {
  useTicketStream();
  const { me } = useMe();
  const { logout } = useAuthActions();
  const pathname = usePathname();
  const home = nav[0]?.href ?? "/";

  // Most specific match wins, so /author/books lights up My Books, not Overview.
  // Optional prefixes cover pages that live beside a nav item, such as a ticket under the queue.
  const active = nav
    .map((item) => ({ href: item.href, length: matchLength(item, pathname) }))
    .filter((item) => item.length > 0)
    .sort((a, b) => b.length - a.length)[0]?.href;

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href={home} className="text-sm font-semibold">
            BookLeaf <span className="text-brand-deep">{role === "admin" ? "Ops" : "Authors"}</span>
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active === item.href ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  active === item.href
                    ? "bg-brand-wash font-medium text-ink"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-neutral-600">{me?.name}</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Sign out"
              iconRight={null}
              onClick={() => void logout()}
            >
              <LogOut />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
