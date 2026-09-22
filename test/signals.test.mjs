import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { renderHtml } from "../scripts/render.mjs";
import {
  assembleSignals,
  buildEntry,
  formatWhen,
  parseAnthropicNews,
  parseDeepseekChangelog,
  parseFeedItems,
  parseGeminiChangelog,
  parseLooseDate,
  parseXaiReleaseNotes,
  pickLatestItem,
  toTopic,
} from "../scripts/signals.mjs";

const rss = `<?xml version="1.0"?>
<rss><channel>
  <title>Blog</title>
  <item>
    <title><![CDATA[Older model launch notes]]></title>
    <link>https://example.com/old</link>
    <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Brand new flagship &amp; more details here</title>
    <link>https://example.com/new</link>
    <pubDate>Tue, 22 Sep 2026 21:00:00 GMT</pubDate>
  </item>
  <item><title>Blog</title><link>https://example.com/blog</link></item>
</channel></rss>`;

test("toTopic limita a 5 palavras e descarta título genérico", () => {
  assert.equal(toTopic("  one two three four five six  "), "one two three four five");
  assert.equal(toTopic("Brand <b>new</b> flagship &amp; more details"), "Brand new flagship & more");
  assert.equal(toTopic("Blog"), null);
  assert.equal(toTopic("Release Notes"), null);
  assert.equal(toTopic("DeepSeek-V4.1-Flash Release"), "DeepSeek-V4.1-Flash Release");
  assert.equal(toTopic("# v0.5.85 (2026-09-22)"), "v0.5.85 (2026-09-22)");
});

test("parseFeed escolhe o item mais recente e ignora título genérico", () => {
  const latest = pickLatestItem(parseFeedItems(rss));
  assert.equal(latest.topic, "Brand new flagship & more");
  assert.equal(latest.url, "https://example.com/new");
  assert.equal(formatWhen(latest.date, latest.precision), "22/09/2026");
});

test("formatWhen usa o calendário de São Paulo em instante UTC", () => {
  assert.equal(formatWhen("2026-09-23T02:00:00.000Z", "instant"), "22/09/2026");
  assert.equal(formatWhen("2026-09", "month"), "09/2026");
  assert.equal(formatWhen("2026-09-18", "day"), "18/09/2026");
  const midnight = parseLooseDate("Thu, 10 Sep 2026 00:00:00 GMT");
  assert.equal(midnight.precision, "day");
  assert.equal(midnight.iso, "2026-09-10");
});

test("parseLooseDate não transforma dia de calendário em instante", () => {
  const parsed = parseLooseDate("September 18, 2026");
  assert.equal(parsed.precision, "day");
  assert.equal(parsed.iso, "2026-09-18");
});

test("parsers de HTML leem o item mais novo da página oficial", () => {
  const anthropic = pickLatestItem(
    parseAnthropicNews(
      `<a href="/news/opus"><h2>Introducing Claude Opus 5.5</h2><time>Sep 22, 2026</time></a>
       <a href="/news/fable"><time>Sep 1, 2026</time><h4>Introducing Claude Fable 5.1 and Claude Mythos 5.1</h4></a>
       <h2>Newsroom</h2>`,
      "https://www.anthropic.com/news",
    ),
  );
  assert.equal(anthropic.topic, "Introducing Claude Opus 5.5");
  assert.equal(anthropic.url, "https://www.anthropic.com/news/opus");
  assert.equal(formatWhen(anthropic.date, anthropic.precision), "22/09/2026");

  const gemini = pickLatestItem(
    parseGeminiChangelog(
      `<h2 id="09-18-2026">September 18, 2026</h2><ul><li><strong>Gemini 2.5 models access update</strong>: extra</li></ul>
       <h2 id="09-17-2026">September 17, 2026</h2><ul><li><strong>Antigravity Agent 09-2026</strong></li></ul>`,
      "https://ai.google.dev/gemini-api/docs/changelog",
    ),
  );
  assert.equal(gemini.topic, "Gemini 2.5 models access update");
  assert.equal(gemini.date, "2026-09-18");

  const deepseek = pickLatestItem(
    parseDeepseekChangelog(
      `<h2 id="date-2026-09-10">Date: 2026-09-10\u200b</h2><h3 id="deepseek-v41-flash-release">DeepSeek-V4.1-Flash Release\u200b</h3>
       <h2 id="date-2026-08-21">Date: 2026-08-21</h2><h3 id="older">DeepSeek-V4-Flash</h3>`,
      "https://api-docs.deepseek.com/updates",
    ),
  );
  assert.equal(deepseek.topic, "DeepSeek-V4.1-Flash Release");
  assert.equal(deepseek.date, "2026-09-10");
  assert.equal(deepseek.url, "https://api-docs.deepseek.com/updates#deepseek-v41-flash-release");

  const xai = pickLatestItem(
    parseXaiReleaseNotes(
      `<h3 id="sidebar">Grok 4.7</h3>
       <h2 id="september">September</h2><h3 id="grok-47">Grok 4.7</h3>
       <h2 id="december-2025">December 2025</h2><h3 id="old">Grok 4</h3>`,
      "https://docs.x.ai/developers/release-notes",
    ),
  );
  assert.equal(xai.topic, "Grok 4.7");
  assert.equal(xai.date, "2026-09");
  assert.equal(xai.url, "https://docs.x.ai/developers/release-notes#grok-47");
});

