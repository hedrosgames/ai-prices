const PRICE_DIVISOR_XAI = 10000;

export function sanePrice(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1000;
}

export function roundPrice(value) {
  return Math.round(value * 1e6) / 1e6;
}

export function formatUsd(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const text = roundPrice(Number(value)).toFixed(4);
  return text.replace(/0+$/, "").replace(/\.$/, "");
}

export function brtParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value ?? "";
  const dateLabel = `${pick("year")}-${pick("month")}-${pick("day")}`;
  return {
    date: dateLabel,
    label: `${pick("day")}/${pick("month")}/${pick("year")} ${pick("hour")}:${pick("minute")} BRT`,
  };
}

function dollars(chunk) {
  return [...chunk.matchAll(/\$([0-9]+(?:\.[0-9]+)?)/g)].map((match) => Number(match[1]));
}

export function parseOpenAI(html) {
  const start = html.indexOf(">gpt-6-astra</span>");
  if (start < 0) throw new Error("tabela Standard não encontrada");
  const batch = html.indexOf(">Batch<", start);
  const slice = html.slice(start, batch > 0 ? batch : start + 30000);
  const ids = [];
  for (const match of slice.matchAll(/>(gpt-[a-z0-9][a-z0-9.-]*)<\/span>/g)) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  const models = {};
  for (const id of ids) {
    const row = new RegExp(`>${id}</span>([\\s\\S]*?)(?:>gpt-|$)`).exec(slice);
    if (!row) continue;
    const nums = dollars(row[1]);
    if (nums.length < 8) continue;
    const short = { input: nums[0], output: nums[3] };
    const long = { input: nums[4], output: nums[7] };
    if (!sanePrice(short.input) || !sanePrice(short.output) || !sanePrice(long.input) || !sanePrice(long.output)) {
      continue;
    }
    models[id] = {
      short,
      long,
    };
  }
  if (!models["gpt-6-astra"]) throw new Error("gpt-6-astra ausente na tabela Standard");
  return { models };
}

export function parseAnthropic(html) {
  const start = html.indexOf(">Claude Fable 5.1</td>");
  if (start < 0) throw new Error("tabela de modelos não encontrada");
  const batch = html.indexOf("Batch processing", start);
  const slice = html.slice(start, batch > 0 ? batch : start + 80000);
  const models = {};
  const row =
    />(Claude [^<]+)<\/td><td[^>]*>\$([0-9.]+) \/ MTok<\/td><td[^>]*>\$([0-9.]+) \/ MTok<\/td><td[^>]*>\$([0-9.]+) \/ MTok<\/td><td[^>]*>\$([0-9.]+) \/ MTok(?:<sup>\d+<\/sup>)?<\/td><td[^>]*>\$([0-9.]+) \/ MTok<\/td>/g;
  for (const match of slice.matchAll(row)) {
    const input = Number(match[2]);
    const output = Number(match[6]);
    if (!sanePrice(input) || !sanePrice(output)) continue;
    models[match[1]] = {
      input,
      output,
    };
  }
  if (!models["Claude Opus 5"]) throw new Error("Claude Opus 5 ausente");
  return { models };
}

export function parseGemini(html) {
  const ids = [...html.matchAll(/id="(gemini-3\.[0-9]+-flash)"/g)].map((match) => match[1]);
  const unique = [...new Set(ids)];
  if (!unique.length) throw new Error("nenhum heading gemini-3.x-flash");
  const models = {};
  for (const id of unique) {
    const start = html.indexOf(`id="${id}"`);
    const next = html.indexOf("<h2", start + 10);
    const section = html.slice(start, next > 0 ? next : start + 12000);
    const standardEnd = section.search(/\bBatch\b/);
    const standard = section.slice(0, standardEnd > 0 ? standardEnd : section.length);
    const inputMatch = standard.match(/Input price[\s\S]{0,2500}?\$([0-9.]+)/);
    const outputMatch = standard.match(/Output price[\s\S]{0,2500}?\$([0-9.]+)/);
    if (!inputMatch || !outputMatch) continue;
    const input = Number(inputMatch[1]);
    const output = Number(outputMatch[1]);
    if (!sanePrice(input) || !sanePrice(output)) continue;
    const through = standard.match(/through ([A-Za-z]+ \d{1,2}, \d{4})/);
    const laterIn = standard.match(/\$([0-9.]+) starting ([A-Za-z]+ \d{1,2}, \d{4})/);
    const laterOut = [...standard.matchAll(/Output price[\s\S]{0,700}?\$([0-9.]+) starting ([A-Za-z]+ \d{1,2}, \d{4})/g)][0];
    const bits = ["Standard, paid tier."];
    if (through) bits.push(`Valor vigente até ${through[1]}.`);
    if (laterIn && laterOut) {
      bits.push(`A página também lista $${laterIn[1]} / $${laterOut[1]} a partir de ${laterIn[2]}.`);
    }
    models[id] = { input, output, note: bits.join(" ") };
  }
  if (!models["gemini-3.8-flash"]) throw new Error("gemini-3.8-flash ausente");
  return { models };
}

