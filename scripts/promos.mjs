import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brtParts } from "./parse.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function promosPath(root = ROOT) {
  return path.join(root, "data", "promos.json");
}

export async function loadPromos(root = ROOT) {
  return JSON.parse(await readFile(promosPath(root), "utf8"));
}

export async function savePromos(doc, root = ROOT) {
  await writeFile(promosPath(root), `${JSON.stringify(doc, null, 2)}\n`);
}

export function formatPromoUntil(value) {
  if (!value) return "—";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "—";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function visiblePromos(doc, now = new Date()) {
  const today = brtParts(now).date;
  return (doc?.offers || []).filter((offer) => offer.agent && (!offer.validUntil || offer.validUntil >= today));
}

function needlesOf(match) {
  if (!match) return [];
  return Array.isArray(match) ? match : [match];
}

export function offerStillListed(html, offer) {
  const needles = needlesOf(offer?.match);
  if (!html || !needles.length) return false;
  return needles.every((needle) => html.includes(needle));
}

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

export async function refreshPromos(doc, { now = new Date(), fetchPage = defaultFetch } = {}) {
  const today = brtParts(now).date;
  doc.history = doc.history || [];
  const pending = [];
  for (const offer of doc.offers || []) {
    if (offer.validUntil && offer.validUntil < today) {
      doc.history.push({ ...offer, removed: today, reason: "expired" });
    } else if (!offer.agent) {
      doc.history.push({ ...offer, removed: today, reason: "not-agent" });
    } else {
      pending.push(offer);
    }
  }
  const pages = new Map();
  const urls = [...new Set(pending.map((offer) => offer.url).filter(Boolean))];
  await mapPool(urls, 5, async (url) => {
    pages.set(url, await fetchPage(url));
  });
  const kept = [];
  for (const offer of pending) {
    const html = offer.url ? pages.get(offer.url) : null;
    if (!html) {
      kept.push(offer);
      continue;
    }
    if (offerStillListed(html, offer)) {
      offer.checked = today;
      kept.push(offer);
      continue;
    }
    doc.history.push({ ...offer, removed: today, reason: "unconfirmed" });
  }
  doc.offers = kept;
  doc.checked = today;
  return doc;
}

export async function refreshPromosFile({ now = new Date(), root = ROOT } = {}) {
  const doc = await loadPromos(root);
  await refreshPromos(doc, { now });
  await savePromos(doc, root);
  return doc;
}
