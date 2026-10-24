"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { homeFor, useMe } from "@/lib/auth";

// Sends the visitor to their portal, or to /login when signed out.
export default function Home() {
  const { me, error } = useMe();
  const router = useRouter();

  useEffect(() => {
    if (me) router.replace(homeFor(me.role));
    else if (error) router.replace("/login");
  }, [me, error, router]);

  return (
    <div className="flex flex-1 items-center justify-center p-8 text-sm text-neutral-500">
      Loading…
    </div>
  );
}
