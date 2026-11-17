"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { flushQueue, queuedCount } from "./offline-queue";

/** Shows waiting offline registers and sends them when the phone is back online. */
export function SyncBanner() {
  const router = useRouter();
  const [waiting, setWaiting] = useState(0);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const tick = async () => {
      setOnline(navigator.onLine);
      if (navigator.onLine && queuedCount()) {
        const n = await flushQueue();
        if (n) router.refresh();
      }
      setWaiting(queuedCount());
    };
    void tick();
    const id = setInterval(tick, 15_000);
    window.addEventListener("online", tick);
    window.addEventListener("offline", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", tick);
      window.removeEventListener("offline", tick);
    };
  }, [router]);
  if (online && !waiting) return null;
  return (
    <div className="bg-warn-soft px-4 py-1.5 text-center text-xs font-medium text-warn print:hidden" data-testid="sync-banner">
      {!online ? "No internet." : ""} {waiting ? `${waiting} attendance register${waiting === 1 ? "" : "s"} waiting to send.` : ""}
    </div>
  );
}
