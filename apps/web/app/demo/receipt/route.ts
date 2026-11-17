import { formatMoney } from "@campusos/core";

/**
 * Generic, unbranded demo payment receipt image, drawn from the proof's own data so the picture and the
 * "read" values always match. Clearly marked as a demo, not a real transaction.
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function GET(req: Request) {
  const u = new URL(req.url);
  const amountMinor = Math.max(0, Math.min(1e10, Math.round(Number(u.searchParams.get("a")) || 0)));
  const ref = esc((u.searchParams.get("r") ?? "TRX00000000").slice(0, 20));
  const kind = esc((u.searchParams.get("k") ?? "Mobile wallet transfer").slice(0, 40));
  const date = esc((u.searchParams.get("d") ?? "").slice(0, 20));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640" viewBox="0 0 360 640">
  <rect width="360" height="640" fill="#f4f5f7"/>
  <rect width="360" height="120" fill="#3b4a5a"/>
  <text x="180" y="52" fill="#fff" font-family="Arial, sans-serif" font-size="18" text-anchor="middle">${kind}</text>
  <text x="180" y="84" fill="#cfd8e3" font-family="Arial, sans-serif" font-size="13" text-anchor="middle">DEMO RECEIPT · NOT A REAL TRANSACTION</text>
  <circle cx="180" cy="180" r="34" fill="#2e7d5b"/>
  <path d="M164 181 l11 11 l22 -24" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/>
  <text x="180" y="250" fill="#2e7d5b" font-family="Arial, sans-serif" font-size="17" text-anchor="middle">Transaction successful</text>
  <text x="180" y="305" fill="#111" font-family="Arial, sans-serif" font-size="38" font-weight="bold" text-anchor="middle">${esc(formatMoney(amountMinor))}</text>
  <g font-family="Arial, sans-serif" font-size="14" fill="#444">
    <text x="32" y="370">To</text><text x="328" y="370" text-anchor="end">Demo Grammar School</text>
    <text x="32" y="405">Reference</text><text x="328" y="405" text-anchor="end">${ref}</text>
    <text x="32" y="440">Date</text><text x="328" y="440" text-anchor="end">${date}</text>
    <text x="32" y="475">Fee</text><text x="328" y="475" text-anchor="end">Rs 0</text>
  </g>
  <line x1="32" y1="500" x2="328" y2="500" stroke="#d5d9df"/>
  <text x="180" y="560" fill="#8a94a3" font-family="Arial, sans-serif" font-size="12" text-anchor="middle">Synthetic image for CampusOS demo</text>
</svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
}
