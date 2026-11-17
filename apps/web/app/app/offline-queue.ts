"use client";

import { syncAttendanceAction, type AttendancePayload } from "./actions";

/**
 * Attendance saved while offline waits in localStorage and is re-sent when the phone is online again.
 * Each item carries a clientUuid, so sending the same register twice is applied once on the server.
 */
const KEY = "campusos.attendanceQueue.v1";

function read(): AttendancePayload[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as AttendancePayload[];
  } catch {
    return [];
  }
}
function write(q: AttendancePayload[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    // storage full or blocked: nothing more we can do on this device
  }
}

export function enqueue(p: AttendancePayload) {
  write([...read().filter((x) => !(x.sectionId === p.sectionId && x.date === p.date)), p]);
}

export function queuedCount() {
  return read().length;
}

let flushing = false;
export async function flushQueue(): Promise<number> {
  if (flushing || typeof navigator === "undefined" || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const p of read()) {
      try {
        const r = await syncAttendanceAction(p);
        // drop on success, and on a permanent error (e.g. older than 7 days) so it doesn't retry forever
        write(read().filter((x) => x.clientUuid !== p.clientUuid));
        if (!r.error) sent++;
      } catch {
        break; // still offline / server unreachable: try later
      }
    }
  } finally {
    flushing = false;
  }
  return sent;
}