export function parseXai(html) {
  const key = "globalThis.__XAI_PUBLIC_MODELS__=";
  const start = html.indexOf(key);
  if (start < 0) throw new Error("JSON público de modelos não encontrado");
  const end = html.indexOf("</script>", start);
  if (end < 0) throw new Error("script de modelos sem fechamento");
  const data = JSON.parse(html.slice(start + key.length, end).trim().replace(/;$/, ""));
  const models = {};
  const warnings = [];
  for (const cluster of data.clusterConfigs || []) {
    for (const model of cluster.languageModels || []) {
      const input = Number(model.promptTextTokenPrice) / PRICE_DIVISOR_XAI;
      const output = Number(model.completionTextTokenPrice) / PRICE_DIVISOR_XAI;
      const longIn = Number(model.promptTextTokenPriceLongContext) / PRICE_DIVISOR_XAI;
      const longOut = Number(model.completionTokenPriceLongContext) / PRICE_DIVISOR_XAI;
      if (!sanePrice(input) || !sanePrice(output)) continue;
      const entry = {
        short: { input, output },
        long: sanePrice(longIn) && sanePrice(longOut) ? { input: longIn, output: longOut } : null,
        note: model.longContextThreshold
          ? `Abaixo de ${model.longContextThreshold} tokens de prompt. Contexto longo: $${formatUsd(longIn)} / $${formatUsd(longOut)}.`
          : "Preço de texto abaixo do limiar de contexto longo.",
      };
      if (!models[model.name]) {
        models[model.name] = entry;
      } else if (models[model.name].short.input !== input || models[model.name].short.output !== output) {
        warnings.push(`${model.name} diverge entre clusters; mantido o primeiro valor`);
      }
    }
  }
  if (!models["grok-4.3"]) throw new Error("grok-4.3 ausente");
  return { models, warnings };
}

export function parseMimo(html) {
  const start = html.indexOf("Overseas Pricing");
  if (start < 0) throw new Error("seção overseas não encontrada");
  const end = html.indexOf("Pricing for Web Search", start);
  let slice = html.slice(start, end > 0 ? end : start + 40000);
  const batch = slice.indexOf("Batch API");
  if (batch > 0) slice = slice.slice(0, batch);
  const models = {};
  const rows = slice.split(/<tr\b/i).slice(1);
  for (const row of rows) {
    const names = [...row.matchAll(/mdx-code-inline">([^<]+)<\/code>/g)].map((match) => match[1].trim());
    const prices = dollars(row);
    if (names.length === 0 || prices.length < 3) continue;
    const cacheHit = prices[0];
    const input = prices[1];
    const output = prices[2];
    if (!sanePrice(input) || !sanePrice(output) || !sanePrice(cacheHit)) continue;
    for (const name of names) {
      models[name] = {
        input,
        output,
        note: `Real-time API, USD. Input da tabela é cache miss. Cache hit $${formatUsd(cacheHit)}.`,
      };
    }
  }
  if (!models["mimo-v2.6-pro"]) throw new Error("mimo-v2.6-pro ausente");
  return { models };
}

export function pickOfficial(parsed, match) {
  if (!parsed || !match?.model) return null;
  const entry = parsed.models?.[match.model];
  if (!entry) return null;
  if (match.field === "long") {
    if (!entry.long) return null;
    return { ...entry.long, note: entry.note };
  }
  if (match.field === "short") {
    const tier = entry.short || entry;
    return { input: tier.input, output: tier.output, note: entry.note };
  }
  if (entry.input == null) return null;
  return { input: entry.input, output: entry.output, note: entry.note };
}
