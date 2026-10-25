// Seeded accounts behind the one-click demo buttons. They cover the dataset's
// edge cases: Priya has a ₹0.00 pending royalty, Sneha has a book in production.
export const DEMO_ACCOUNTS = {
  priya: "priya.sharma@email.com",
  sneha: "sneha.kulkarni@email.com",
  admin: "admin@bookleaf.dev",
} as const;

export type DemoAccount = keyof typeof DEMO_ACCOUNTS;
