import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brtParts } from "./parse.mjs";
import { renderHtml } from "./render.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_WORDS = 5;
const GENERIC_TITLES = new Set([
  "blog",
  "news",
  "newsroom",
  "changelog",
  "release notes",
  "releases",
  "updates",
  "home",
  "rss",
  "what's new",
  "whats new",
  "latest news",
]);

const MONTH_INDEX = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(value) {
  return String(value ?? "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? all;
  });
}

export function cleanText(value) {
  const withoutCdata = String(value ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return decodeEntities(withoutCdata)
    .replace(/<[^>]+>/g, " ")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function toTopic(title, maxWords = MAX_WORDS) {
  const clean = cleanText(title).replace(/^[#*_>\s]+/, "").trim();
  if (!clean) return null;
  const generic = clean.toLowerCase().replace(/[:.]+$/g, "");
  if (GENERIC_TITLES.has(generic)) return null;
  const words = clean.split(" ").filter(Boolean).slice(0, maxWords);
  if (!words.length) return null;
  let topic = words.join(" ");
  if ([...topic].length > 48) topic = [...topic].slice(0, 48).join("").trim();
  return topic || null;
}

export function parseLooseDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const yearMonth = text.match(/^(\d{4})-(\d{2})$/);
  if (yearMonth) {
    return {
      iso: `${yearMonth[1]}-${yearMonth[2]}`,
      precision: "month",
      sort: Date.UTC(Number(yearMonth[1]), Number(yearMonth[2]) - 1, 1),
    };
  }
  const yearMonthDay = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yearMonthDay) {
    return {
      iso: `${yearMonthDay[1]}-${yearMonthDay[2]}-${yearMonthDay[3]}`,
      precision: "day",
      sort: Date.UTC(Number(yearMonthDay[1]), Number(yearMonthDay[2]) - 1, Number(yearMonthDay[3])),
    };
  }
  const named = text.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),\s+(\d{4})\b/i,
  );
  if (named && !/\d{1,2}:\d{2}/.test(text)) {
    const month = MONTH_INDEX[named[1].toLowerCase()];
    if (!month) return null;
    const day = String(named[2]).padStart(2, "0");
    const mon = String(month).padStart(2, "0");
    return {
      iso: `${named[3]}-${mon}-${day}`,
      precision: "day",
      sort: Date.UTC(Number(named[3]), month - 1, Number(named[2])),
    };
  }
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return null;
  const date = new Date(parsed);
  const utcMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;
  if (utcMidnight) {
    return { iso: date.toISOString().slice(0, 10), precision: "day", sort: parsed };
  }
  return { iso: date.toISOString(), precision: "instant", sort: parsed };
}

export function formatWhen(iso, precision) {
  if (!iso) return null;
  if (precision === "month") {
    const match = String(iso).match(/^(\d{4})-(\d{2})/);
    return match ? `${match[2]}/${match[1]}` : null;
  }
  if (precision === "day") {
    const match = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const [year, month, day] = brtParts(date).date.split("-");
  return `${day}/${month}/${year}`;
}

function extractTag(block, name) {
  const match = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? cleanText(match[1]) : "";
}

function extractLink(block) {
  const links = [];
  const pattern = /<link\b([^>]*)>([\s\S]*?)<\/link>|<link\b([^>]*)\/>/gi;
  for (const match of block.matchAll(pattern)) {
    const attrs = match[1] || match[3] || "";
    const hrefAttr = attrs.match(/href="([^"]+)"/i);
    const inner = match[2] ? cleanText(match[2]) : "";
    const href = hrefAttr ? decodeEntities(hrefAttr[1]) : inner;
    const rel = (attrs.match(/rel="([^"]+)"/i) || [])[1] || "";
    if (href) links.push({ href, rel });
  }
  const alternate = links.find((link) => /alternate/i.test(link.rel) && /^https?:/i.test(link.href));
  if (alternate) return alternate.href;
  const plain = links.find((link) => /^https?:/i.test(link.href) && !/self/i.test(link.rel));
  return plain?.href || null;
}

