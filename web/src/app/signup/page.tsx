"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Field, inputClass, primaryButtonClass } from "@/components/ui";
import { toApiError, type ApiError } from "@/lib/api";
import { homeFor, useAuthActions, useMe } from "@/lib/auth";
import { DEMO_SELF_SERVICE } from "@/lib/flags";

// Demo only (NEXT_PUBLIC_DEMO_SELF_SERVICE=true): creates an author account
// with no books. Admins are never created here.
export default function SignupPage() {
  const router = useRouter();
  const { me } = useMe();
  const { signup } = useAuthActions();
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", city: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (me) router.replace(homeFor(me.role));
  }, [me, router]);

  if (!DEMO_SELF_SERVICE) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-sm text-neutral-600">
        <p>
          Sign-up is not available.{" "}
          <Link href="/login" className="font-medium text-neutral-800 underline underline-offset-2 hover:text-ink">
            Go to sign in
          </Link>
        </p>
      </main>
    );
  }

  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const identity = await signup({
        name: form.name,
        email: form.email,
        password: form.password,
        ...(form.phone.trim() ? { phone: form.phone } : {}),
        ...(form.city.trim() ? { city: form.city } : {}),
      });
      router.replace(homeFor(identity.role));
    } catch (err) {
      setError(toApiError(err));
      setSubmitting(false);
    }
  }

  const field = (key: keyof typeof form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} error={error?.fields[key]}>
      <input
        value={form[key]}
        onChange={(e) => set(key)(e.target.value)}
        aria-invalid={Boolean(error?.fields[key])}
        className={inputClass}
        {...props}
      />
    </Field>
  );

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">BookLeaf Publishing</p>
          <h1 className="mt-2 text-2xl font-semibold">Create an author account</h1>
          <p className="mt-1 text-sm text-neutral-500">For trying the portal. You can add your books after signing up.</p>
        </div>

        <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6">
          {error && !Object.keys(error.fields).length && (
            <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error.message}
            </div>
          )}
          {field("name", "Full name", { autoComplete: "name", required: true })}
          {field("email", "Email", { type: "email", autoComplete: "email", required: true })}
          {field("password", "Password (at least 8 characters)", { type: "password", autoComplete: "new-password", required: true })}
          {field("phone", "Phone (optional)", { type: "tel", autoComplete: "tel" })}
          {field("city", "City (optional)")}
          <button type="submit" disabled={submitting} className={`${primaryButtonClass} w-full`}>
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-neutral-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-neutral-800 underline underline-offset-2 hover:text-ink">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
