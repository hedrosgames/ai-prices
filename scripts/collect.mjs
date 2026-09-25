import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  brtParts,
  parseAnthropic,
  parseGemini,
  parseMimo,
  parseOpenAI,
  parseXai,
  pickOfficial,
  roundPrice,
  sanePrice,
} from "./parse.mjs";
import { loadPlans, refreshPlansFile } from "./plans.mjs";
import { loadPromos, refreshPromosFile } from "./promos.mjs";
import { renderHtml } from "./render.mjs";
import { collectSignals } from "./signals.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PARSERS = {
  openai: parseOpenAI,
  anthropic: parseAnthropic,
  gemini: parseGemini,
  xai: parseXai,
  mimo: parseMimo,
};

const SOURCE_DETAIL = {
  openai: "Tabela Standard da página de pricing.",
  anthropic: "Tabela base de modelos, antes de batch.",
  gemini: "Paid tier Standard. O primeiro valor vigente da página.",
  xai: "JSON público da página. Preço de texto abaixo do limiar de contexto longo. Unidade oficial convertida de 1/10000 de USD.",
  qwen: "Página oficial sem tabela numérica no HTML. Número aproximado da pesquisa seed 2026-09-22, região SG.",
  xiaomi: "Tabela overseas, real-time API, em USD. Input é cache miss.",
  glm: "Sem preço na pesquisa seed de 2026-09-22 e sem parser neste MVP.",
};

export function buildSnapshot({ catalog, fetched, previous, now = new Date() }) {
  const clock = brtParts(now);
  const previousModels = new Map((previous?.models || []).map((model) => [model.id, model]));
  const canDelta = Boolean(previous?.collectedDateBrt && previous.collectedDateBrt < clock.date);
  const models = [];

  for (const spec of catalog.models) {
    const source = catalog.sources.find((item) => item.id === spec.sourceId);
    const fetchResult = fetched[spec.sourceId] || { status: "skipped", parsed: null, error: null };
    const official = pickOfficial(fetchResult.parsed, spec.match);
    const officialOk = official && sanePrice(official.input) && sanePrice(official.output);
    let input;
    let output;
    let priceStatus;
    let priceAsOf;
    let collectedLabel;
    const notes = [];
    if (spec.variant) notes.push(spec.variant);

    if (officialOk) {
      input = official.input;
      output = official.output;
      priceStatus = "official";
      priceAsOf = clock.date;
      collectedLabel = clock.label;
      if (official.note) notes.push(official.note);
    } else if (spec.seed && sanePrice(spec.seed.inputPerMillion) && sanePrice(spec.seed.outputPerMillion)) {
      input = spec.seed.inputPerMillion;
      output = spec.seed.outputPerMillion;
      priceStatus = "seed";
      priceAsOf = spec.seed.asOf;
      collectedLabel = `seed ${spec.seed.asOf}`;
      if (spec.seed.note) notes.push(spec.seed.note);
      if (fetchResult.error) notes.push(`Fetch não usado: ${fetchResult.error}`);
    } else {
      continue;
    }

    const prior = previousModels.get(spec.id);
    let deltaInput = null;
    let deltaOutput = null;
    if (canDelta && prior && prior.inputPerMillion != null && prior.outputPerMillion != null) {
      deltaInput = roundPrice(input - prior.inputPerMillion);
      deltaOutput = roundPrice(output - prior.outputPerMillion);
    }

    models.push({
      id: spec.id,
      family: spec.family,
      name: spec.name,
      variant: spec.variant || "",
      note: notes.join(". "),
      inputPerMillion: input,
      outputPerMillion: output,
      priceStatus,
      priceAsOf,
      aaLabel: spec.aaLabel,
      aaStatus: spec.aaLabel ? "seed" : null,
      deltaInput,
      deltaOutput,
      sourceId: spec.sourceId,
      sourceLabel: source?.label || spec.sourceId,
      sourceUrl: source?.url || null,
      collectedLabel,
    });
  }

  const sources = catalog.sources.map((source) => {
    const fetchResult = fetched[source.id];
    if (source.mode === "skip") {
      return {
        id: source.id,
        label: source.label,
        url: source.url,
        status: "not-collected",
        detail: SOURCE_DETAIL[source.id] || "",
      };
    }
    if (source.mode === "seed") {
      const failed = fetchResult?.status === "error";
      return {
        id: source.id,
        label: source.label,
        url: source.url,
        status: failed ? "error" : "unparsed",
        detail: failed
          ? `${fetchResult.error} ${SOURCE_DETAIL[source.id] || ""}`.trim()
          : SOURCE_DETAIL[source.id] || "",
      };
    }
    if (!fetchResult || fetchResult.status === "error") {
      return {
        id: source.id,
        label: source.label,
        url: source.url,
        status: "error",
        detail: fetchResult?.error || "sem resposta",
      };
    }
    return {
      id: source.id,
      label: source.label,
      url: source.url,
      status: "ok",
      detail: [SOURCE_DETAIL[source.id], ...(fetchResult.warnings || [])].filter(Boolean).join(" "),
    };
  });

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    timezone: "America/Sao_Paulo",
    collectedDateBrt: clock.date,
    collectedAtBrt: clock.label,
    unit: "USD por 1 milhão de tokens",
    previousCollectedDateBrt: canDelta ? previous.collectedDateBrt : null,
    models,
    sources,
  };
}

