"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
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
      {/* The links stay solid. The last part of the bar, border included,
          fades out, so a card scrolling under it dissolves instead of hitting
          a hard edge. No blur: that would put the page through the words. */}
      <div className="sticky top-0 z-20 px-4 pt-3">
        <header className="pointer-events-none mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-neutral-200 bg-white px-3 pt-2 pb-8 [mask-image:linear-gradient(to_bottom,#000_0,#000_3.25rem,transparent)]">
          <Link href={home} className="pointer-events-auto px-1.5 text-sm font-semibold">
            BookLeaf <span className="text-brand-deep">{role === "admin" ? "Ops" : "Authors"}</span>
          </Link>
          <nav className="pointer-events-auto flex flex-1 flex-wrap gap-0.5">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active === item.href ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-safe:active:scale-[0.98] ${
                  active === item.href
                    ? "bg-neutral-100 font-medium text-ink"
                    : "text-neutral-600 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-neutral-100"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="pointer-events-auto flex items-center gap-2 text-sm">
            <span className="px-1 text-neutral-600">{me?.name}</span>
            <ThemeToggle />
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
        </header>
      </div>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-6">{children}</main>
    </div>
  );
}
