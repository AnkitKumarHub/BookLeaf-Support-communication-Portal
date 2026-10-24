"use client";

import { useState } from "react";
import { toApiError } from "./api";

// Busy and error state for one button or form that calls the API, then
// refreshes the data it changed.
export function useAction(refresh: () => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(request: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await request();
      await refresh();
      return true;
    } catch (err) {
      const apiError = toApiError(err);
      const detail = Object.values(apiError.fields)[0];
      setError(detail ? `${apiError.message} ${detail}` : apiError.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, run, clearError: () => setError(null) };
}
