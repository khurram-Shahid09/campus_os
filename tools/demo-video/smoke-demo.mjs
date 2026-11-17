/**
 * Smoke test of the working app on the demo school: logs in as each role with the demo buttons, opens every
 * page in that role's menu, and fails on server errors, error text or console errors. Screenshots each page.
 * Needs the app on :3000 with DEMO_LOGIN=1 and a fresh `pnpm db:seed`.
 * Run: node tools/demo-video/smoke-demo.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve("demo-videos/smoke");
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
let failures = 0;

for (const role of ["owner", "principal", "accountant", "teacher"]) {
  const ctx = await browser.newContext({ viewport: role === "teacher" ? { width: 400, height: 860 } : { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("response", (r) => r.status() >= 500 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(`${BASE}/login`);
  await page.getByTestId(`demo-${role}`).click();
  await page.waitForURL(/\/app/);
  const links = await page.locator("header nav a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const extra = role === "owner" ? ["/app/brief", "/app/notices", "/app/fees/slips"] : [];
  for (const href of [...new Set([...links, ...extra])]) {
    errors.length = 0;
    const res = await page.goto(`${BASE}${href}`);
    const text = await page.locator("main").innerText();
    const bad = res.status() >= 400 || /Something went wrong|Application error|Unhandled/.test(text) || !(await page.getByTestId("demo-banner").count());
    const name = `${role}${href.replace(/\//g, "-")}`;
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
    if (bad || errors.length) {
      failures++;
      console.log(`✗ ${role} ${href} (${res.status()}) ${errors.slice(0, 3).join(" | ")}`);
    } else console.log(`✓ ${role} ${href}`);
  }
  await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} page(s) failed` : "all pages ok");
process.exit(failures ? 1 : 0);
