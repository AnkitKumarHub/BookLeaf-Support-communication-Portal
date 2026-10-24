"use client";

import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/api";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        // The SSE stream drives refetches; focus is the safety net.
        revalidateOnFocus: true,
        errorRetryCount: 2,
      }}
    >
      {children}
    </SWRConfig>
  );
}
