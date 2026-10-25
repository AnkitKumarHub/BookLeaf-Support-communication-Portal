"use client";

import { AppShell } from "@/components/app-shell";

const NAV = [
  { href: "/admin", label: "Ticket queue" },
  { href: "/admin/dashboard", label: "Dashboard" },
];

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AppShell role="admin" nav={NAV}>
      {children}
    </AppShell>
  );
}
