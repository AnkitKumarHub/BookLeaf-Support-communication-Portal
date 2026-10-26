// Shared by the inline script in the root layout (a server component) and the
// toggle in the header (a client one), so both read and write the same key.
export const THEME_STORAGE_KEY = "bookleaf.theme";

export type Theme = "light" | "dark";

export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    // Storage blocked: the OS preference decides every visit.
    return null;
  }
}

export function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
