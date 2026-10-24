"use client";

import { useEffect } from "react";
import { useSWRConfig } from "swr";
import { api, API_BASE_URL } from "./api";

const RECONNECT_DELAY_MS = 2_000;
const MAX_FAILED_RECONNECTS = 3;

// A ticket list key, such as /admin/tickets?status=open or /author/tickets?limit=100.
const TICKET_LIST_KEY = /\/tickets(\?|$)/;

// One live connection per tab. The stream only says "ticket X changed";
// SWR then refetches that ticket and the lists over REST.
export function useTicketStream() {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    let source: EventSource | null = null;
    let stopped = false;
    let hasOpened = false;
    let failedReconnects = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const revalidateAll = () => mutate(() => true);
    const revalidateTicket = (ticketId: string) =>
      mutate((key) => typeof key === "string" && (key.includes(ticketId) || TICKET_LIST_KEY.test(key)));

    function connect() {
      source = new EventSource(`${API_BASE_URL}/stream`, { withCredentials: true });

      source.onopen = () => {
        failedReconnects = 0;
        // Events sent while we were disconnected are lost, so refetch once.
        if (hasOpened) revalidateAll();
        hasOpened = true;
      };

      source.addEventListener("ticket", (event) => {
        const { ticketId } = JSON.parse((event as MessageEvent<string>).data) as { ticketId: string };
        revalidateTicket(ticketId);
      });

      source.onerror = () => {
        // While CONNECTING the browser is retrying on its own (network blip,
        // server restart, or the stream ending at token expiry).
        if (stopped || source?.readyState !== EventSource.CLOSED) return;
        // CLOSED means the server refused the stream, usually an expired
        // access token. /auth/me goes through the interceptor, which
        // refreshes the session (or sends the user to /login).
        if (failedReconnects >= MAX_FAILED_RECONNECTS) return;
        failedReconnects += 1;
        retryTimer = setTimeout(() => {
          api
            .get("/auth/me")
            .then(() => {
              if (!stopped) connect();
            })
            .catch(() => undefined);
        }, RECONNECT_DELAY_MS);
      };
    }

    connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      source?.close();
    };
  }, [mutate]);
}
