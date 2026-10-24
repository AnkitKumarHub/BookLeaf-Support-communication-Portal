"use client";

import { AppShell } from "@/components/app-shell";

const NAV = [
  { href: "/author", label: "Overview" },
  { href: "/author/books", label: "My Books" },
  { href: "/author/tickets", label: "My Tickets" },
  { href: "/author/tickets/new", label: "New ticket" },
];

export default function AuthorLayout({ children }: LayoutProps<"/author">) {
  return (
    <AppShell role="author" nav={NAV}>
      {children}
    </AppShell>
  );
}