export function parseFeedItems(xml) {
  const parts = String(xml || "").split(/<(?:item|entry)\b/i).slice(1);
  const items = [];
  for (const part of parts) {
    const closed = part.split(/<\/(?:item|entry)>/i);
    if (closed.length < 2) continue;
    const block = closed[0];
    const title = extractTag(block, "title");
    if (!title) continue;
    const date =
      extractTag(block, "pubDate") ||
      extractTag(block, "published") ||
      extractTag(block, "updated") ||
      extractTag(block, "dc:date");
    items.push({ title, date: date || null, url: extractLink(block) });
  }
  return items;
}

export function pickLatestItem(items) {
  const usable = [];
  for (const item of items || []) {
    const topic = toTopic(item.title);
    if (!topic) continue;
    usable.push({ ...item, topic, parsed: parseLooseDate(item.date) });
  }
  if (!usable.length) return null;
  const dated = usable.filter((item) => item.parsed);
  const pool = dated.length ? dated : usable;
  pool.sort((a, b) => (b.parsed?.sort || 0) - (a.parsed?.sort || 0));
  const best = pool[0];
  return {
    topic: best.topic,
    url: best.url || null,
    date: best.parsed?.iso || null,
    precision: best.parsed?.precision || null,
  };
}

function absoluteUrl(href, base) {
  if (!href) return null;
  try {
    return new URL(href, base || undefined).href;
  } catch {
    return null;
  }
}

function lastHref(chunk) {
  const matches = [...String(chunk || "").matchAll(/href="([^"]+)"/gi)];
  return matches.length ? decodeEntities(matches[matches.length - 1][1]) : null;
}

export function parseAnthropicNews(html, pageUrl) {
  const items = [];
  for (const match of String(html).matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)) {
    const title = cleanText(match[1]);
    if (!toTopic(title)) continue;
    const ahead = html.slice(match.index, match.index + 1200);
    const time = ahead.match(/<time[^>]*>([\s\S]*?)<\/time>/i);
    if (!time) continue;
    const back = html.slice(Math.max(0, match.index - 800), match.index);
    items.push({
      title,
      date: cleanText(time[1]),
      url: absoluteUrl(lastHref(back), pageUrl),
    });
  }
  for (const match of String(html).matchAll(/<time[^>]*>([\s\S]*?)<\/time>([\s\S]{0,700}?)<h4[^>]*>([\s\S]*?)<\/h4>/gi)) {
    const back = html.slice(Math.max(0, match.index - 600), match.index);
    items.push({
      title: cleanText(match[3]),
      date: cleanText(match[1]),
      url: absoluteUrl(lastHref(back), pageUrl),
    });
  }
  return items;
}

export function parseGeminiChangelog(html, pageUrl) {
  const items = [];
  for (const match of String(html).matchAll(/<h2\b([^>]*)>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2\b|$)/gi)) {
    const heading = cleanText(match[2]);
    const parsed = parseLooseDate(heading);
    if (!parsed || parsed.precision !== "day") continue;
    const strong = match[3].match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
    const title = strong ? cleanText(strong[1]) : "";
    if (!title) continue;
    const id = (match[1].match(/id="([^"]+)"/i) || [])[1];
    items.push({
      title,
      date: parsed.iso,
      url: absoluteUrl(id ? `#${id}` : "", pageUrl),
    });
  }
  return items;
}

export function parseDeepseekChangelog(html, pageUrl) {
  const items = [];
  const pattern = /<h2\b[^>]*>([\s\S]*?)<\/h2>\s*<h3\b([^>]*)>([\s\S]*?)<\/h3>/gi;
  for (const match of String(html).matchAll(pattern)) {
    const id = (match[2].match(/id="([^"]+)"/i) || [])[1];
    items.push({
      title: cleanText(match[3]),
      date: cleanText(match[1]).replace(/^date:\s*/i, ""),
      url: absoluteUrl(id ? `#${id}` : "", pageUrl),
    });
  }
  return items;
}

