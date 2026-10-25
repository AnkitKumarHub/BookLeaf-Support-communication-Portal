// Demo-only features, off unless the env says "true". Their routes are not
// registered at all when off, so they return 404 and are absent from /docs.

// POST /auth/demo-login: one-click sign-in as Priya, Sneha, or the admin.
export function demoLoginsEnabled(): boolean {
  return process.env.DEMO_LOGINS === "true";
}

// POST /auth/signup and POST /author/books: author self-signup and add-book.
export function selfServiceEnabled(): boolean {
  return process.env.DEMO_SELF_SERVICE === "true";
}