test("diff marca novo só contra a coleta anterior e preserva o último conhecido", () => {
  const spec = { id: "openai", name: "OpenAI", region: "us", pageUrl: "https://openai.com/news/" };
  const first = buildEntry(spec, { topic: "Better prompt caching for", url: "https://openai.com/a", date: "2026-09-22", precision: "day" }, {});
  assert.equal(first.isNew, false);
  assert.equal(first.topic, "Better prompt caching for");

  const same = buildEntry(
    spec,
    { topic: "Better prompt caching for", url: "https://openai.com/a", date: "2026-09-22", precision: "day" },
    { hasPrevious: true, previousRow: first },
  );
  assert.equal(same.isNew, false);

  const changed = buildEntry(
    spec,
    { topic: "Introducing next flagship model", url: "https://openai.com/b", date: "2026-09-23", precision: "day" },
    { hasPrevious: true, previousRow: first },
  );
  assert.equal(changed.isNew, true);
  assert.equal(changed.topic.split(" ").length <= 5, true);

  const carried = buildEntry(spec, null, { hasPrevious: true, previousRow: changed });
  assert.equal(carried.carried, true);
  assert.equal(carried.isNew, false);
  assert.equal(carried.topic, changed.topic);
  assert.equal(carried.fingerprint, changed.fingerprint);
});

test("radar mantém a frase estática e a novidade só quando o item muda", () => {
  const releaseSpecs = [{ id: "factory", name: "Factory", region: "us", pageUrl: "https://factory.com/news" }];
  const radarSpecs = [
    {
      id: "factory",
      name: "Factory",
      group: "harness",
      blurb: "Agente de engenharia que executa tarefas em repositórios.",
      pageUrl: "https://factory.com/news",
    },
  ];
  const previous = {
    collectedDateBrt: "2026-09-21",
    releases: [],
    radar: [
      {
        id: "factory",
        topic: "titulo antigo demais aqui",
        url: "https://factory.com/old",
        fingerprint: "https://factory.com/old",
        blurb: "TEXTO QUE NAO PODE VOLTAR",
      },
    ],
  };
  const signals = assembleSignals({
    releaseSpecs,
    radarSpecs,
    releaseObserved: new Map([["factory", null]]),
    radarObserved: new Map([
      ["factory", { topic: "Cloud agents for repos", url: "https://factory.com/new", date: "2026-09-22", precision: "day" }],
    ]),
    previous,
    now: new Date("2026-09-22T15:00:00Z"),
  });
  assert.equal(signals.radar[0].blurb, "Agente de engenharia que executa tarefas em repositórios.");
  assert.equal(signals.radar[0].isNew, true);
  assert.equal(signals.releases[0].topic, null);
  assert.equal(signals.releases[0].isNew, false);

  const html = renderHtml(
    { models: [], sources: [], collectedAtBrt: "22/09/2026 12:00 BRT" },
    signals,
  );
  const radar = html.slice(html.indexOf('id="page-radar"'), html.indexOf("</main>"));
  const releases = html.slice(html.indexOf('id="page-lancamentos"'), html.indexOf('id="page-radar"'));
  assert.match(radar, /Agente de engenharia que executa tarefas em repositórios\./);
  assert.match(radar, /Cloud agents for repos/);
  assert.match(radar, /class="is-new"/);
  assert.doesNotMatch(radar, /TEXTO QUE NAO PODE VOLTAR/);
  assert.doesNotMatch(radar, /Simulador/);
  assert.doesNotMatch(radar, /AA Index/);
  assert.doesNotMatch(radar, /Atualizado/);
  assert.match(releases, /<td>Factory<\/td><td>—<\/td>/);
  assert.match(html, /data-page="page-precos"/);
  assert.match(html, />Preços</);
  assert.match(html, />Lançamentos</);
  assert.match(html, />Radar</);

  const quiet = assembleSignals({
    releaseSpecs,
    radarSpecs,
    releaseObserved: new Map(),
    radarObserved: new Map([
      ["factory", { topic: "Cloud agents for repos", url: "https://factory.com/new", date: "2026-09-22", precision: "day" }],
    ]),
    previous: { collectedDateBrt: "2026-09-22", releases: [], radar: [{ id: "factory", fingerprint: "https://factory.com/new", topic: "Cloud agents for repos" }] },
    now: new Date("2026-09-23T15:00:00Z"),
  });
  const quietHtml = renderHtml({ models: [], sources: [], collectedAtBrt: "23/09/2026 12:00 BRT" }, quiet);
  const quietRadar = quietHtml.slice(quietHtml.indexOf('id="page-radar"'), quietHtml.indexOf("</main>"));
  assert.doesNotMatch(quietRadar, /Cloud agents for repos/);
  assert.match(quietRadar, /<td>—<\/td>/);
  assert.doesNotMatch(quietRadar, /is-new/);
});

