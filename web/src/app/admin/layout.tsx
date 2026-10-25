"use client";

import { AppShell } from "@/components/app-shell";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/ticket-queue", label: "Ticket queue", match: ["/admin/ticket-queue", "/admin/tickets"] },
];

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AppShell role="admin" nav={NAV}>
      {children}
    </AppShell>
  );
}