async function loadCatalog() {
  return JSON.parse(await readFile(path.join(ROOT, "data", "catalog.json"), "utf8"));
}

async function loadPrevious(today) {
  const historyDir = path.join(ROOT, "data", "history");
  let best = null;
  let bestDate = "";
  try {
    const files = await readdir(historyDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const date = file.slice(0, -5);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date >= today) continue;
      if (date > bestDate) {
        bestDate = date;
        best = JSON.parse(await readFile(path.join(historyDir, file), "utf8"));
      }
    }
  } catch {
    best = null;
  }
  if (best) return best;
  try {
    const latest = JSON.parse(await readFile(path.join(ROOT, "public", "latest.json"), "utf8"));
    if (latest.collectedDateBrt && latest.collectedDateBrt < today) return latest;
  } catch {
    return null;
  }
  return null;
}

async function fetchSourceOnce(source) {
  if (source.mode === "skip") return { status: "skipped", parsed: null, error: null, warnings: [] };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        "user-agent": "ai-prices/0.1 (+https://github.com/hedrosgames/ai-prices)",
        accept: "text/html",
      },
    });
    if (!response.ok) {
      return { status: "error", parsed: null, error: `HTTP ${response.status}`, warnings: [] };
    }
    const html = await response.text();
    if (source.mode === "seed" || !source.parser) {
      return { status: "unparsed", parsed: null, error: null, warnings: [] };
    }
    const parsed = PARSERS[source.parser](html);
    return { status: "ok", parsed, error: null, warnings: parsed.warnings || [] };
  } catch (error) {
    const message = error?.name === "AbortError" ? "timeout" : error?.message || "falha de rede";
    return { status: "error", parsed: null, error: message, warnings: [] };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSource(source) {
  let result = await fetchSourceOnce(source);
  if (result.status === "error") result = await fetchSourceOnce(source);
  return result;
}

export async function collect({ now = new Date() } = {}) {
  const signalsPromise = collectSignals({ now, writeHtml: false }).catch((error) => {
    console.error(`sinais: ${error?.message || error}`);
    return null;
  });
  const plansPromise = refreshPlansFile({ now }).catch(async (error) => {
    console.error(`planos: ${error?.message || error}`);
    try {
      return await loadPlans();
    } catch {
      return null;
    }
  });
  const promosPromise = refreshPromosFile({ now }).catch(async (error) => {
    console.error(`promoções: ${error?.message || error}`);
    try {
      return await loadPromos();
    } catch {
      return null;
    }
  });
  const catalog = await loadCatalog();
  const clock = brtParts(now);
  const previous = await loadPrevious(clock.date);
  const fetched = {};
  for (const source of catalog.sources) {
    if (source.mode === "skip") continue;
    fetched[source.id] = await fetchSource(source);
    const status = fetched[source.id].status;
    const error = fetched[source.id].error ? ` (${fetched[source.id].error})` : "";
    console.log(`${source.id}: ${status}${error}`);
  }
  const snapshot = buildSnapshot({ catalog, fetched, previous, now });
  const signals = await signalsPromise;
  const plansDoc = await plansPromise;
  const promosDoc = await promosPromise;
  const publicDir = path.join(ROOT, "public");
  const historyDir = path.join(ROOT, "data", "history");
  await mkdir(publicDir, { recursive: true });
  await mkdir(historyDir, { recursive: true });
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  await writeFile(path.join(publicDir, "latest.json"), json);
  await writeFile(path.join(historyDir, `${clock.date}.json`), json);
  await writeFile(path.join(publicDir, "index.html"), renderHtml(snapshot, signals, plansDoc, promosDoc));
  const planCount = (plansDoc?.products || []).reduce((sum, product) => sum + (product.plans || []).length, 0);
  const promoCount = (promosDoc?.offers || []).length;
  console.log(`planos: ${planCount}`);
  console.log(`promoções: ${promoCount}`);
  console.log(`modelos: ${snapshot.models.length}`);
  console.log(`arquivo: public/latest.json`);
  return snapshot;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  collect().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
