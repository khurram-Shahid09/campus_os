/**
 * The owner pitch video: one school day in the real CampusOS app (demo school), with an English AI voice-over.
 *
 *   pnpm db:seed                         # fresh demo school ending today
 *   (app running on :3000 with DEMO_LOGIN=1)
 *   node tools/demo-video/owner-video.mjs
 *
 * Output: demo-videos/campusos-owner.mp4 (portrait 720x1280, H.264 + AAC, WhatsApp friendly).
 * Voice clips come from Gemini text-to-speech and are cached in demo-videos/voice/ by text, so re-recording is free.
 * Spoken numbers are read from the database during recording, so the voice always matches the screen.
 */
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {}
const BASE = process.env.DEMO_URL ?? "http://localhost:3000";
const OUT = path.join(ROOT, "demo-videos");
const VOICE_DIR = path.join(OUT, "voice");
mkdirSync(VOICE_DIR, { recursive: true });
const SIZE = { width: 720, height: 1280 };
const VOICE = process.env.VOICE_NAME ?? "Charon";
const TEMPO = Number(process.env.VOICE_TEMPO ?? 1.1);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- voice (Gemini TTS) ----------------
const KEYS = (process.env.GEMINI_API_KEYS ?? "").split(",").map((k) => k.trim()).filter(Boolean);
const TTS_MODELS = ["gemini-3.8-flash-tts", "gemini-2.5-flash-preview-tts", "gemini-3.1-flash-tts-preview"];

function wavFromPcm(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** duration of a PCM WAV file in ms (walks the RIFF chunks) */
function wavMs(buf) {
  let off = 12, rate = 24000, channels = 1, bits = 16;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") { channels = buf.readUInt16LE(off + 10); rate = buf.readUInt32LE(off + 12); bits = buf.readUInt16LE(off + 22); }
    if (id === "data") return Math.round((Math.min(size, buf.length - off - 8) / (rate * channels * (bits / 8))) * 1000);
    off += 8 + size + (size % 2);
  }
  throw new Error("bad wav");
}

async function speak(text) {
  const file = path.join(VOICE_DIR, `${createHash("sha256").update(`${VOICE}|${text}`).digest("hex").slice(0, 16)}.wav`);
  if (!existsSync(file)) {
    let last = "";
    outer: for (const model of TTS_MODELS) {
      for (const key of KEYS) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Read this at a natural, lively pace, warm and confident, like a friendly product guide talking to a busy school owner:\n${text}` }] }],
            generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } },
          }),
        });
        const j = await r.json().catch(() => ({}));
        const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
        if (!r.ok || !part) { last = `${model}: ${j.error?.status ?? r.status}`; continue; }
        const bytes = Buffer.from(part.data, "base64");
        const rate = Number(/rate=(\d+)/.exec(part.mimeType)?.[1] ?? 24000);
        writeFileSync(file, part.mimeType.includes("wav") ? bytes : wavFromPcm(bytes, rate));
        break outer;
      }
    }
    if (!existsSync(file)) throw new Error(`Voice failed for "${text.slice(0, 40)}…": ${last}`);
  }
  // tighten: drop pauses longer than 0.6 s and speak 10% faster (still natural), so the video stays short
  const tight = file.replace(/\.wav$/, `.t${TEMPO}.wav`);
  if (!existsSync(tight)) {
    const r = spawnSync(ffmpegPath, ["-y", "-i", file, "-af",
      `silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_duration=0.6:stop_threshold=-45dB,atempo=${TEMPO}`,
      "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", tight], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr.slice(-500));
  }
  return { file: tight, ms: wavMs(readFileSync(tight)) };
}

// ---------------- numbers for the voice (from the database, not invented) ----------------
function sql(q) {
  return execFileSync("docker", ["exec", "-i", "campusos-db-1", "psql", "-U", "campusos", "-d", "campusos", "-qAt", "-F", "|"], { input: q }).toString().trim();
}
function savingsNumbers() {
  const [recovered, kept, students] = sql(`
    with s as (select id from schools where is_demo limit 1)
    select
      (select coalesce(sum(value_minor),0) from roi_events, s where school_id = s.id and kind = 'fee_recovered' and occurred_at >= date_trunc('month', now() at time zone 'Asia/Karachi') and occurred_at <= now()),
      (select coalesce(sum(value_minor),0) from roi_events, s where school_id = s.id and kind = 'concession_controlled' and occurred_at >= date_trunc('month', now() at time zone 'Asia/Karachi') and occurred_at <= now()),
      (select count(*) from students, s where school_id = s.id and status = 'active');`).split("|").map(Number);
  const measured = recovered + kept;
  const cost = students * 3000; // Rs 30 pilot price, as on the Savings page
  return { recoveredRs: Math.round(recovered / 100), multiple: Math.floor((measured * 10) / cost) / 10 };
}
const words = (rs) => (rs >= 100000 ? `about ${Math.round(rs / 10000) / 10} lakh rupees` : `about ${Math.round(rs / 1000)} thousand rupees`);

// ---------------- overlay: captions + title cards + cursor ----------------
const OVERLAY_INIT = () => {
  const install = () => {
    if (document.getElementById("__demo")) return;
    const style = document.createElement("style");
    style.textContent = `
      #__demo-cap{position:fixed;left:18px;right:18px;bottom:22px;z-index:99999;pointer-events:none;background:rgba(20,33,61,.94);color:#fff;
        font:700 24px/1.3 system-ui;padding:16px 20px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.3);transition:opacity .35s;opacity:0}
      #__demo-cap.on{opacity:1}
      #__demo-cap.top{bottom:auto;top:150px}
      #__demo-cap small{display:block;font-weight:500;font-size:17px;color:#9be3d6;margin-top:4px}
      #__demo-card{position:fixed;inset:0;z-index:100000;background:#0f766e;color:#fff;display:none;flex-direction:column;justify-content:center;padding:56px;font-family:system-ui}
      #__demo-card.on{display:flex}
      #__demo-card .k{font:700 18px/1 system-ui;letter-spacing:.14em;text-transform:uppercase;color:#9be3d6}
      #__demo-card h1{font:800 50px/1.12 system-ui;margin:16px 0 26px}
      #__demo-card li{font:500 27px/1.4 system-ui;margin:14px 0;list-style:none;padding-left:38px;position:relative}
      #__demo-card li:before{content:"✓";position:absolute;left:0;color:#9be3d6;font-weight:800}
      #__demo-card .f{margin-top:40px;font:500 17px/1.45 system-ui;color:#cdeee8}
      #__demo-cursor{position:fixed;z-index:100001;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background:rgba(255,196,0,.6);
        border:3px solid #fff;pointer-events:none;transition:transform .15s;left:-60px;top:-60px}
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
    window.__cap = (html, top) => { const c = document.getElementById("__demo-cap"); c.classList.toggle("top", !!top); if (!html) { c.classList.remove("on"); return; } c.innerHTML = html; c.classList.add("on"); };
    window.__card = (html) => { const c = document.getElementById("__demo-card"); if (!html) { c.classList.remove("on"); return; } c.innerHTML = html; c.classList.add("on"); };
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
};

