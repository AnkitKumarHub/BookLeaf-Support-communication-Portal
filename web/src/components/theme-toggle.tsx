"use client";

import { Moon, Sun } from "lucide-react";
import { useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { storedTheme, systemTheme, THEME_STORAGE_KEY } from "@/lib/theme";

// No React state: the attribute on <html> is the single source of truth, and
// both icons are rendered with CSS deciding which one shows. That keeps the
// server render and the first client render identical, so the inline script in
// the root layout can set the theme before paint without a hydration mismatch.
export function ThemeToggle() {
  // Re-applies the attribute after React's Strict Mode remount in dev strips
  // what the inline script set. A no-op in production.
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", storedTheme() ?? systemTheme());
  }, []);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="Switch between light and dark mode"
      title="Switch between light and dark mode"
      iconRight={null}
      onClick={() => {
        const root = document.documentElement;
        const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        try {
          localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
          // The theme still changes for this visit, it just is not remembered.
        }
      }}
    >
      <Moon className="dark:hidden" aria-hidden />
      <Sun className="hidden dark:block" aria-hidden />
    </Button>
  );
}
