/**
 * Records one ~1-minute demo video per role from the running demo app (http://localhost:3000).
 *   pnpm db:seed && pnpm --filter @campusos/demo-video record [role ...]
 * Output: demo-videos/<n>-<role>.webm and .mp4 (portrait 540x960, phone/WhatsApp friendly).
 * Captions are drawn on the page; every video carries a DEMO DATA tag.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "playwright";

const BASE = process.env.DEMO_URL ?? "http://localhost:3000";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "demo-videos");
const SIZE = { width: 540, height: 960 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- overlay: captions, title cards, cursor ----------
const OVERLAY_INIT = () => {
  const install = () => {
    if (document.getElementById("__demo")) return;
    const style = document.createElement("style");
    style.textContent = `
      #__demo-tag{position:fixed;top:8px;right:8px;z-index:99999;pointer-events:none;background:#b45309;color:#fff;font:700 10px/1 system-ui;padding:4px 7px;border-radius:999px;letter-spacing:.06em}
      #__demo-cap{position:fixed;left:12px;right:12px;top:52px;z-index:99999;pointer-events:none;background:rgba(20,33,61,.94);color:#fff;
        font:600 17px/1.35 system-ui;padding:12px 14px;border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.25);
        transition:opacity .35s, transform .35s;opacity:0;transform:translateY(-8px)}
      #__demo-cap.on{opacity:1;transform:none}
      #__demo-cap small{display:block;font-weight:500;font-size:13px;color:#9be3d6;margin-top:3px}
      #__demo-card{position:fixed;inset:0;z-index:100000;background:#0f766e;color:#fff;display:none;flex-direction:column;
        justify-content:center;padding:36px;font-family:system-ui}
      #__demo-card.on{display:flex}
      #__demo-card .k{font:700 13px/1 system-ui;letter-spacing:.14em;text-transform:uppercase;color:#9be3d6}
      #__demo-card h1{font:800 34px/1.15 system-ui;margin:12px 0 18px}
      #__demo-card li{font:500 18px/1.4 system-ui;margin:10px 0;list-style:none;padding-left:26px;position:relative}
      #__demo-card li:before{content:"✓";position:absolute;left:0;color:#9be3d6;font-weight:800}
      #__demo-card .f{margin-top:28px;font:500 12px/1.4 system-ui;color:#cdeee8}
      #__demo-cursor{position:fixed;z-index:100001;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
        background:rgba(255,196,0,.55);border:2px solid #fff;pointer-events:none;transition:transform .15s;left:-50px;top:-50px}
      #__demo-cursor.down{transform:scale(.7)}`;
    document.head.appendChild(style);
    const root = document.createElement("div");
    root.id = "__demo";
    root.innerHTML = `<div id="__demo-cap"></div><div id="__demo-card"></div><div id="__demo-cursor"></div>`;
    document.body.appendChild(root);
    const cur = document.getElementById("__demo-cursor");
    addEventListener("mousemove", (e) => { cur.style.left = e.clientX + "px"; cur.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => cur.classList.add("down"), true);
    addEventListener("mouseup", () => cur.classList.remove("down"), true);
    window.__cap = (html) => { const c = document.getElementById("__demo-cap"); if (!html) { c.classList.remove("on"); return; } c.innerHTML = html; c.classList.add("on"); };
    window.__card = (html) => { const c = document.getElementById("__demo-card"); if (!html) { c.classList.remove("on"); return; } c.innerHTML = html; c.classList.add("on"); };
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
};

function makeHelpers(page) {
  let lastCap = null;
  const ready = () => page.waitForFunction(() => typeof window.__cap === "function");
  const cap = async (text, sub, ms = 0) => {
    lastCap = { text, sub };
    await ready();
    await page.evaluate(([t, s]) => window.__cap(t ? `${t}${s ? `<small>${s}</small>` : ""}` : ""), [text, sub ?? ""]);
    if (ms) await wait(ms);
  };
  const card = async (kicker, title, points, foot, ms) => {
    await ready();
    const html = `<div class="k">${kicker}</div><h1>${title}</h1><ul>${points.map((p) => `<li>${p}</li>`).join("")}</ul>${foot ? `<div class="f">${foot}</div>` : ""}`;
    await page.evaluate((h) => window.__card(h), html);
    await wait(ms);
    await page.evaluate(() => window.__card(""));
  };
  const go = async (url) => {
    await page.goto(BASE + url, { waitUntil: "networkidle" });
    await ready();
    if (lastCap) await cap(lastCap.text, lastCap.sub);
  };
  const click = async (locator, { pause = 500 } = {}) => {
    const el = typeof locator === "string" ? page.locator(locator).first() : locator;
    await el.scrollIntoViewIfNeeded();
    const box = await el.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
      await wait(200);
    }
    await el.click();
    await wait(pause);
  };
  const scrollTo = async (locator, ms = 900) => {
    const el = typeof locator === "string" ? page.locator(locator).first() : locator;
    await el.evaluate((n) => n.scrollIntoView({ behavior: "smooth", block: "center" }));
    await wait(ms);
  };
  const scrollBy = async (y, ms = 900) => {
    await page.evaluate((dy) => window.scrollBy({ top: dy, behavior: "smooth" }), y);
    await wait(ms);
  };
  const type = async (locator, text) => {
    const el = page.locator(locator).first();
    await click(el, { pause: 150 });
    await el.pressSequentially(text, { delay: 110 });
  };
  return { cap, card, go, click, scrollTo, scrollBy, type };
}

// ---------- role scripts (each ~55–65 s) ----------
const ROLES = {
  async teacher(page, h) {
    await h.go("/demo/teacher");
    await h.card("CampusOS · Teacher", "Attendance in 30 seconds", [
      "Everyone present by default",
      "Tap only the absent children",
      "Parents told automatically, in Urdu",
    ], "Demo with synthetic data", 4500);
    await h.cap("Ms. Teacher opens her phone. Classes still to mark are in orange.", "Works offline in the real app, syncs later", 4500);
    await h.click('[data-testid="unmarked-section"]', { pause: 1200 });
    await h.cap("The whole class is already marked present.", "No calling 35 names one by one", 4000);
    const kids = page.locator('[data-testid="student"]');
    await h.cap("Tap only who is absent…");
    await h.click(kids.nth(2), { pause: 900 });
    await h.click(kids.nth(7), { pause: 900 });
    await h.click(kids.nth(11), { pause: 1200 });
    await h.cap("…and submit.", "Watch the timer", 1500);
    await h.click('[data-testid="submit-attendance"]', { pause: 300 });
    await page.waitForSelector('[data-testid="attendance-done"]');
    await h.cap("Done. Seconds, not 5–10 minutes.", "Saves about 2 hours of teaching time per class every month (estimate)", 5000);
    await h.cap("Parents of the 3 absent children just got a voice note on WhatsApp.", "Works even for parents who can't read", 5000);
    await h.cap("The monthly register fills itself. No totalling at month end.", "Repeated absences go to the principal's watch list", 5000);
    await h.cap("");
    await h.card("What the teacher saves", "More time teaching", [
      "Roll call: 30 sec instead of 5–10 min",
      "No monthly register totals",
      "No phoning parents about absences",
    ], "CampusOS · Witnex Labs · estimates labelled as estimates", 6000);
  },

  async parent(page, h) {
    await h.go("/demo/parent");
    await h.card("CampusOS · Parent", "No app. No reading needed.", [
      "Everything arrives on normal WhatsApp",
      "Urdu voice notes for every message",
      "Fee slip as a picture with one big number",
    ], "Demo with synthetic data", 4500);
    await h.cap("This is what a father sees on his own phone.", "Nothing to install, no password", 3500);
    await h.click('[data-testid="parent-family"]', { pause: 1500 });
    await page.locator('[data-testid="chat"]').evaluate((n) => (n.scrollTop = 0));
    await h.cap("Every month the fee slip arrives as a picture:", "Child's name, the amount, the last date and a payment code", 3500);
    const slip = page.locator('[data-testid="chat"] [data-testid="fee-slip"]').first();
    if (await slip.count()) await h.scrollTo(slip, 3000);
    await h.cap("Reminders come as Urdu voice notes. He just presses play.", "First polite, then firmer, then an automated call", 3500);
    const note = page.locator('[data-testid="voice-note"]').last();
    await h.scrollTo(note, 800);
    await h.click(note.getByText("show words"), { pause: 3500 });
    await page.locator('[data-testid="chat"]').evaluate((n) => (n.scrollTop = n.scrollHeight));
    await h.cap("He can ask in his own words: “Fee kitni hai?”", "CampusOS answers instantly from the school's records", 2500);
    await h.click('[data-testid="ask-balance"]', { pause: 2500 });
    await page.locator('[data-testid="chat"]').evaluate((n) => (n.scrollTop = n.scrollHeight));
    await h.cap("The exact amount comes back. No call to the office.", "", 3500);
    await h.cap("He pays at a wallet shop and sends the screenshot.", "", 2000);
    await h.click('[data-testid="send-screenshot"]', { pause: 2500 });
    await page.locator('[data-testid="chat"]').evaluate((n) => (n.scrollTop = n.scrollHeight));
    await h.cap("The school confirms it with one tap, and a receipt comes back.", "No queue at the fee counter", 4500);
    await h.cap("");
    await h.card("What the parent gets", "Simple for parents, less work for the school", [
      "Voice notes for parents who can't read",
      "Balance anytime, without calling",
      "Pay from a wallet shop, receipt on WhatsApp",
    ], "CampusOS · Witnex Labs", 6000);
  },

  async clerk(page, h) {
    await h.go("/demo/clerk");
    await h.card("CampusOS · Fee clerk", "The fee counter, without the paperwork", [
      "Cash entry in seconds, receipt sent automatically",
      "Wallet screenshots matched for one-tap approval",
      "Reused screenshots caught",
    ], "Demo with synthetic data", 4500);
    await h.cap("A mother pays cash at the counter. Search by child or family name.", "", 1500);
    await h.type('[data-testid="family-search"]', "Khan");
    await page.waitForSelector('[data-testid="family-result"]');
    await h.cap("Everything they owe is right there, oldest month first.", "", 1000);
    await h.click('[data-testid="family-result"]', { pause: 2500 });
    await h.cap("Amount is pre-filled. One tap.", "No receipt book, no carbon copy", 1500);
    await h.click('[data-testid="cash-submit"]', { pause: 300 });
    await page.waitForSelector('[data-testid="cash-done"]');
    await h.cap("Done. The receipt went to the parent on WhatsApp, in Urdu.", "Every payment is logged with who entered it", 5000);
    const proofs = page.locator('[data-testid="proof"]');
    await h.scrollTo(proofs.first(), 800);
    await h.cap("Parents also send wallet screenshots. CampusOS reads them and finds the family.", "No matching against bank statements", 4500);
    await h.click('[data-testid="approve-proof"]', { pause: 2500 });
    await h.cap("Approved with one tap. Balance updated, receipt sent.", "", 3000);
    const dup = page.locator('[data-testid="reject-duplicate"]');
    if (await dup.count()) {
      await h.scrollTo(dup, 600);
      await h.cap("This one is the same screenshot used before. Flagged.", "Stops fake and reused payment proofs", 4000);
      await h.click(dup, { pause: 1500 });
    }
    await h.go("/demo/clerk/slips");
    await h.cap("Fee slips go out on the 1st, as pictures. Nothing to print.", "", 4000);
    await h.scrollTo("text=Fee rule check", 800);
    await h.cap("Before raising fees, CampusOS checks the common rules.", "5% yearly limit, no advance summer fees", 2500);
    await page.locator("label:has-text('Collect June') input").check();
    await wait(2500);
    await h.cap("");
    await h.card("What the fee office saves", "Hours every day", [
      "No receipt books or handwritten challans",
      "No matching screenshots to bank statements",
      "Fake or reused screenshots caught",
    ], "CampusOS · Witnex Labs · estimates labelled as estimates", 6000);
  },

  async principal(page, h) {
    await h.go("/demo/principal");
    await h.card("CampusOS · Principal", "Everything that needs you, on one screen", [
      "Students about to leave, with a call list",
      "Classes not marked, teachers late or absent",
      "Fee cases reminders could not solve",
    ], "Demo with synthetic data", 4500);
    await h.cap("8:30 a.m. The principal sees the whole school at a glance.", "No walking class to class collecting registers", 5000);
    await h.scrollTo('[data-testid="call-item"]', 800);
    await h.cap("These children may leave: attendance falling and fees unpaid.", "Spotted weeks before they disappear", 5000);
    await h.cap("She calls the first family and logs the result with one tap.", "", 1500);
    await h.click('[data-testid="outcome-will_return"]', { pause: 2000 });
    await h.cap("Logged. Keeping one student keeps a full year of fees.", "", 4500);
    await h.scrollTo("text=Classes not marked yet", 800);
    await h.cap("Classes not marked yet. Teachers get an automatic nudge at 9:00.", "", 4500);
    await h.scrollTo("text=Staff not on time today", 800);
    await h.cap("Who is late or absent today, so cover can be arranged.", "", 4500);
    await h.scrollTo("text=Fee cases for you", 800);
    await h.cap("Only the fee cases that voice notes, messages and calls could not solve.", "Everything else is chased automatically", 5000);
    await h.cap("");
    await h.card("What the principal saves", "Time for what matters", [
      "One call list instead of guesswork",
      "Know absences by 8:30, not by lunch",
      "Only hard fee cases reach her",
    ], "CampusOS · Witnex Labs", 6000);
  },

  async owner(page, h) {
    await h.go("/demo/owner");
    await h.card("CampusOS · Owner", "See what CampusOS earns you", [
      "Money recovered vs. what it costs",
      "Unpaid fees and students at risk",
      "A Morning Brief on WhatsApp, no login",
    ], "Demo with synthetic data", 4500);
    const amount = (await page.locator("section.bg-brand p.text-4xl").first().textContent())?.trim() ?? "";
    await h.cap(`This month CampusOS brought in ${amount}, measured from payments.`, "Synthetic demo school. Real schools see their own numbers.", 5500);
    await h.scrollTo("text=Fees recovered by reminders", 800);
    await h.cap("Measured savings and estimates are kept apart.", "Every estimate shows its assumption", 4500);
    const approvals = page.locator('[data-testid="approvals"]');
    if (await approvals.count()) {
      await h.scrollTo(approvals, 800);
      await h.cap("No more silent discounts. Each request waits for the owner.", "", 2500);
      await h.click('[data-testid="reject-discount"]', { pause: 2000 });
    }
    await h.scrollTo("text=Unpaid fees", 800);
    await h.cap("Unpaid fees by how late they are. Reminders run automatically.", "", 4500);
    await h.scrollTo("text=Students you may lose", 800);
    await h.cap("Students likely to leave, with the reasons.", "Each one kept is a year of fees", 4500);
    await h.go("/demo/owner/brief");
    await h.cap("And every morning at 7:30, this arrives on WhatsApp.", "The owner never has to log in", 4500);
    await h.scrollTo('[data-testid="brief-text"]', 3500);
    await h.cap("Also as an Urdu voice note.", "Numbers come from records, never made up by AI", 3500);
    await h.cap("");
    await h.card("What the owner gets", "CampusOS pays for itself, and proves it", [
      "Fees recovered automatically",
      "Discounts and fake receipts stopped",
      "The whole school in one WhatsApp message",
    ], "CampusOS · Witnex Labs · demo numbers are synthetic", 6000);
  },
};

const ORDER = ["teacher", "parent", "clerk", "principal", "owner"];

async function recordRole(browser, role, index) {
  const tmp = path.join(OUT, `.tmp-${role}`);
  rmSync(tmp, { recursive: true, force: true });
  const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1, recordVideo: { dir: tmp, size: SIZE }, locale: "en-GB" });
  await context.addInitScript(OVERLAY_INIT);
  const page = await context.newPage();
  const h = makeHelpers(page);
  const started = Date.now();
  try {
    await ROLES[role](page, h);
  } finally {
    const video = page.video();
    await context.close();
    const name = `${index + 1}-${role}`;
    const webm = path.join(OUT, `${name}.webm`);
    await video.saveAs(webm);
    rmSync(tmp, { recursive: true, force: true });
    const mp4 = path.join(OUT, `${name}.mp4`);
    const r = spawnSync(ffmpegPath, ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-crf", "23", mp4]);
    if (r.status === 0) rmSync(webm, { force: true });
    console.log(`${role}: ${Math.round((Date.now() - started) / 1000)}s -> ${r.status === 0 ? mp4 : webm + " (mp4 failed: " + r.stderr + ")"}`);
  }
}

const wanted = process.argv.slice(2).filter((r) => ORDER.includes(r));
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const role of wanted.length ? wanted : ORDER) await recordRole(browser, role, ORDER.indexOf(role));
} finally {
  await browser.close();
}