// ---------------- main ----------------
const browser = await chromium.launch();

// demo login cookies for each role (outside the recording)
const cookies = {};
for (const role of ["owner", "teacher", "accountant", "principal"]) {
  const c = await browser.newContext();
  const p = await c.newPage();
  await p.goto(`${BASE}/login`);
  await p.getByTestId(`demo-${role}`).click();
  await p.waitForURL(/\/app/);
  cookies[role] = (await c.cookies()).filter((x) => x.name === "cos_session");
  await c.close();
}

// voice for the fixed scenes, made before recording so each scene knows its length
const LINES = {
  intro: "Fees come in late. Registers are on paper. And it's hard to know what's really happening in your school. CampusOS fixes that, and shows you exactly what it saves. Here's one school day.",
  brief: "Seven a.m. Your Morning Brief is ready: yesterday's fees, attendance, late staff, and students who may leave. No logging in, no phone calls.",
  teacher: "Eight o'clock. The teacher opens her class. Everyone is already present, so she taps only the absent children and submits. Seconds, even without internet. Parents are told on WhatsApp, in Urdu, automatically.",
  cash: "At the fee counter, the clerk finds the family in a few keystrokes, saves the payment, and a numbered receipt is ready, with a copy on the parent's WhatsApp. No receipt books.",
  proofs: "Parents who pay by JazzCash, Easypaisa or bank send a screenshot. CampusOS reads it, suggests the family, and the clerk approves with one tap.",
  duplicate: "An old screenshot sent again? It's caught before it becomes a fake payment.",
  reminders: "At ten, fee reminders go out by themselves: a polite message at three days late, a firmer one at ten. Every message is logged. In this demo, sending is simulated.",
  calls: "If reminders don't work, the family goes to the principal's call list, together with students whose attendance is dropping. One timely call can keep a student for years.",
  owner: "And you, the owner, decide what matters. No discount without your approval. Oldest unpaid fees first. One notice to every parent, with nothing to print.",
  outro: "CampusOS. More fees collected, less paperwork, and a clear view of your school every morning. Contact Witnex Labs for a pilot.",
};
const voice = {};
for (const [k, t] of Object.entries(LINES)) {
  voice[k] = await speak(t);
  console.log(`voice ${k}: ${(voice[k].ms / 1000).toFixed(1)} s`);
}

