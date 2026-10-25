"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toApiError, type ApiError } from "@/lib/api";
import { homeFor, useAuthActions, useMe } from "@/lib/auth";
import { DEMO_LOGINS, DEMO_SELF_SERVICE } from "@/lib/flags";

const DEMO_BUTTONS = [
  { account: "priya", label: "Author: Priya Sharma", hint: "2 books, one with ₹0.00 pending" },
  { account: "sneha", label: "Author: Sneha Kulkarni", hint: "3 books, one in production" },
  { account: "admin", label: "Admin: BookLeaf Admin", hint: "Ticket queue, AI triage, drafts" },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const { me } = useMe();
  const { login, demoLogin } = useAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Already signed in: skip the form.
  useEffect(() => {
    if (me) router.replace(homeFor(me.role));
  }, [me, router]);

  async function onDemo(account: (typeof DEMO_BUTTONS)[number]["account"]) {
    setSubmitting(true);
    setError(null);
    try {
      const identity = await demoLogin(account);
      router.replace(homeFor(identity.role));
    } catch (err) {
      setError(toApiError(err));
      setSubmitting(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const identity = await login(email, password);
      router.replace(homeFor(identity.role));
    } catch (err) {
      setError(toApiError(err));
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
            BookLeaf Publishing
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Sign in to Support</h1>
          <p className="mt-1 text-sm text-neutral-500">Authors and the BookLeaf team use the same login.</p>
        </div>

        <form
          onSubmit={onSubmit}
          noValidate
          className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
        >
          {error && (
            <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error.message}
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(error?.fields.email)}
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
            />
            {error?.fields.email && (
              <span className="mt-1 block text-xs text-red-600">{error.fields.email}</span>
            )}
          </label>

          <label className="block">
            <span className="text-sm font-medium">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
            />
          </label>

          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {DEMO_SELF_SERVICE && (
          <p className="mt-4 text-center text-sm text-neutral-600">
            New author?{" "}
            <Link href="/signup" className="font-medium text-emerald-700 hover:underline">
              Create an account
            </Link>
          </p>
        )}

        {DEMO_LOGINS && (
          <div className="mt-6 rounded-xl border border-dashed border-neutral-300 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Try the demo</p>
            <div className="mt-3 space-y-2">
              {DEMO_BUTTONS.map((demo) => (
                <button
                  key={demo.account}
                  type="button"
                  disabled={submitting}
                  onClick={() => void onDemo(demo.account)}
                  className="block w-full rounded-md border border-neutral-200 px-3 py-2 text-left hover:border-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                >
                  <span className="block text-sm font-medium">{demo.label}</span>
                  <span className="block text-xs text-neutral-500">{demo.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