export function parseXaiReleaseNotes(html, pageUrl) {
  const source = String(html);
  const headings = [...source.matchAll(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi)];
  const sections = [];
  for (let index = 0; index < headings.length; index += 1) {
    const id = (headings[index][1].match(/id="([^"]+)"/i) || [])[1] || "";
    const label = `${id} ${cleanText(headings[index][2])}`.toLowerCase();
    const monthName = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].find((name) =>
      new RegExp(`\\b${name}\\b`).test(label),
    );
    if (!monthName) continue;
    const yearMatch = label.match(/20\d{2}/);
    const start = headings[index].index + headings[index][0].length;
    const end = index + 1 < headings.length ? headings[index + 1].index : source.length;
    sections.push({
      month: MONTH_INDEX[monthName],
      year: yearMatch ? Number(yearMatch[0]) : null,
      start,
      end,
    });
  }
  if (!sections.length) return [];
  const explicitIndex = sections.findIndex((section) => section.year);
  if (explicitIndex > 0) {
    const year = sections[explicitIndex].year + 1;
    for (let index = 0; index < explicitIndex; index += 1) sections[index].year = year;
  }
  const first = sections[0];
  if (!first.year) return [];
  const body = source.slice(first.start, first.end);
  const note = /<h3\b([^>]*)>([\s\S]*?)<\/h3>/i.exec(body);
  if (!note) return [];
  const id = (note[1].match(/id="([^"]+)"/i) || [])[1];
  const month = String(first.month).padStart(2, "0");
  return [{ title: cleanText(note[2]), date: `${first.year}-${month}`, url: absoluteUrl(id ? `#${id}` : "", pageUrl) }];
}

export function parseGroqBlog(html, pageUrl) {
  const items = [];
  const pattern = /<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]{0,4000}?<h2[^>]*>([\s\S]*?)<\/h2>\s*<time\b[^>]*datetime="([^"]+)"/gi;
  for (const match of String(html).matchAll(pattern)) {
    items.push({ title: cleanText(match[2]), date: match[3], url: absoluteUrl(match[1], pageUrl) });
  }
  return items;
}

export function parseManusBlog(html, pageUrl) {
  const items = [];
  const pattern =
    /<a\b[^>]*href="(\/blog\/[^"]+)"[^>]*>[\s\S]{0,2500}?((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4})[\s\S]{0,500}?<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  for (const match of String(html).matchAll(pattern)) {
    items.push({ title: cleanText(match[3]), date: match[2], url: absoluteUrl(match[1], pageUrl) });
  }
  return items;
}

export function parseMimoHome(html, pageUrl) {
  const match =
    /<a\b[^>]*href="(https?:[^"]+)"[^>]*>[\s\S]{0,1500}?<\/a>[\s\S]{0,500}?<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(String(html));
  if (!match) return [];
  return [{ title: cleanText(match[2]), date: null, url: absoluteUrl(match[1], pageUrl) }];
}

export function parseCohereChangelog(html, pageUrl) {
  const items = [];
  const pattern = /<h2[^>]*>\s*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/gi;
  for (const match of String(html).matchAll(pattern)) {
    const title = cleanText(match[2]);
    if (!toTopic(title)) continue;
    items.push({ title, date: null, url: absoluteUrl(match[1], pageUrl) });
  }
  return items;
}

export function parseMetaBlog(html, pageUrl) {
  const items = [];
  const pattern = /<a\b[^>]*href="(https:\/\/ai\.meta\.com\/blog\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html).matchAll(pattern)) {
    const title = cleanText(match[2]);
    if (!toTopic(title) || title.length < 8) continue;
    const ahead = html.slice(match.index, match.index + 900);
    const date = ahead.match(
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/,
    );
    items.push({ title, date: date ? date[0] : null, url: match[1] });
  }
  return items;
}

