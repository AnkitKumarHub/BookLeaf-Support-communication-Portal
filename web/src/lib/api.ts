import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";

export type PageMeta = { page: number; limit: number; total: number };

// Every API success body is { data, meta? }.
export type Envelope<T> = { data: T; meta?: PageMeta };

export type ApiError = {
  status: number;
  code: string;
  message: string;
  fields: Record<string, string>;
};

// Tokens are HttpOnly cookies: the browser sends them, JS never reads them.
// No default Content-Type: axios sends JSON for plain objects and lets the
// browser set the multipart boundary for FormData uploads.
export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const AUTH_CALL = /\/auth\/(login|refresh)$/;

// One refresh at a time. Refresh tokens rotate and the old one is revoked on
// use, so two parallel refreshes would fail the second and log the user out.
let refreshing: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  refreshing ??= axios
    .post(`${API_BASE_URL}/auth/refresh`, null, { withCredentials: true })
    .then(() => undefined)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// Pages a signed-out visitor may stay on.
const PUBLIC_PATHS = ["/login", "/signup"];

// A full page load on purpose: this runs outside React, and an expired session
// should drop every in-memory cache.
function goToLogin() {
  if (typeof window !== "undefined" && !PUBLIC_PATHS.includes(window.location.pathname)) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryConfig | undefined;
    const isAuthCall = AUTH_CALL.test(original?.url ?? "");
    if (error.response?.status !== 401 || !original || original._retry || isAuthCall) {
      return Promise.reject(error);
    }
    original._retry = true;
    try {
      await refreshSession();
    } catch {
      goToLogin();
      return Promise.reject(error);
    }
    return api(original);
  },
);

// Turns any thrown request error into the API's error envelope shape.
export function toApiError(err: unknown): ApiError {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as
      | { error?: { code?: string; message?: string; fields?: Record<string, string> } }
      | undefined;
    if (err.response && body?.error) {
      return {
        status: err.response.status,
        code: body.error.code ?? "UNKNOWN",
        message: body.error.message ?? "Something went wrong.",
        fields: body.error.fields ?? {},
      };
    }
    if (!err.response) {
      return {
        status: 0,
        code: "NETWORK",
        message: "Cannot reach the server. Check your connection and try again.",
        fields: {},
      };
    }
  }
  return { status: 0, code: "UNKNOWN", message: "Something went wrong.", fields: {} };
}

// SWR fetcher: the key is the API path, the value is the full envelope.
export async function fetcher<T>(path: string): Promise<Envelope<T>> {
  const response = await api.get<Envelope<T>>(path);
  return response.data;
}
