/**
 * Pakistani mobile numbers as schools write them: "0300-1234567", "03001234567", "+92 300 1234567",
 * "923001234567", "3001234567". Returns E.164 ("+923001234567") or null if it is not a PK mobile number.
 */
export function normalizePkPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("0092")) d = d.slice(4);
  else if (d.startsWith("92")) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  if (!/^3\d{9}$/.test(d)) return null;
  return `+92${d}`;
}

/** "+923001234567" -> "0300 1234567" for display. */
export function displayPkPhone(e164: string): string {
  const m = /^\+92(3\d{2})(\d{7})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]}` : e164;
}

/** Click-to-chat link: opens WhatsApp on the staff member's phone with the message ready to send. */
export function whatsappLink(e164: string, text: string): string {
  return `https://wa.me/${e164.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`;
}