export function parseFireworksBlog(html, pageUrl) {
  const match = /href="(\/blog\/(?!page(?:\/|$))[^"#?]+)"/i.exec(String(html));
  if (!match) return [];
  const window = html.slice(Math.max(0, match.index - 5000), match.index);
  const labels = [...window.matchAll(/\b(?:alt|title)="([^"]+)"/gi)];
  const title = labels.length ? decodeEntities(labels[labels.length - 1][1]) : "";
  if (!toTopic(title)) return [];
  return [{ title, date: null, url: absoluteUrl(match[1], pageUrl) }];
}

const HTML_PARSERS = {
  "anthropic-news": parseAnthropicNews,
  "gemini-changelog": parseGeminiChangelog,
  "deepseek-changelog": parseDeepseekChangelog,
  "xai-notes": parseXaiReleaseNotes,
  "groq-blog": parseGroqBlog,
  "manus-blog": parseManusBlog,
  "mimo-home": parseMimoHome,
  "cohere-changelog": parseCohereChangelog,
  "meta-blog": parseMetaBlog,
  "fireworks-blog": parseFireworksBlog,
};

export function parseSource(source, text, pageUrl) {
  if (!source) return [];
  if (source.type === "feed") return parseFeedItems(text);
  const parser = HTML_PARSERS[source.parser];
  if (!parser) return [];
  return parser(text, pageUrl) || [];
}

export function buildEntry(spec, observed, { hasPrevious = false, previousRow = null } = {}) {
  const base = {
    id: spec.id,
    name: spec.name,
    region: spec.region || null,
    group: spec.group || null,
    blurb: spec.blurb || null,
  };
  if (!observed?.topic) {
    if (previousRow?.topic) {
      return {
        ...base,
        topic: previousRow.topic,
        date: previousRow.date || null,
        dateLabel: previousRow.dateLabel || null,
        url: previousRow.url || spec.pageUrl || null,
        fingerprint: previousRow.fingerprint || null,
        isNew: false,
        carried: true,
      };
    }
    return {
      ...base,
      topic: null,
      date: null,
      dateLabel: null,
      url: spec.pageUrl || null,
      fingerprint: null,
      isNew: false,
      carried: false,
    };
  }
  const fingerprint = observed.url || `${observed.topic}|${observed.date || ""}`;
  const isNew = hasPrevious && fingerprint !== (previousRow?.fingerprint || null);
  return {
    ...base,
    topic: observed.topic,
    date: observed.date || null,
    dateLabel: formatWhen(observed.date, observed.precision),
    url: observed.url || spec.pageUrl || null,
    fingerprint,
    isNew,
    carried: false,
  };
}

export function assembleSignals({ releaseSpecs, radarSpecs, releaseObserved, radarObserved, previous, now = new Date() }) {
  const clock = brtParts(now);
  const hasPrevious = Boolean(previous);
  const releasePrev = new Map((previous?.releases || []).map((row) => [row.id, row]));
  const radarPrev = new Map((previous?.radar || []).map((row) => [row.id, row]));
  const mapRows = (specs, observed, prev) =>
    specs.map((spec) =>
      buildEntry(spec, observed.get(spec.id) || null, {
        hasPrevious,
        previousRow: prev.get(spec.id) || null,
      }),
    );
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    timezone: "America/Sao_Paulo",
    collectedDateBrt: clock.date,
    collectedAtBrt: clock.label,
    previousCollectedDateBrt: previous?.collectedDateBrt || null,
    releases: mapRows(releaseSpecs, releaseObserved, releasePrev),
    radar: mapRows(radarSpecs, radarObserved, radarPrev),
  };
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  const size = Math.min(limit, items.length);
  if (size > 0) await Promise.all(Array.from({ length: size }, () => run()));
  return results;
}