const ctx = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1, recordVideo: { dir: OUT, size: SIZE } });
await ctx.addInitScript(OVERLAY_INIT);
await ctx.addCookies(cookies.owner);
const page = await ctx.newPage();
const t0 = Date.now();
const placed = []; // { file, atMs }

const ready = () => page.waitForFunction(() => typeof window.__cap === "function");
let capTop = false;
let lastCap = null;
async function cap(text, sub) {
  lastCap = { text, sub };
  await ready();
  await page.evaluate(([t, s, top]) => window.__cap(t ? `${t}${s ? `<small>${s}</small>` : ""}` : "", top), [text, sub ?? "", capTop]);
}
async function card(kicker, title, points, foot) {
  await ready();
  await page.evaluate((h) => window.__card(h), `<div class="k">${kicker}</div><h1>${title}</h1><ul>${points.map((p) => `<li>${p}</li>`).join("")}</ul>${foot ? `<div class="f">${foot}</div>` : ""}`);
}
const uncard = () => page.evaluate(() => window.__card(""));
async function go(url) {
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  await ready();
  if (lastCap) await cap(lastCap.text, lastCap.sub);
}
async function asRole(role, url) {
  await ctx.clearCookies();
  await ctx.addCookies(cookies[role]);
  await go(url);
}
async function click(locator, pause = 500) {
  const el = typeof locator === "string" ? page.locator(locator).first() : locator;
  await el.evaluate((n) => n.scrollIntoView({ behavior: "smooth", block: "center" }));
  await wait(450);
  const box = await el.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 });
    await wait(200);
  }
  await el.click();
  await wait(pause);
}
async function scrollTo(locator, ms = 1000) {
  const el = typeof locator === "string" ? page.locator(locator).first() : locator;
  await el.evaluate((n) => n.scrollIntoView({ behavior: "smooth", block: "center" }));
  await wait(ms);
}
async function typeSlow(locator, text) {
  const el = page.locator(locator).first();
  await click(el, 150);
  await el.pressSequentially(text, { delay: 120 });
}
/** play one voice line while `actions` run; the scene lasts as long as the longer of the two */
async function scene(key, actions = async () => {}, tail = 700) {
  const v = typeof key === "string" ? voice[key] : key;
  placed.push({ file: v.file, atMs: Date.now() - t0 });
  await Promise.all([actions(), wait(v.ms)]);
  await wait(tail);
}

// 0. title
await go("/app/brief");
await card("CampusOS · by Witnex Labs", "The school that runs itself", [
  "Recovers late fees automatically",
  "Saves hours for teachers and office staff",
  "Removes receipt books, registers and circulars",
  "Shows the owner what it saved, every month",
], "Demo school with made-up students and numbers · voice is AI-generated");
await scene("intro");
await uncard();

// 1. 07:00 Morning Brief (owner)
await cap("7:00 · Your Morning Brief", "Yesterday's numbers, ready before you reach school");
await scene("brief", async () => {
  await wait(2500);
  await scrollTo('[data-testid="brief-text"]', 1200);
  await page.evaluate(() => window.scrollBy({ top: 400, behavior: "smooth" }));
});

// 2. 08:00 teacher
capTop = true;
await cap("8:00 · Teacher: attendance in seconds", "Tap only the absent children");
await asRole("teacher", "/app/attendance");
await scene("teacher", async () => {
  await wait(1200);
  await click('[data-testid="section-card"]', 1500);
  const kids = page.locator('[data-testid="student"]');
  await click(kids.nth(3), 700);
  await click(kids.nth(9), 700);
  await click(kids.nth(14), 1200);
  await click('[data-testid="submit-attendance"]', 600);
  await page.waitForSelector('[data-testid="attendance-done"]');
  await cap("Done. Parents of absent children told on WhatsApp", "Works offline too; syncs when the internet is back");
});
capTop = false;

// 3. 09:00 fee clerk: cash
await cap("9:00 · Fee counter", "Search, save, receipt: under a minute");
await asRole("accountant", "/app/cash");
// a family with one overdue month; searched by a child's GR number (names can repeat, GR numbers can't)
const grNo = sql(`select min(st.admission_no) from students st join schools s on s.id = st.school_id
  where s.is_demo and st.status = 'active' and st.family_id = (
    select i.family_id from invoices i where i.school_id = s.id and i.balance_minor > 0 and i.due_date < current_date
    group by i.family_id having count(*) = 1 order by i.family_id limit 1);`);
