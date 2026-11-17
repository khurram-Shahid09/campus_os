/** Money is always integer minor units (paisa). Never floats. */
export type Minor = number;

const DIGITS = /\B(?=(\d{3})+(?!\d))/g;

/** Format minor units as a whole-rupee string, e.g. 12000000 -> "Rs 120,000". */
export function formatMoney(amountMinor: Minor, currency = "PKR"): string {
  if (!Number.isSafeInteger(amountMinor)) throw new Error("amountMinor must be a safe integer");
  const negative = amountMinor < 0;
  const major = Math.round(Math.abs(amountMinor) / 100);
  const body = String(major).replace(DIGITS, ",");
  const symbol = currency === "PKR" ? "Rs" : currency;
  return `${negative ? "-" : ""}${symbol} ${body}`;
}

export function toMinor(major: number): Minor {
  return Math.round(major * 100);
}
