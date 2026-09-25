import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brtParts } from "./parse.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SYMBOL = {
  USD: "US$",
  CNY: "CN¥",
  EUR: "€",
  INR: "₹",
};

export function plansPath(root = ROOT) {
  return path.join(root, "data", "plans.json");
}

export async function loadPlans(root = ROOT) {
  return JSON.parse(await readFile(plansPath(root), "utf8"));
}

export async function savePlans(doc, root = ROOT) {
  await writeFile(plansPath(root), `${JSON.stringify(doc, null, 2)}\n`);
}

export function formatPlanAmount(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

export function formatPlanPrice(plan) {
  if (plan?.monthly == null || Number.isNaN(plan.monthly)) return "—";
  if (plan.monthly === 0) return "Grátis";
  const symbol = SYMBOL[plan.currency] || plan.currency || "";
  const amount = formatPlanAmount(plan.monthly);
  const suffix = plan.billing === "annual" ? " /mês anual" : "";
  return `${symbol} ${amount}${suffix}`;
}

export function acceptParsedPrice(next, previous) {
  if (typeof next !== "number" || !Number.isFinite(next) || next < 0 || next > 20000) return false;
  if (previous == null) return true;
  if (previous === 0) return true;
  if (next === 0) return false;
  const ratio = next / previous;
  return ratio >= 0.2 && ratio <= 5;
}

function firstNumber(html, pattern) {
  const match = html.match(pattern);
  if (!match) return null;
  const value = Number(String(match[1]).replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function usdAfterPattern(html, labelPattern, window = 50) {
  return firstNumber(
    html,
    new RegExp(`${labelPattern}(?:(?!\\$\\s?\\d)[\\s\\S]){0,${window}}\\$\\s*([\\d.]+)\\s*(?:USD\\s*)?(?:/|per)\\s*(?:user\\s*/\\s*)?mo`, "i"),
  );
}

export function parseCursorPlans(html) {
  const out = {};
  const take = (id, labelPattern) => {
    const monthly = usdAfterPattern(html, labelPattern);
    if (monthly != null) out[id] = { monthly, billing: "month" };
  };
  take("pro-plus", "Pro\\+");
  take("ultra", "(?<![A-Za-z])Ultra");
  take("teams-premium", "Teams Premium");
  take("teams-standard", "Teams Standard");
  take("pro", "Pro(?!\\+)");
  const rupee = firstNumber(html, /₹\s*([\d,]+)\s*\/\s*mo/);
  if (rupee != null) out.start = { monthly: rupee, billing: "month" };
  return out;
}

export function parseCopilotPlans(html) {
  const out = {};
  const take = (id, label) => {
    const monthly = firstNumber(html, new RegExp(`${label}[\\s\\S]{0,160}?\\$([\\d.]+)\\s*USD`, "i"));
    if (monthly != null) out[id] = { monthly, billing: "month" };
  };
  take("pro-plus", "Copilot Pro\\+");
  take("max", "Copilot Max");
  take("business", "Copilot Business");
  take("enterprise", "Copilot Enterprise");
  take("pro", "Copilot Pro(?!\\+)");
  return out;
}

export function parseGeminiPlans(html) {
  const out = {};
  const take = (id, pattern) => {
    const monthly = firstNumber(html, pattern);
    if (monthly != null) out[id] = { monthly, billing: "month" };
  };
  take("plus", /\$\s*(4\.99)[\s\S]{0,50}\/\s*month/i);
  take("pro", /\$\s*(19\.99)[\s\S]{0,50}\/\s*month/i);
  take("ultra-5x", /\$\s*(99\.99)[\s\S]{0,80}\/\s*month:\s*5x/i);
  take("ultra-20x", /\$\s*(199\.99)[\s\S]{0,80}\/\s*month:\s*20x/i);
  return out;
}

export function parseFactoryPlans(html) {
  const out = {};
  const take = (id, pattern) => {
    const monthly = firstNumber(html, pattern);
    if (monthly != null) out[id] = { monthly, billing: "month" };
  };
  take("pro", /Pro\s*·\s*\$\s*(\d+(?:\.\d+)?)\s*\/\s*mo/i);
  take("plus", /Plus\s*·\s*\$\s*(\d+(?:\.\d+)?)\s*\/\s*mo/i);
  take("max", /Max\s*·\s*\$\s*(\d+(?:\.\d+)?)\s*\/\s*mo/i);
  take("teams-base", /\$\s*(\d+(?:\.\d+)?)\s*\/\s*mo(?:\s+per team|\s*\+)/i);
  take("teams-seat", /\$\s*(\d+(?:\.\d+)?)\s*\/\s*(?:mo per seat|seat)/i);
  return out;
}

export function parseDevinPlans(html) {
  const out = {};
  const take = (id, name) => {
    const monthly = firstNumber(html, new RegExp(`${name}</span><span[^>]*>\\$(\\d+(?:\\.\\d+)?)/month`));
    if (monthly != null) out[id] = { monthly, billing: "month" };
  };
  take("pro", "Pro");
  take("max", "Max");
  take("teams-base", "Team");
  const seat = firstNumber(html, /\$(\d+(?:\.\d+)?)\/mo per full dev seat/);
  if (seat != null) out["teams-seat"] = { monthly: seat, billing: "month" };
  return out;
}

export function parseKiloPlans(html) {
  const out = {};
  const teams = firstNumber(html, /\$\s*(\d+(?:\.\d+)?)\s*\/\s*user\s*\/\s*month/i);
  const pass = firstNumber(html, /From\s*\$\s*(\d+(?:\.\d+)?)\s*\/\s*mo/i);
  if (teams != null) out.teams = { monthly: teams, billing: "month" };
  if (pass != null) out.pass = { monthly: pass, billing: "month" };
  return out;
}

export function parseJetbrainsPlans(html) {
  const out = {};
  const read = (name) => {
    const marker = `"name": "${name}"`;
    const index = html.indexOf(marker);
    if (index < 0) return null;
    const slice = html.slice(Math.max(0, index - 900), index);
    const personalHits = [...slice.matchAll(/"personal": \{"yearly": \["\$[\d.]+"\], "yearlyPerMonth": \["\$[\d.]+"\], "monthly": \["\$([\d.]+)"\]/g)];
    const commercialHits = [...slice.matchAll(/"commercial": \{"yearly": \["\$[\d.]+"\], "yearlyPerMonth": \["\$[\d.]+"\], "monthly": \["\$([\d.]+)"\]/g)];
    const personal = personalHits.at(-1);
    const commercial = commercialHits.at(-1);
    return {
      personal: personal ? Number(personal[1]) : null,
      commercial: commercial ? Number(commercial[1]) : null,
    };
  };
  const pro = read("JetBrains AI Pro");
  const ultimate = read("JetBrains AI Ultimate");
  if (pro?.personal != null) out.pro = { monthly: pro.personal, billing: "month" };
  if (pro?.commercial != null) out["pro-commercial"] = { monthly: pro.commercial, billing: "month" };
  if (ultimate?.personal != null) out.ultimate = { monthly: ultimate.personal, billing: "month" };
  if (ultimate?.commercial != null) out["ultimate-commercial"] = { monthly: ultimate.commercial, billing: "month" };
  return out;
}

export function parseGrokPlans(html) {
  const out = {};
  const plus = firstNumber(html, /SuperGrok Plus[\s\S]{0,200}?\$\s*(\d+)/);
  const base = firstNumber(html, /SuperGrok(?! Plus)[\s\S]{0,200}?\$\s*(\d+)/);
  if (base != null) out.supergrok = { monthly: base, billing: "month" };
  if (plus != null) out.plus = { monthly: plus, billing: "month" };
  return out;
}

export function parseKimiPlans(html) {
  const out = {};
  const take = (id, name) => {
    const monthly = firstNumber(html, new RegExp(`${name}[\\s\\S]{0,80}?¥\\s*([\\d,]+)\\s*/\\s*月`));
    if (monthly != null) out[id] = { monthly, billing: "month" };
  };
  take("andante", "Andante");
  take("moderato", "Moderato");
  take("allegretto", "Allegretto");
  take("allegro", "Allegro");
  return out;
}

export function parseQwenPlans(html) {
  const monthly = firstNumber(html, /¥\s*([\d,]+)[\s\S]{0,30}\/\s*月/);
  if (monthly == null) return {};
  return { pro: { monthly, billing: "month" } };
}

export const PLAN_PARSERS = {
  cursor: parseCursorPlans,
  grok: parseGrokPlans,
  copilot: parseCopilotPlans,
  gemini: parseGeminiPlans,
  factory: parseFactoryPlans,
  devin: parseDevinPlans,
  kilo: parseKiloPlans,
  jetbrains: parseJetbrainsPlans,
  kimi: parseKimiPlans,
  qwen: parseQwenPlans,
};

async function defaultFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "ai-prices/0.1 (+https://github.com/hedrosgames/ai-prices)",
        accept: "text/html",
      },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function mapPool(items, limit, fn) {
  const queue = [...items];
  const size = Math.min(limit, queue.length);
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length) {
        const item = queue.shift();
        await fn(item);
      }
    }),
  );
}

export function applyParsedPlans(product, parsed) {
  if (!parsed) return;
  for (const plan of product.plans || []) {
    const next = parsed[plan.id];
    if (!next || !acceptParsedPrice(next.monthly, plan.monthly)) continue;
    plan.monthly = next.monthly;
    if (next.billing) plan.billing = next.billing;
  }
}

export async function refreshPlans(doc, { now = new Date(), fetchPage = defaultFetch } = {}) {
  const checked = brtParts(now).date;
  await mapPool(doc.products || [], 5, async (product) => {
    if (!product.sourceUrl) return;
    const html = await fetchPage(product.sourceUrl);
    if (!html) return;
    product.checked = checked;
    const parser = PLAN_PARSERS[product.parser];
    if (!parser) return;
    try {
      applyParsedPlans(product, parser(html));
    } catch {
      return;
    }
  });
  return doc;
}

export async function refreshPlansFile({ now = new Date(), root = ROOT } = {}) {
  const doc = await loadPlans(root);
  await refreshPlans(doc, { now });
  await savePlans(doc, root);
  return doc;
}
