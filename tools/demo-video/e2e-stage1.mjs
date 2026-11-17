/**
 * End-to-end check of the working app (Stage 1) in a real browser, as three real logins:
 * owner signs up -> uploads register -> sets fees -> invites clerk + teacher -> makes fee slips;
 * clerk takes a cash payment -> receipt; teacher marks attendance (also offline); owner sees it all.
 *
 * Needs: app running on :3000 with OTP_DEV_SHOW=1, Docker container campusos-db-1.
 * Run: node tools/demo-video/e2e-stage1.mjs   (cleans up its own test school before starting)
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve("demo-videos/e2e");
mkdirSync(OUT, { recursive: true });
const PHONES = { owner: "0309 0000101", clerk: "0309 0000102", teacher: "0309 0000103" };
const E164 = Object.values(PHONES).map((p) => "+92" + p.replace(/\D/g, "").slice(1));

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", "campusos-db-1", "psql", "-U", "campusos", "-d", "campusos", "-v", "ON_ERROR_STOP=1", "-qAt"], { input: sql }).toString();
}

function cleanup() {
  const list = E164.map((p) => `'${p}'`).join(",");
  psql(`
    DO $$ DECLARE ids uuid[]; t text; BEGIN
      SELECT array_agg(DISTINCT m.school_id) INTO ids FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.phone_e164 IN (${list});
      IF ids IS NOT NULL THEN
        FOR t IN SELECT table_name FROM information_schema.columns WHERE column_name = 'school_id' AND table_schema = 'public' LOOP
          EXECUTE format('DELETE FROM %I WHERE school_id = ANY($1)', t) USING ids;
        END LOOP;
        DELETE FROM schools WHERE id = ANY(ids);
      END IF;
      DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE phone_e164 IN (${list}));
      DELETE FROM otp_challenges WHERE phone_e164 IN (${list});
      DELETE FROM users WHERE phone_e164 IN (${list});
    END $$;`);
}

const REGISTER = [
  "GR No,Student Name,Father Name,Class,Section,Mobile No,Monthly Fee,Gender",
  "1,Ali Hassan,Hassan Raza,Class 1,A,0300-5550001,3000,Boy",
  "2,Fatima Hassan,Hassan Raza,Class 3,A,0300-5550001,3500,Girl",
  "3,Omar Khalid,Khalid Mehmood,Class 1,A,0300-5550002,3000,Boy",
  "4,Hira Asif,Asif Ali,Class 1,A,0300-5550003,2500,Girl",
  "5,Bilal Ahmed,Ahmed Nawaz,Class 3,A,0300-5550004,3500,Boy",
].join("\r\n");

let step = 0;
const results = [];
async function check(name, fn) {
  step++;
  try {
    await fn();
    results.push(`✓ ${step}. ${name}`);
    console.log(`✓ ${step}. ${name}`);
  } catch (e) {
    results.push(`✗ ${step}. ${name}: ${e.message.split("\n")[0]}`);
    console.log(`✗ ${step}. ${name}\n${e.stack}`);
    throw e;
  }
}

async function login(page, phone) {
  await page.goto(`${BASE}/login`);
  await page.getByTestId("login-phone").fill(phone);
  await page.getByTestId("login-send").click();
  const code = (await page.getByTestId("dev-code").locator("b").textContent()).trim();
  await page.getByTestId("login-code").fill(code);
  await page.getByTestId("login-verify").click();
}

const expectText = async (loc, re) => {
  const until = Date.now() + 15000;
  let t = "";
  while (Date.now() < until) {
    t = (await loc.textContent({ timeout: 15000 })) ?? "";
    if (re.test(t)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`expected ${re} in "${t.slice(0, 300)}"`);
};

cleanup();
const browser = await chromium.launch();
const shot = (page, n) => page.screenshot({ path: path.join(OUT, `${String(step).padStart(2, "0")}-${n}.png`), fullPage: true });

try {
  // ---------------- owner ----------------
  const ownerCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const owner = await ownerCtx.newPage();

  await check("owner logs in with phone + code and creates the school", async () => {
    await login(owner, PHONES.owner);
    await owner.waitForURL(/onboarding/);
    await owner.getByTestId("owner-name").fill("Test Owner");
    await owner.getByTestId("school-name").fill("E2E Test School");
    await owner.getByTestId("create-school").click();
    await owner.waitForURL(/\/app$/);
    await expectText(owner.getByTestId("school-title"), /E2E Test School/);
    await shot(owner, "owner-home-empty");
  });

  await check("owner uploads the register: 5 students, siblings grouped, classes created", async () => {
    await owner.goto(`${BASE}/app/students/import`);
    await owner.getByTestId("import-file").setInputFiles({ name: "register.csv", mimeType: "text/csv", buffer: Buffer.from(REGISTER) });
    await expectText(owner.getByTestId("import-students"), /^5$/);
    await shot(owner, "import-preview");
    await owner.getByTestId("import-commit").click();
    await expectText(owner.getByTestId("import-done"), /Imported 5 students in 4 new families, created 2 classes/);
  });

  await check("class fees were taken from the register and can be edited", async () => {
    await owner.goto(`${BASE}/app/setup`);
    const c1 = owner.getByLabel("Tuition fee for Class 1");
    if ((await c1.inputValue()) !== "3000") throw new Error("Class 1 fee should be 3000, got " + (await c1.inputValue()));
    await owner.getByLabel("Tuition fee for Class 3").fill("3600");
    await owner.getByTestId("save-fees").click();
    await expectText(owner.getByTestId("fee-grid"), /Saved 1 fee/);
  });

  await check("owner gives logins to a fee clerk and a teacher", async () => {
    const inv = owner.getByTestId("invite");
    for (const [name, phone, role] of [["Clerk Sajid", PHONES.clerk, "accountant"], ["Miss Ayesha", PHONES.teacher, "teacher"]]) {
      await inv.locator('input[name="name"]').fill(name);
      await inv.locator('input[name="phone"]').fill(phone);
      await inv.locator('select[name="role"]').selectOption(role);
      await inv.getByRole("button", { name: "Give access" }).click();
      await expectText(inv, new RegExp(`${name} can now log in`));
    }
    await expectText(owner.getByTestId("team"), /Clerk Sajid.*Miss Ayesha|Miss Ayesha.*Clerk Sajid/s);
  });

  await check("owner makes Miss Ayesha class teacher of Class 1 A", async () => {
    await owner.goto(`${BASE}/app/staff`);
    const sel = owner.getByLabel("Class teacher for Class 1 A");
    await sel.selectOption({ label: "Miss Ayesha" });
    await sel.locator("xpath=ancestor::form").getByRole("button", { name: "Save" }).click();
    await owner.waitForTimeout(800);
  });

  await check("owner makes this month's fee slips: 4 families, Rs 15,700; running again adds none", async () => {
    await owner.goto(`${BASE}/app/fees`);
    const form = owner.getByTestId("invoice-run");
    const month = await form.locator('input[name="period"]').inputValue();
    await form.getByTestId("run-invoices").click();
    // Hassan 3000 + 3600, Khalid 3000, Asif 2500 (her own fee), Ahmed 3600 = 15,700
    await expectText(form, /4 fee slips made, total Rs 15,700/);
    await form.getByTestId("run-invoices").click();
    await expectText(form, /No new slips\. 4 families already/);
    await owner.goto(`${BASE}/app/fees/slips?period=${month}`);
    await shot(owner, "fee-slips");
  });

  // ---------------- clerk ----------------
  const clerkCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const clerk = await clerkCtx.newPage();
  let receiptUrl = "";

  await check("fee clerk logs in and sees the cash counter, not setup", async () => {
    await login(clerk, PHONES.clerk);
    await clerk.waitForURL(/\/app$/);
    await clerk.goto(`${BASE}/app/setup`);
    await clerk.waitForURL(/denied=1/);
  });

  await check("clerk finds the Hassan family by phone digits and takes Rs 4,000 cash", async () => {
    await clerk.goto(`${BASE}/app/cash`);
    await clerk.getByTestId("family-search").fill("5550001");
    await clerk.getByTestId("family-hit").first().click();
    await clerk.getByTestId("cash-amount").fill("4000");
    await clerk.getByTestId("cash-submit").click();
    await clerk.waitForURL(/receipts\//);
    receiptUrl = clerk.url().split("?")[0];
    await expectText(clerk.getByTestId("payment-saved"), /Receipt #1/);
    await expectText(clerk.getByTestId("receipt"), /Rs 4,000/);
    await shot(clerk, "receipt");
  });

  await check("clerk cannot reverse a payment (owner only)", async () => {
    if (await clerk.getByRole("button", { name: "Reverse" }).count()) throw new Error("Reverse button visible to clerk");
  });

  // ---------------- teacher ----------------
  const teacherCtx = await browser.newContext({ viewport: { width: 400, height: 860 }, isMobile: true, hasTouch: true });
  const teacher = await teacherCtx.newPage();

  await check("teacher logs in on a phone and sees only her class", async () => {
    await login(teacher, PHONES.teacher);
    await teacher.waitForURL(/attendance/);
    const cards = teacher.getByTestId("section-card");
    if ((await cards.count()) !== 1) throw new Error(`expected 1 class, saw ${await cards.count()}`);
    await expectText(cards.first(), /Class 1 A/);
  });

  await check("teacher marks Omar absent and submits; the parent is told on WhatsApp", async () => {
    await teacher.getByTestId("section-card").first().click();
    await teacher.getByTestId("student").filter({ hasText: "Omar" }).click();
    await shot(teacher, "register");
    await teacher.getByTestId("submit-attendance").click();
    await expectText(teacher.getByTestId("attendance-done"), /1 absent; 1 parent told on WhatsApp/);
  });

  await check("with no internet, the correction is saved on the phone and sent when back online", async () => {
    await teacher.reload();
    await teacher.getByTestId("student").filter({ hasText: "Hira" }).click();
    await teacherCtx.setOffline(true);
    await teacher.getByTestId("submit-attendance").click();
    await teacher.getByTestId("attendance-queued").waitFor();
    await shot(teacher, "offline-queued");
    await teacherCtx.setOffline(false);
    await teacher.evaluate(() => window.dispatchEvent(new Event("online")));
    await teacher.waitForFunction(() => (localStorage.getItem("campusos.attendanceQueue.v1") ?? "[]") === "[]", null, { timeout: 20000 });
  });

  // ---------------- owner again ----------------
  await check("owner home shows today's collection and attendance", async () => {
    await owner.goto(`${BASE}/app`);
    await expectText(owner.locator("main"), /Collected today\s*Rs 4,000/);
    await expectText(owner.locator("main"), /Class 1 A · 2 absent/);
    await shot(owner, "owner-home");
  });

  await check("WhatsApp log shows 7 automatic messages (4 fee slips, receipt, 2 absences), clearly marked simulated", async () => {
    await owner.goto(`${BASE}/app/outbox`);
    await owner.getByTestId("wa-simulated").waitFor();
    const n = await owner.getByTestId("message-log").locator(":scope > li").count();
    if (n !== 7) throw new Error(`expected 7 messages, got ${n}`);
    const links = await owner.getByTestId("wa-send").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    if (!links.every((h) => /^https:\/\/wa\.me\/92300555000\d\?text=/.test(h))) throw new Error("bad wa.me link");
    await shot(owner, "whatsapp-log");
  });

  await check("owner reverses the payment; family balance goes back up", async () => {
    await owner.goto(receiptUrl);
    owner.once("dialog", (d) => d.accept());
    await owner.locator('input[name="reason"]').fill("Entered on wrong family");
    await owner.getByRole("button", { name: "Reverse" }).click();
    await expectText(owner.getByTestId("receipt"), /Reversed — not valid/);
    await shot(owner, "reversed");
    await owner.goto(`${BASE}/app/students?q=Ali Hassan`);
    await owner.getByRole("link", { name: "Ali Hassan" }).click();
    await owner.getByRole("link", { name: /Family fee account/ }).click();
    await expectText(owner.getByTestId("family-balance"), /Rs 6,600/);
  });

  await check("clerk adds a payment screenshot: AI reads it, code suggests the Ahmed family, clerk approves", async () => {
    const shotPage = await browser.newPage({ viewport: { width: 390, height: 640 } });
    const today = new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" });
    await shotPage.setContent(`<body style="font-family:Arial;margin:0;background:#f2f4f7"><div style="background:#7a1f3d;color:#fff;padding:20px;font-size:18px">Mobile Wallet</div>
      <div style="background:#fff;margin:16px;padding:18px;border-radius:12px"><p style="color:#0a7d3e;font-weight:700;text-align:center">Transaction Successful</p>
      <p style="font-size:32px;font-weight:800;text-align:center">Rs. 3,600</p>
      <p>Sent to: E2E Test School</p><p>From: Ahmed Nawaz</p><p>Date: ${today}</p><p>TID: 05${Date.now() % 100000000}</p></div></body>`);
    const png = await shotPage.screenshot();
    await shotPage.close();
    await clerk.goto(`${BASE}/app/proofs`);
    await clerk.getByTestId("proof-file").setInputFiles({ name: "wallet.png", mimeType: "image/png", buffer: png });
    await clerk.getByTestId("proof-submit").click();
    await clerk.getByTestId("proof-card").first().waitFor({ timeout: 180000 });
    const card = clerk.getByTestId("proof-card").first();
    await expectText(card.getByTestId("proof-reading"), /Rs 3,600/);
    const chosen = await card.getByTestId("proof-family").evaluate((el) => el.options[el.selectedIndex].text);
    if (!/Ahmed Nawaz/.test(chosen)) throw new Error("suggested family was " + chosen);
    await shot(clerk, "screenshot-read");
    await card.getByTestId("proof-approve").click();
    await clerk.waitForURL(/receipts\/.*from=proofs/, { timeout: 30000 });
    await expectText(clerk.getByTestId("payment-saved"), /Receipt #3/);
    await expectText(clerk.getByTestId("receipt"), /Rs 3,600/);
    await clerk.getByTestId("receipt-wa").waitFor();
    await shot(clerk, "screenshot-receipt");
    await clerk.goto(`${BASE}/app/proofs`);
    globalThis.__png = png;
  });

  await check("the same screenshot sent again is flagged as a copy and rejected", async () => {
    await clerk.getByTestId("proof-file").setInputFiles({ name: "again.png", mimeType: "image/png", buffer: globalThis.__png });
    await clerk.getByTestId("proof-submit").click();
    await clerk.getByTestId("proof-card").first().waitFor({ timeout: 60000 });
    await expectText(clerk.getByTestId("proof-warnings").first(), /already sent before|already used/);
    await shot(clerk, "screenshot-duplicate");
    await clerk.getByTestId("proof-reject").first().click();
    await clerk.getByTestId("proof-card").first().waitFor({ state: "detached", timeout: 15000 });
  });

  await check("owner runs automation now: dropout check, Morning Brief, reminders (Stage 2)", async () => {
    await owner.goto(`${BASE}/app/automation`);
    for (const job of ["risk_scores", "morning_brief", "fee_reminders"]) {
      await owner.getByTestId(`run-${job}`).click();
      await expectText(owner.getByTestId(`run-${job}`).locator("xpath=ancestor::form"), /Done\.|Already ran today/);
    }
    await owner.reload();
    await expectText(owner.getByTestId("job-runs"), /5 students checked/);
    await expectText(owner.getByTestId("job-runs"), /0 WhatsApp reminders/); // slips are not overdue yet
    await shot(owner, "automation");
    await owner.goto(`${BASE}/app/brief`);
    await expectText(owner.getByTestId("brief-text"), /E2E Test School/);
    await shot(owner, "brief");
    await owner.goto(`${BASE}/app/calls`);
    await owner.getByTestId("fee-calls").waitFor();
  });

  await check("fee clerk cannot open the automation or calls pages", async () => {
    await clerk.goto(`${BASE}/app/automation`);
    await clerk.waitForURL(/denied=1/);
  });

  await check("logout ends the session", async () => {
    await owner.getByTestId("logout").click();
    await owner.waitForURL(/login/);
    await owner.goto(`${BASE}/app`);
    await owner.waitForURL(/login/);
  });
} finally {
  writeFileSync(path.join(OUT, "results.txt"), results.join("\n") + "\n");
  await browser.close();
  if (!process.env.KEEP) cleanup();
}
