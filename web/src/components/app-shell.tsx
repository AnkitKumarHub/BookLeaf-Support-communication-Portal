"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { RequireRole, useAuthActions, useMe, type Role } from "@/lib/auth";
import { useTicketStream } from "@/lib/stream";

export type NavItem = { href: string; label: string };

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

  // Most specific match wins, so /author/tickets/new does not also light up /author/tickets.
  const active = nav
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href={home} className="text-sm font-semibold">
            BookLeaf <span className="text-emerald-700">{role === "admin" ? "Ops" : "Authors"}</span>
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active === item.href ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  active === item.href
                    ? "bg-emerald-50 font-medium text-emerald-800"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-neutral-600">{me?.name}</span>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-neutral-700 hover:bg-neutral-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
