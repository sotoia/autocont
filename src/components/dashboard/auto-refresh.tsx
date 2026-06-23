"use client";
import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Silently refreshes the current server component tree every `intervalMs`.
 * Intended to poll DB-backed pages while background jobs are running.
 * Unmounts itself when `active` becomes false — the consumer decides when to stop.
 */
export function AutoRefresh({
  active,
  intervalMs = 2500,
}: {
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();
  React.useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);
  return null;
}
