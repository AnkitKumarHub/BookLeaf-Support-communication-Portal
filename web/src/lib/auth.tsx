"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import useSWR, { useSWRConfig } from "swr";
import { api, type Envelope } from "./api";

export type Role = "author" | "admin";

export type Identity = {
  id: string;
  email: string;
  name: string;
  role: Role;
  authorId: string | null;
};

export const ME_KEY = "/auth/me";

export function homeFor(role: Role): string {
  return role === "admin" ? "/admin" : "/author";
}

// The signed-in user, or an error when there is no session.
export function useMe() {
  const { data, error, isLoading } = useSWR<Envelope<Identity>>(ME_KEY, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  return { me: data?.data ?? null, error, isLoading };
}

export function useAuthActions() {
  const { mutate } = useSWRConfig();
  const router = useRouter();

  async function login(email: string, password: string): Promise<Identity> {
    const response = await api.post<Envelope<Identity>>("/auth/login", { email, password });
    await mutate(ME_KEY, response.data, { revalidate: false });
    return response.data.data;
  }

  async function signup(input: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    city?: string;
  }): Promise<Identity> {
    const response = await api.post<Envelope<Identity>>("/auth/signup", input);
    await mutate(ME_KEY, response.data, { revalidate: false });
    return response.data.data;
  }

  async function demoLogin(account: "priya" | "sneha" | "admin"): Promise<Identity> {
    const response = await api.post<Envelope<Identity>>("/auth/demo-login", { account });
    await mutate(ME_KEY, response.data, { revalidate: false });
    return response.data.data;
  }

  async function logout() {
    try {
      await api.post("/auth/logout");
    } finally {
      // Drop every cached response so the next user starts clean.
      await mutate(() => true, undefined, { revalidate: false });
      router.replace("/login");
    }
  }

  return { login, signup, demoLogin, logout };
}

// Renders children only for the given role. The API is still the authority;
// this only decides what to show. A missing session is sent to /login by the
// API client's interceptor.
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { me, error, isLoading } = useMe();
  const router = useRouter();

  useEffect(() => {
    if (me && me.role !== role) router.replace(homeFor(me.role));
    if (error && !isLoading) router.replace("/login");
  }, [me, error, isLoading, role, router]);

  if (!me || me.role !== role) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-neutral-500">
        Loading…
      </div>
    );
  }
  return <>{children}</>;
}
