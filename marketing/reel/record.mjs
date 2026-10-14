// Records the SecretEye demo app (Expo web + Firebase emulators) scene by scene.
// Each clip -> work/clips/<name>/NNNN.jpg + meta.json ({frames:[{t,file}], taps:[{t,x,y}], hold:[...]})
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const APP = "http://localhost:8082";
const PY = path.resolve("../../backend/venv/Scripts/python.exe");
const OUT = path.resolve("work/clips");
const VW = 390, VH = 844, DPR = 2;
const account = JSON.parse(fs.readFileSync("demo-account.json", "utf8"));
const only = process.argv.slice(2);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seed = (cmd) => execFileSync(PY, ["seed.py", cmd], { stdio: "inherit" });

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, colorScheme: "dark" });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);

let clip = null;
cdp.on("Page.screencastFrame", async (f) => {
  cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  if (!clip) return;
  const file = String(clip.frames.length).padStart(4, "0") + ".jpg";
  fs.writeFileSync(path.join(clip.dir, file), Buffer.from(f.data, "base64"));
  clip.frames.push({ t: f.metadata.timestamp, file });
});

async function start(name) {
  const dir = path.join(OUT, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  clip = { name, dir, frames: [], taps: [], holds: [], t0: Date.now() / 1000 };
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: VW * DPR, maxHeight: VH * DPR, everyNthFrame: 1 });
  // force a first frame
  await page.evaluate(() => { document.body.style.outline = "0px solid transparent"; });
  await sleep(150);
}
async function stop() {
  await cdp.send("Page.stopScreencast");
  clip.t1 = Date.now() / 1000;
  const { dir, ...meta } = clip;
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 1));
  console.log(`clip ${clip.name}: ${clip.frames.length} frames, ${(clip.t1 - clip.t0).toFixed(1)}s`);
  clip = null;
}

async function center(loc) {
  try {
    await loc.waitFor({ state: "visible", timeout: 15000 });
  } catch (e) {
    await page.screenshot({ path: "work/fail.png" });
    throw e;
  }
  const b = await loc.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function tap(loc, pause = 0) {
  const { x, y } = await center(loc);
  await page.mouse.move(x, y);
  clip?.taps.push({ t: Date.now() / 1000, x, y });
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
  if (pause) await sleep(pause);
}
async function hold(loc, ms) {
  const { x, y } = await center(loc);
  await page.mouse.move(x, y);
  clip?.holds.push({ t: Date.now() / 1000, x, y, ms });
  await page.mouse.down();
  await sleep(ms);
  await page.mouse.up();
}
async function scroll(dy, ms, at = { x: VW / 2, y: VH / 2 }) {
  await page.mouse.move(at.x, at.y);
  const steps = Math.round(ms / 16);
  for (let i = 0; i < steps; i++) {
    // ease in-out
    const a = (1 - Math.cos((Math.PI * (i + 1)) / steps)) / 2 - (1 - Math.cos((Math.PI * i) / steps)) / 2;
    await page.mouse.wheel(0, dy * a);
    await sleep(16);
  }
}
const text = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true").first();
const tab = (name) => page.getByRole("tab", { name: new RegExp(name) }).first();
const want = (n) => !only.length || only.includes(n);

async function goHome() {
  await page.goto(APP + "/", { waitUntil: "load" });
  await text("Recent alerts").waitFor({ timeout: 30000 });
  await sleep(1500);
}

// ---------------------------------------------------------------- scenes
await page.goto(APP + "/", { waitUntil: "load" });
await sleep(2500);

if (await text("I already have an account").isVisible().catch(() => false)) {
  if (want("welcome")) {
    await page.evaluate(() => document.querySelector("video")?.play());
    await sleep(1500);
    await start("welcome");
    await sleep(3500);
    await stop();
  }
  await text("I already have an account").click();
  await page.getByPlaceholder("you@example.com").fill(account.email);
  await page.getByPlaceholder("Your password").fill(account.password);
  await page.getByText("Sign in", { exact: true }).last().click();
}
await goHome();

if (want("home")) {
  await start("home");
  await sleep(1400);
  await scroll(520, 2600);
  await sleep(900);
  await scroll(-520, 1600);
  await sleep(500);
  await stop();
}

if (want("cameras")) {
  await goHome();
  await start("cameras");
  await sleep(500);
  await tap(tab("Cameras"), 2600);
  await tap(text("127.0.0.1:8092"), 5200);
  await stop();
}

if (want("alert")) {
  await goHome();
  await start("alert");
  await sleep(900);
  seed("alert");
  await text("tap to view", false).waitFor({ timeout: 15000 });
  await sleep(1500);
  await tap(text("tap to view", false), 2200);
  await scroll(380, 1800);
  await sleep(1200);
  await stop();
}

if (want("alerts")) {
  await goHome();
  await start("alerts");
  await sleep(500);
  await tap(tab("Alerts"), 1800);
  await tap(page.getByText(/^Weapons \u00b7/).locator("visible=true").first(), 1500);
  await tap(page.getByText(/^Unread \u00b7/).locator("visible=true").first(), 1500);
  await tap(page.getByText(/^All \u00b7/).locator("visible=true").first(), 1200);
  await stop();
}

if (want("trusted")) {
  await goHome();
  await start("trusted");
  await sleep(400);
  await tap(tab("Profile"), 1500);
  await tap(text("Trusted people"), 2400);
  await page.goBack();
  await sleep(900);
  await tap(text("Detection settings"), 1600);
  await stop();
}

if (want("sos")) {
  await page.goto(APP + "/sos", { waitUntil: "load" });
  await page.getByLabel("Hold to send SOS").waitFor({ timeout: 30000 });
  await sleep(1200);
  await start("sos");
  await sleep(700);
  await hold(page.getByLabel("Hold to send SOS"), 2400);
  await sleep(2600);
  seed("ack");
  await sleep(3200);
  await stop();
  // tidy for re-runs
  const cancel = text("I'm safe — cancel SOS", false);
  if (await cancel.isVisible().catch(() => false)) await cancel.click();
}

await browser.close();
