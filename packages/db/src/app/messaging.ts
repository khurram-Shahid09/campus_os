/**
 * WhatsApp delivery mode (D18). Until the WhatsApp Business API is connected, messages are "simulated": every
 * automatic trigger still creates the message and the app shows it as sent automatically, but nothing leaves the
 * server. Staff can still send any message for real with one tap (wa.me), which is then recorded as really sent.
 *   simulated (default) | manual (staff send everything from an outbox) | cloud_api (not built yet: messages wait)
 */
export type WhatsappMode = "simulated" | "manual" | "cloud_api";

export function whatsappMode(env: NodeJS.ProcessEnv = process.env): WhatsappMode {
  const m = env.WHATSAPP_MODE;
  return m === "manual" || m === "cloud_api" ? m : "simulated";
}

/** Status a new outgoing message starts with. */
export function newMessageStatus(mode = whatsappMode()): "simulated" | "outbox" | "pending_api" {
  return mode === "simulated" ? "simulated" : mode === "manual" ? "outbox" : "pending_api";
}

/** Statuses that mean a parent really received the message (only these earn "recovered by reminder" credit). */
export const REALLY_SENT = ["sent_manual", "sent", "delivered", "read"];