await scene("cash", async () => {
  await typeSlow('[data-testid="family-search"]', grNo);
  await wait(900);
  await click(page.getByTestId("family-hit").first(), 1500);
  await click('[data-testid="cash-submit"]', 300);
  await page.waitForURL(/receipts\//);
  await ready();
  await cap("Receipt #, printed and sent to the parent's WhatsApp", "No receipt book");
  await wait(1800);
  await scrollTo('[data-testid="receipt"]', 800);
});

// 4. screenshots
await cap("Payment screenshots", "Read, matched to the family, approved with one tap");
await go("/app/proofs");
await scene("proofs", async () => {
  await wait(1200);
  await scrollTo(page.getByTestId("proof-card").first(), 2200);
  await click(page.getByTestId("proof-approve").first(), 300);
  await page.waitForURL(/receipts\//);
  await ready();
  await wait(1200);
});
await go("/app/proofs");
await cap("An old screenshot sent again?", "Caught before it becomes a fake payment");
await scene("duplicate", async () => {
  await scrollTo(page.getByTestId("proof-warnings").last(), 1500);
});

// numbers for the savings line: read now, after the payments above
const nums = savingsNumbers();
const savingsLine = `So, what did it save you? This month, CampusOS recovered ${words(nums.recoveredRs)} in late fees: about ${nums.multiple >= 2 ? Math.floor(nums.multiple) : nums.multiple} times what it costs. Time and paper savings are shown too, marked as estimates.`;
const savingsVoice = speak(savingsLine);

// 5. 10:00 reminders + WhatsApp log (principal can see both)
await cap("10:00 · Reminders go out by themselves", "Every message logged · simulated in this demo");
await asRole("principal", "/app/automation");
await scene("reminders", async () => {
  await wait(3000);
  await go("/app/outbox");
  await wait(2000);
  await page.evaluate(() => window.scrollBy({ top: 500, behavior: "smooth" }));
});

// 6. principal call list
await cap("The principal's call list", "Fees reminders couldn't recover · students who may leave");
await go("/app/calls");
await scene("calls", async () => {
  await wait(3000);
  await scrollTo('[data-testid="risk-list"]', 2500);
  await page.evaluate(() => window.scrollBy({ top: 350, behavior: "smooth" }));
});

// 7. owner decisions
await cap("Owner: decisions, not paperwork", "Discounts need your OK · oldest money first · one-tap notices");
await asRole("owner", "/app");
await scene("owner", async () => {
  await wait(1500);
  await click(page.getByTestId("reject-discount").first(), 1500);
  await scrollTo("text=Unpaid fees by age", 2500);
  await go("/app/notices");
  await wait(1500);
});

// 8. savings
await cap("What CampusOS saved you", "Money measured from records · time and paper labelled as estimates");
await go("/app/savings");
await scene(await savingsVoice, async () => {
  await wait(4000);
  await page.evaluate(() => window.scrollBy({ top: 450, behavior: "smooth" }));
});

// 9. outro
await cap("");
await card("What CampusOS saves", "Money · Time · Effort", [
  "Money: late fees recovered, discounts controlled",
  "Time: attendance in seconds, no fee phone calls",
  "Effort: no receipt books, registers or circulars",
  "Decisions: Morning Brief and dropout warnings",
], "Contact Witnex Labs for a pilot · demo school, made-up data · AI voice");
await scene("outro", async () => {}, 1500);

const videoPath = await page.video().path();
await ctx.close();
await browser.close();

// ---------------- mix voice onto video ----------------
const mp4 = path.join(OUT, "campusos-owner.mp4");
const inputs = ["-y", "-i", videoPath, ...placed.flatMap((p) => ["-i", p.file])];
const filters = placed.map((p, i) => `[${i + 1}:a]adelay=${p.atMs}|${p.atMs},aresample=48000[a${i}]`).join(";");
const mix = `${filters};${placed.map((_, i) => `[a${i}]`).join("")}amix=inputs=${placed.length}:normalize=0:dropout_transition=0,volume=1.6[aout]`;
const r = spawnSync(ffmpegPath, [...inputs, "-filter_complex", mix, "-map", "0:v", "-map", "[aout]", "-c:v", "libx264", "-preset", "medium", "-crf", "23",
  "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", mp4], { encoding: "utf8" });
if (r.status !== 0) {
  console.error(r.stderr.slice(-2000));
  process.exit(1);
}
rmSync(videoPath);
const dur = (Date.now() - t0) / 1000;
console.log(`Wrote ${mp4} (${dur.toFixed(0)} s, ${placed.length} voice clips). Savings line: "${savingsLine}"`);
