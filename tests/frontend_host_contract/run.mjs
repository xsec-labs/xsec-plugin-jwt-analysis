// Host contract for the JWT frontend, in a real browser (Playwright Chromium).
//
// The Desktop host returns a method bound to an MCP tool as the raw CallToolResult
// ({content:[{type:"text",text}], structuredContent, isError}), and pushes its theme as
// --xsec-* variables on <html>. The lifecycle harness next door stubs plain business
// objects, so it cannot see either. This runs the real frontend module against both.
//
//   NODE_PATH=$(npm root -g) node tests/frontend_host_contract/run.mjs   (needs Playwright with Chromium)
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "../../com.xsec.desktop/frontend/index.js"), "utf8");
const themes = JSON.parse(readFileSync(join(here, "host-theme.json"), "utf8"));
const ORIGIN = "http://jwt-host.test";

const diagnostics = { jwt_tool_version: "2.3.0", sidecar: "ready", rockyou_available: true, rockyou_archive_bytes: 53000000 };
const job = { job_id: "job-1", status: "completed", profile: "passive", tokens: [], tests: [], created_at: "2026-11-18T00:00:00Z" };
const structured = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value, isError: false });
const textOnly = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }], isError: false });
const responses = (wrap, diag = diagnostics) => ({
  "xsec.jwt-analysis.diagnostics": wrap(diag),
  "xsec.jwt-analysis.jobs.list": wrap({ items: [job] }),
  "xsec.jwt-analysis.jobs.get": wrap(job),
  "xsec.jwt-analysis.jobs.events": wrap({ items: [] }),
});

const browser = await chromium.launch();
const failures = [];
const check = (name, ok, detail = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` -- ${detail}`}`); if (!ok) failures.push(name); };

async function mount(theme, table, options = {}) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, colorScheme: options.systemScheme || "light" });
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/frontend.js") return route.fulfill({ contentType: "text/javascript", body: source });
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><meta charset=utf-8><main id=root></main>" });
  });
  await page.goto(`${ORIGIN}/`);
  const outcome = await page.evaluate(async ({ theme, table }) => {
    for (const [name, value] of Object.entries(theme)) document.documentElement.style.setProperty(`--xsec-${name}`, value);
    const mod = await import("/frontend.js");
    const host = { apiVersion: 2, request: async (method) => {
      if (!(method in table)) throw new Error(`unexpected method ${method}`);
      return JSON.parse(JSON.stringify(table[method]));
    } };
    const controller = await mod.activate(host);
    const context = { kind: "workspace-tool", project: { projectId: "p1" } };
    try { await controller.mount(document.querySelector("#root"), context); return { ok: true }; }
    catch (error) { return { ok: false, message: error.message }; }
  }, { theme, table });
  return { page, outcome };
}

const runtimeLine = (page) => page.locator(".jwt-runtime").innerText();

// 1. The three wire shapes of the diagnostics result all render the real values.
for (const [label, wrap] of [["structuredContent", structured], ["text content only", textOnly], ["plain business object", (v) => v]]) {
  const { page, outcome } = await mount(themes.light, responses(wrap));
  const line = outcome.ok ? await runtimeLine(page) : outcome.message;
  check(`diagnostics (${label})`, outcome.ok && line.includes("Sidecar ready") && line.includes("jwt_tool 2.3.0") && line.includes("RockYou 已就绪") && !line.includes("undefined"), line);
  const options = outcome.ok ? await page.locator("select.jwt-job-select option").allInnerTexts() : [];
  check(`job list (${label})`, options.length === 1 && options[0].startsWith("job-1"), JSON.stringify(options));
  await page.close();
}

// 2. Missing or wrong-typed diagnostic fields never print "undefined".
{
  const { page, outcome } = await mount(themes.light, responses(structured, { rockyou_available: false }));
  const line = outcome.ok ? await runtimeLine(page) : outcome.message;
  check("diagnostics with missing fields", outcome.ok && !line.includes("undefined") && line.includes("RockYou 缺失"), line);
  await page.close();
}

// 3. A tool error reaches the host boundary with the tool's own message.
{
  const failing = { ...responses(structured), "xsec.jwt-analysis.diagnostics": { content: [{ type: "text", text: "sidecar crashed" }], isError: true } };
  const { page, outcome } = await mount(themes.light, failing);
  check("isError result is rejected with the tool message", !outcome.ok && outcome.message === "sidecar crashed", JSON.stringify(outcome));
  await page.close();
}

// 4. Colours follow the host theme (light and dark) with readable contrast, whatever the system scheme is.
const channels = (color) => { const m = color.match(/\d+(\.\d+)?/g).map(Number); return m.slice(0, 3); };
const luminance = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
for (const [mode, theme] of Object.entries(themes)) {
  for (const systemScheme of ["light", "dark"]) {
    const { page, outcome } = await mount(theme, responses(structured), { systemScheme });
    if (!outcome.ok) { check(`theme ${mode} (system ${systemScheme})`, false, outcome.message); await page.close(); continue; }
    const probe = await page.evaluate(() => {
      const root = document.querySelector(".jwt-root"), style = (node) => getComputedStyle(node);
      const subtitle = document.querySelector(".jwt-header p"), tag = document.querySelector(".jwt-tag");
      return { bg: style(root).backgroundColor, title: style(document.querySelector("h1")).color, subtitle: style(subtitle).color,
        tag: style(tag).color, scheme: document.documentElement.style.colorScheme };
    });
    const bg = channels(probe.bg);
    const expectedBg = themes[mode]["content-surface"];
    const hex = `#${bg.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    check(`theme ${mode} (system ${systemScheme}): background is the host surface`, hex === expectedBg, `${hex} vs ${expectedBg}`);
    for (const key of ["title", "subtitle", "tag"]) {
      const ratio = contrast(channels(probe[key]), bg);
      check(`theme ${mode} (system ${systemScheme}): ${key} contrast ${ratio.toFixed(1)}`, ratio >= 4.5, `${probe[key]} on ${probe.bg}`);
    }
    check(`theme ${mode} (system ${systemScheme}): color-scheme follows the host`, probe.scheme === mode, probe.scheme);
    await page.close();
  }
}

// 5. A live theme update from the host switches color-scheme too.
{
  const { page } = await mount(themes.light, responses(structured));
  await page.evaluate((dark) => { for (const [name, value] of Object.entries(dark)) document.documentElement.style.setProperty(`--xsec-${name}`, value); }, themes.dark);
  await page.waitForFunction(() => document.documentElement.style.colorScheme === "dark", null, { timeout: 5000 }).then(() => check("live theme update switches color-scheme", true), (e) => check("live theme update switches color-scheme", false, e.message));
  await page.close();
}

await browser.close();
if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log("\nall checks passed");
