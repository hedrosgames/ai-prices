import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { renderHtml } from "../scripts/render.mjs";
import {
  acceptParsedPrice,
  applyParsedPlans,
  formatPlanPrice,
  loadPlans,
  parseCopilotPlans,
  parseCursorPlans,
  parseDevinPlans,
  parseFactoryPlans,
  parseGeminiPlans,
  parseJetbrainsPlans,
  parseKiloPlans,
  parseGrokPlans,
  parseKimiPlans,
  parseQwenPlans,
  refreshPlans,
} from "../scripts/plans.mjs";

const REQUIRED = [
  "claude",
  "chatgpt",
  "cursor",
  "grok",
  "gemini",
  "mimo",
  "trae",
  "doubao",
  "factory",
  "kilo",
  "copilot",
  "devin",
  "perplexity",
  "mistral",
  "microsoft",
  "meta",
  "manus",
  "opencode",
  "command",
  "replit",
  "lovable",
  "bolt",
  "v0",
  "augment",
  "amp",
  "warp",
  "jetbrains",
  "tabnine",
  "poe",
  "glm",
  "kimi",
  "qwen",
  "minimax",
  "deepseek",
  "yuanbao",
  "baidu",
  "stepfun",
];

test("plans.json tem URL oficial e preço numérico ou vazio", async () => {
  const doc = await loadPlans();
  const ids = new Set();
  assert.equal(doc.schemaVersion, 1);
  for (const id of REQUIRED) assert.ok(doc.products.some((product) => product.id === id), id);
  for (const product of doc.products) {
    assert.equal(ids.has(product.id), false);
    ids.add(product.id);
    assert.match(product.sourceUrl, /^https:\/\//);
    assert.match(product.checked, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(product.plans.length > 0);
    const planIds = new Set();
    for (const plan of product.plans) {
      assert.equal(planIds.has(plan.id), false);
      planIds.add(plan.id);
      assert.equal(typeof plan.name, "string");
      assert.ok(plan.name.length > 0);
      assert.ok(plan.monthly == null || (typeof plan.monthly === "number" && plan.monthly >= 0));
      assert.ok(["USD", "CNY", "EUR", "INR"].includes(plan.currency));
      assert.ok(["month", "annual", "free"].includes(plan.billing));
      if (plan.sourceUrl) assert.match(plan.sourceUrl, /^https:\/\//);
    }
  }
});

test("formatPlanPrice mostra moeda, grátis, anual e traço", () => {
  assert.equal(formatPlanPrice({ monthly: 20, currency: "USD", billing: "month" }), "US$ 20");
  assert.equal(formatPlanPrice({ monthly: 19.99, currency: "USD", billing: "month" }), "US$ 19,99");
  assert.equal(formatPlanPrice({ monthly: 14.9, currency: "CNY", billing: "month" }), "CN¥ 14,9");
  assert.equal(formatPlanPrice({ monthly: 24, currency: "USD", billing: "annual" }), "US$ 24 /mês anual");
  assert.equal(formatPlanPrice({ monthly: 0, currency: "USD", billing: "free" }), "Grátis");
  assert.equal(formatPlanPrice({ monthly: null, currency: "USD", billing: "month" }), "—");
  assert.equal(formatPlanPrice({ monthly: 649, currency: "INR", billing: "month" }), "₹ 649");
});

test("refresh mantém o preço quando o fetch falha e ignora salto absurdo", async () => {
  assert.equal(acceptParsedPrice(0, 20), false);
  assert.equal(acceptParsedPrice(500, 20), false);
  assert.equal(acceptParsedPrice(25, 20), true);
  assert.equal(acceptParsedPrice(18, null), true);
  const doc = {
    products: [
      {
        id: "cursor",
        sourceUrl: "https://cursor.com/help/account-and-billing/pricing",
        checked: "2026-09-01",
        parser: "cursor",
        plans: [{ id: "pro", name: "Pro", monthly: 20, currency: "USD", billing: "month" }],
      },
    ],
  };
  await refreshPlans(doc, {
    now: new Date("2026-09-25T15:00:00Z"),
    fetchPage: async () => null,
  });
  assert.equal(doc.products[0].plans[0].monthly, 20);
  assert.equal(doc.products[0].checked, "2026-09-01");

  await refreshPlans(doc, {
    now: new Date("2026-09-25T15:00:00Z"),
    fetchPage: async () => "| Pro | $999/mo |",
  });
  assert.equal(doc.products[0].plans[0].monthly, 20);
  assert.equal(doc.products[0].checked, "2026-09-25");

  await refreshPlans(doc, {
    now: new Date("2026-09-25T15:00:00Z"),
    fetchPage: async () => "| Pro | $22/mo |",
  });
  assert.equal(doc.products[0].plans[0].monthly, 22);
});

test("parsers leem as páginas oficiais sem apagar plano ausente", () => {
  const cursor = parseCursorPlans("| Pro+ | $60/mo |\n| Ultra | $200/mo |\n| Teams Premium | $120/user/mo |\n| Teams Standard | $40/user/mo |\n| Pro | $20/mo |\n| Start (India only) | ₹649/mo |");
  assert.equal(cursor.pro.monthly, 20);
  assert.equal(cursor["pro-plus"].monthly, 60);
  assert.equal(cursor.ultra.monthly, 200);
  assert.equal(cursor["teams-standard"].monthly, 40);
  assert.equal(cursor["teams-premium"].monthly, 120);
  assert.equal(cursor.start.monthly, 649);

  const copilot = parseCopilotPlans("<tr><th>Copilot Pro</th><td>$10 USD per month</td></tr><tr><th>Copilot Pro+</th><td>$39 USD per month</td></tr><tr><th>Copilot Max</th><td>$100 USD per month</td></tr><tr><th>Copilot Business</th><td>$19 USD per granted seat per month</td></tr><tr><th>Copilot Enterprise</th><td>$39 USD per granted seat per month</td></tr>");
  assert.equal(copilot.pro.monthly, 10);
  assert.equal(copilot["pro-plus"].monthly, 39);
  assert.equal(copilot.max.monthly, 100);
  assert.equal(copilot.business.monthly, 19);
  assert.equal(copilot.enterprise.monthly, 39);

  const gemini = parseGeminiPlans('<span class="price-amount">$4.99</span></span>/ month</div><span class="price-amount">$19.99</span></span>/ month</div><span class="price-amount">$99.99</span></span>/ month: 5x higher<span class="price-amount">$199.99</span></span> / month: 20x higher');
  assert.equal(gemini.plus.monthly, 4.99);
  assert.equal(gemini.pro.monthly, 19.99);
  assert.equal(gemini["ultra-5x"].monthly, 99.99);
  assert.equal(gemini["ultra-20x"].monthly, 199.99);

  const factory = parseFactoryPlans("Pro · $20/mo Plus · $100/mo Max · $200/mo Teams · $60/mo + $40/seat");
  assert.equal(factory.pro.monthly, 20);
  assert.equal(factory.plus.monthly, 100);
  assert.equal(factory.max.monthly, 200);
  assert.equal(factory["teams-base"].monthly, 60);
  assert.equal(factory["teams-seat"].monthly, 40);

  const devin = parseDevinPlans('<span class="text-base font-medium text-dt-text">Pro</span><span class="text-base font-normal text-dt-text/40">$20/month</span><span class="text-base font-medium text-dt-text">Max</span><span class="text-base font-normal text-dt-text/40">$200/month</span><span class="text-base font-medium text-dt-text">Team</span><span class="text-base font-normal text-dt-text/40">$80/month</span> $40/mo per full dev seat');
  assert.equal(devin.pro.monthly, 20);
  assert.equal(devin.max.monthly, 200);
  assert.equal(devin["teams-base"].monthly, 80);
  assert.equal(devin["teams-seat"].monthly, 40);

  assert.equal(parseKiloPlans("Teams $15/user/month From $19/mo").teams.monthly, 15);
  assert.equal(parseKiloPlans("Teams $15/user/month From $19/mo").pass.monthly, 19);
  assert.equal(parseKimiPlans("Andante — ¥49/月 Moderato — ¥99/月 Allegretto — ¥199/月 Allegro — ¥699/月").allegro.monthly, 699);
  assert.equal(parseQwenPlans("<strong>¥ 200</strong>/月").pro.monthly, 200);
  const grok = parseGrokPlans("SuperGrok\n$30\n/month\nSuperGrok Plus\n$100\n/month\nSuperGrok Heavy");
  assert.equal(grok.supergrok.monthly, 30);
  assert.equal(grok.plus.monthly, 100);
  assert.equal(grok.heavy, undefined);

  const jetbrains = parseJetbrainsPlans(
    '"prices": {"personal": {"yearly": ["$100.00"], "yearlyPerMonth": ["$8.33"], "monthly": ["$10.00"]}, "commercial": {"yearly": ["$200.00"], "yearlyPerMonth": ["$16.67"], "monthly": ["$20.00"]}}, "name": "JetBrains AI Pro" "prices": {"personal": {"yearly": ["$300.00"], "yearlyPerMonth": ["$25.00"], "monthly": ["$30.00"]}, "commercial": {"yearly": ["$600.00"], "yearlyPerMonth": ["$50.00"], "monthly": ["$60.00"]}}, "name": "JetBrains AI Ultimate"',
  );
  assert.equal(jetbrains.pro.monthly, 10);
  assert.equal(jetbrains["pro-commercial"].monthly, 20);
  assert.equal(jetbrains.ultimate.monthly, 30);
  assert.equal(jetbrains["ultimate-commercial"].monthly, 60);

  const product = {
    plans: [
      { id: "pro", monthly: 20, billing: "month" },
      { id: "heavy", monthly: null, billing: "month" },
    ],
  };
  applyParsedPlans(product, { pro: { monthly: 22, billing: "month" } });
  assert.equal(product.plans[0].monthly, 22);
  assert.equal(product.plans[1].monthly, null);
});

test("a aba Preços mostra Planos e conserva lançamentos", async () => {
  const plans = await loadPlans();
  const snapshot = JSON.parse(await readFile(new URL("../public/latest.json", import.meta.url), "utf8"));
  const signals = {
    releases: [{ id: "openai", name: "OpenAI", region: "us", topic: "Modelo novo", dateLabel: "24/09/2026", url: "https://openai.com/x", isNew: false }],
    radar: [{ id: "openrouter", name: "OpenRouter", group: "aggregator", blurb: "Roteador", topic: null, url: "https://openrouter.ai/", isNew: false }],
  };
  const html = renderHtml(snapshot, signals, plans);
  assert.match(html, /<h2 class="section-title">Planos<\/h2>/);
  assert.match(html, /Anthropic · Claude/);
  assert.match(html, /US\$ 20/);
  assert.match(html, /SuperGrok Heavy/);
  assert.match(html, /CN¥ 49/);
  assert.match(html, /\/mês anual/);
  assert.match(html, /Empresa\/Produto/);
  assert.match(html, /id="page-lancamentos"/);
  assert.match(html, /id="page-radar"/);
  assert.match(html, /Modelo novo/);
  assert.match(html, /OpenRouter/);
  assert.match(html, /Qwen3\.8-Max|gpt-6-astra|grok-4/);
  const heavy = plans.products.find((product) => product.id === "grok").plans.find((plan) => plan.id === "heavy");
  assert.equal(heavy.monthly, null);
  assert.match(html, /<td class="price-month">—<\/td>/);
  assert.doesNotMatch(renderHtml(snapshot, signals), /id="planos"/);
});