async function fetchTextOnce(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; ai-prices/0.1; +https://github.com/hedrosgames/ai-prices)",
        accept: "text/html, application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8",
      },
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}`, text: "" };
    const text = await response.text();
    return { ok: true, error: null, text };
  } catch (error) {
    const message = error?.name === "AbortError" ? "timeout" : error?.message || "falha de rede";
    return { ok: false, error: message, text: "" };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url) {
  let result = await fetchTextOnce(url);
  if (!result.ok) result = await fetchTextOnce(url);
  return result;
}

async function observeSpec(spec) {
  const items = [];
  for (const source of spec.sources || []) {
    const fetched = await fetchText(source.url);
    if (!fetched.ok) {
      console.log(`${spec.id}: ${fetched.error}`);
      continue;
    }
    try {
      items.push(...parseSource(source, fetched.text, spec.pageUrl));
    } catch (error) {
      console.log(`${spec.id}: ${error?.message || "parser"}`);
    }
  }
  const latest = pickLatestItem(items);
  console.log(`${spec.id}: ${latest?.topic || "—"}`);
  return latest;
}

async function loadCatalog() {
  return JSON.parse(await readFile(path.join(ROOT, "data", "signals-catalog.json"), "utf8"));
}

async function loadPreviousSignals(today) {
  const historyDir = path.join(ROOT, "data", "history", "signals");
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
    const releases = JSON.parse(await readFile(path.join(ROOT, "public", "releases.json"), "utf8"));
    const radar = JSON.parse(await readFile(path.join(ROOT, "public", "radar.json"), "utf8"));
    const date = releases.collectedDateBrt;
    if (date && date < today && radar.collectedDateBrt === date) {
      return { ...releases, radar: radar.radar || [] };
    }
  } catch {
    return null;
  }
  return null;
}

function publicPayload(signals, key) {
  return {
    schemaVersion: signals.schemaVersion,
    generatedAt: signals.generatedAt,
    timezone: signals.timezone,
    collectedDateBrt: signals.collectedDateBrt,
    collectedAtBrt: signals.collectedAtBrt,
    previousCollectedDateBrt: signals.previousCollectedDateBrt,
    [key]: signals[key],
  };
}

export async function collectSignals({ now = new Date(), writeHtml = false } = {}) {
  const catalog = await loadCatalog();
  const clock = brtParts(now);
  const previous = await loadPreviousSignals(clock.date);
  const jobs = [
    ...(catalog.releases || []).map((spec) => ({ bucket: "releases", spec })),
    ...(catalog.radar || []).map((spec) => ({ bucket: "radar", spec })),
  ];
  const releaseObserved = new Map();
  const radarObserved = new Map();
  await mapPool(jobs, 4, async (job) => {
    const observed = await observeSpec(job.spec);
    const target = job.bucket === "radar" ? radarObserved : releaseObserved;
    target.set(job.spec.id, observed);
  });
  const signals = assembleSignals({
    releaseSpecs: catalog.releases || [],
    radarSpecs: catalog.radar || [],
    releaseObserved,
    radarObserved,
    previous,
    now,
  });
  const historyDir = path.join(ROOT, "data", "history", "signals");
  const publicDir = path.join(ROOT, "public");
  await mkdir(historyDir, { recursive: true });
  await mkdir(publicDir, { recursive: true });
  const snapshotJson = `${JSON.stringify(signals, null, 2)}\n`;
  await writeFile(path.join(historyDir, `${clock.date}.json`), snapshotJson);
  await writeFile(path.join(publicDir, "releases.json"), `${JSON.stringify(publicPayload(signals, "releases"), null, 2)}\n`);
  await writeFile(path.join(publicDir, "radar.json"), `${JSON.stringify(publicPayload(signals, "radar"), null, 2)}\n`);
  const known = signals.releases.filter((row) => row.topic).length;
  const fresh = [...signals.releases, ...signals.radar].filter((row) => row.isNew).length;
  console.log(`lançamentos com título: ${known}/${signals.releases.length}`);
  console.log(`novos vs coleta anterior: ${fresh}`);
  if (writeHtml) {
    try {
      const latest = JSON.parse(await readFile(path.join(publicDir, "latest.json"), "utf8"));
      await writeFile(path.join(publicDir, "index.html"), renderHtml(latest, signals));
    } catch (error) {
      console.log(`html: ${error?.message || "sem latest.json"}`);
    }
  }
  return signals;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  collectSignals({ writeHtml: true }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
