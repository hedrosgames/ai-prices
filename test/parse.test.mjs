import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildSnapshot } from "../scripts/collect.mjs";
import {
  formatUsd,
  parseAnthropic,
  parseGemini,
  parseMimo,
  parseOpenAI,
  parseXai,
} from "../scripts/parse.mjs";
import { renderHtml } from "../scripts/render.mjs";

const openaiHtml = `
<span>gpt-6-astra</span></td><td>$10.00</td><td>$1.00</td><td>$12.50</td><td>$50.00</td><td>$20.00</td><td>$2.00</td><td>$25.00</td><td>$75.00</td>
<span>gpt-6-sol</span></td><td>$2.00</td><td>$0.20</td><td>$2.50</td><td>$10.00</td><td>$4.00</td><td>$0.40</td><td>$5.00</td><td>$15.00</td>
>Batch<
`;

const anthropicHtml = `
>Claude Fable 5.1</td><td class="x">$10 / MTok</td><td class="x">$12.50 / MTok</td><td class="x">$20 / MTok</td><td class="x">$0.25 / MTok<sup>1</sup></td><td class="x">$50 / MTok</td>
>Claude Opus 5</td><td class="x">$5 / MTok</td><td class="x">$6.25 / MTok</td><td class="x">$10 / MTok</td><td class="x">$0.50 / MTok</td><td class="x">$25 / MTok</td>
Batch processing
>Claude Opus 5</td><td class="x">$2.50 / MTok</td><td class="x">$1 / MTok</td><td class="x">$1 / MTok</td><td class="x">$0.10 / MTok</td><td class="x">$12.50 / MTok</td>
`;

const geminiHtml = `
<h2 id="gemini-3.8-flash">Gemini 3.8 Flash</h2>
Standard
Input price Free $0.75 through December 31, 2026. $1.50 starting January 1, 2027.
Output price Free $3.75 through December 31, 2026. $7.50 starting January 1, 2027.
Batch
Input price $0.375
<h2 id="gemini-3.7-flash">Gemini 3.7 Flash</h2>
`;

const xaiHtml = `<script>globalThis.__XAI_PUBLIC_MODELS__={"clusterConfigs":[{"languageModels":[{"name":"grok-4.3","promptTextTokenPrice":"12500","completionTextTokenPrice":"25000","promptTextTokenPriceLongContext":"25000","completionTokenPriceLongContext":"50000","longContextThreshold":200000}]}]};</script>`;

const mimoHtml = `
Overseas Pricing
<table><tr class="mdx-tr"><td>Real-time API</td><td><code class="mdx-code-inline">mimo-v2.6-pro</code></td><td>$0.0036</td><td>$0.435</td><td>$0.87</td></tr>
<tr class="mdx-tr"><td><code class="mdx-code-inline">mimo-v2.6-flash</code></td><td>$0.0028</td><td>$0.14</td><td>$0.28</td></tr>
Batch API
<tr class="mdx-tr"><td><code class="mdx-code-inline">mimo-v2.6-pro</code></td><td>$0.001</td><td>$0.01</td><td>$0.02</td></tr>
Pricing for Web Search
`;

test("formatUsd corta zeros e mantém frações pequenas", () => {
  assert.equal(formatUsd(10), "10");
  assert.equal(formatUsd(1.25), "1.25");
  assert.equal(formatUsd(0.75), "0.75");
  assert.equal(formatUsd(0.0028), "0.0028");
});

test("parseOpenAI lê short e long da tabela Standard", () => {
  const parsed = parseOpenAI(openaiHtml);
  assert.deepEqual(parsed.models["gpt-6-astra"].short, { input: 10, output: 50 });
  assert.deepEqual(parsed.models["gpt-6-astra"].long, { input: 20, output: 75 });
  assert.equal(parsed.models["gpt-6-sol"].short.output, 10);
});

test("parseAnthropic ignora a tabela de batch", () => {
  const parsed = parseAnthropic(anthropicHtml);
  assert.equal(parsed.models["Claude Opus 5"].input, 5);
  assert.equal(parsed.models["Claude Opus 5"].output, 25);
  assert.equal(parsed.models["Claude Fable 5.1"].input, 10);
});

test("parseGemini usa o primeiro preço Standard", () => {
  const parsed = parseGemini(geminiHtml);
  assert.equal(parsed.models["gemini-3.8-flash"].input, 0.75);
  assert.equal(parsed.models["gemini-3.8-flash"].output, 3.75);
  assert.match(parsed.models["gemini-3.8-flash"].note, /1\.5/);
});

test("parseXai converte a unidade oficial", () => {
  const parsed = parseXai(xaiHtml);
  assert.equal(parsed.models["grok-4.3"].short.input, 1.25);
  assert.equal(parsed.models["grok-4.3"].short.output, 2.5);
  assert.match(parsed.models["grok-4.3"].note, /200000/);
});

test("parseMimo usa cache miss e ignora batch", () => {
  const parsed = parseMimo(mimoHtml);
  assert.equal(parsed.models["mimo-v2.6-pro"].input, 0.435);
  assert.equal(parsed.models["mimo-v2.6-pro"].output, 0.87);
  assert.equal(parsed.models["mimo-v2.6-flash"].input, 0.14);
});

test("buildSnapshot cai para seed e calcula delta do dia anterior", async () => {
  const catalog = JSON.parse(await readFile(new URL("../data/catalog.json", import.meta.url), "utf8"));
  const now = new Date("2026-09-23T15:00:00Z");
  const previous = {
    collectedDateBrt: "2026-09-22",
    models: [{ id: "qwen3-8-max", inputPerMillion: 2, outputPerMillion: 5 }],
  };
  const snapshot = buildSnapshot({
    catalog,
    fetched: {
      qwen: { status: "unparsed", parsed: null, error: null },
      openai: { status: "error", parsed: null, error: "HTTP 500" },
    },
    previous,
    now,
  });
  const qwen = snapshot.models.find((model) => model.id === "qwen3-8-max");
  assert.equal(qwen.priceStatus, "seed");
  assert.equal(qwen.deltaOutput, 1);
  const astra = snapshot.models.find((model) => model.id === "gpt-6-astra-short");
  assert.equal(astra.priceStatus, "seed");
  assert.equal(astra.inputPerMillion, 10);
  const sol = snapshot.models.find((model) => model.id === "gpt-6-sol-short");
  assert.equal(sol, undefined);
  const glm = snapshot.sources.find((source) => source.id === "glm");
  assert.equal(glm.status, "not-collected");
  const html = renderHtml(snapshot);
  assert.match(html, /Qwen3\.8-Max/);
  assert.match(html, /seed 2026-09-22/);
  assert.doesNotMatch(html, /<script>alert/);
  const hostile = renderHtml({
    ...snapshot,
    models: [{ ...qwen, name: `<img src=x onerror=alert(1)>`, note: "<b>" }],
  });
  assert.match(hostile, /&lt;img/);
  assert.doesNotMatch(hostile, /<img src=/);
});