test("html de lançamento escapa título hostil", () => {
  const signals = assembleSignals({
    releaseSpecs: [{ id: "openai", name: `<img src=x onerror=alert(1)>`, region: "us", pageUrl: "https://openai.com/news/" }],
    radarSpecs: [],
    releaseObserved: new Map([["openai", { topic: `<script>alert(1)</script> extra words`, url: "https://openai.com/a", date: null, precision: null }]]),
    radarObserved: new Map(),
    previous: null,
    now: new Date("2026-09-22T15:00:00Z"),
  });
  const html = renderHtml({ models: [], sources: [], collectedAtBrt: "22/09/2026 12:00 BRT" }, signals);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<img src=/);
  assert.doesNotMatch(html, /<script>alert/);
});

test("catálogo lista as empresas e frases fixas do radar", async () => {
  const catalog = JSON.parse(await readFile(new URL("../data/signals-catalog.json", import.meta.url), "utf8"));
  assert.deepEqual(
    catalog.releases.map((row) => row.name),
    [
      "OpenAI",
      "Anthropic",
      "Google/Gemini",
      "xAI/Grok",
      "Meta/Llama",
      "Amazon/Nova",
      "Microsoft",
      "Cohere",
      "Perplexity",
      "Factory",
      "Manus",
      "Kilo",
      "OpenCode",
      "Command Code/Codex",
      "Alibaba/Qwen",
      "DeepSeek",
      "Moonshot/Kimi",
      "Zhipu/GLM",
      "ByteDance",
      "Tencent/Hunyuan",
      "Xiaomi/MiMo",
      "MiniMax",
      "Baichuan",
      "01.AI",
      "StepFun",
      "SenseTime",
      "iFlytek",
      "Huawei",
    ],
  );
  assert.deepEqual(
    catalog.radar.map((row) => row.name),
    [
      "OpenRouter",
      "9Router",
      "Together",
      "Fireworks",
      "Groq",
      "DeepInfra",
      "SiliconFlow",
      "Novita",
      "Cloudflare Workers AI",
      "Azure AI Catalog",
      "Bedrock",
      "Vertex Model Garden",
      "HF Inference/Router",
      "LiteLLM",
      "Cursor",
      "Factory",
      "Codex/Command Code",
      "OpenCode",
      "Kilo",
      "Manus",
      "Claude Code",
    ],
  );
  for (const row of catalog.radar) {
    assert.match(row.blurb, /\.$/);
    assert.equal(row.blurb.split(".").filter((part) => part.trim()).length, 1);
  }
  for (const row of catalog.releases) {
    assert.ok(!row.blurb);
  }
});
