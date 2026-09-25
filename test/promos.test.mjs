import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { renderHtml } from "../scripts/render.mjs";
import {
  formatPromoUntil,
  loadPromos,
  offerStillListed,
  refreshPromos,
  visiblePromos,
} from "../scripts/promos.mjs";

test("promos.json só lista oferta com URL oficial", async () => {
  const doc = await loadPromos();
  assert.equal(doc.schemaVersion, 1);
  assert.ok(doc.offers.length > 0);
  const ids = new Set();
  for (const offer of doc.offers) {
    assert.equal(ids.has(offer.id), false);
    ids.add(offer.id);
    assert.ok(offer.product);
    assert.ok(offer.offer);
    assert.ok(offer.region);
    assert.ok(offer.agent);
    assert.match(offer.url, /^https:\/\//);
    assert.ok(offer.match);
    assert.ok(offer.validUntil == null || /^\d{4}-\d{2}-\d{2}$/.test(offer.validUntil));
  }
});

test("formatPromoUntil e filtro de expiração", () => {
  assert.equal(formatPromoUntil(null), "—");
  assert.equal(formatPromoUntil("2026-10-31"), "31/10/2026");
  const doc = {
    offers: [
      { id: "live", product: "A", offer: "x", region: "US", validUntil: "2026-10-31", url: "https://example.com", agent: "Codex" },
      { id: "done", product: "B", offer: "y", region: "BR", validUntil: "2026-09-01", url: "https://example.com" },
    ],
  };
  const now = new Date("2026-09-25T15:00:00Z");
  assert.deepEqual(visiblePromos(doc, now).map((offer) => offer.id), ["live"]);
});

test("refresh mantém oferta se o fetch falha e tira se a página não confirma", async () => {
  const doc = {
    offers: [
      {
        id: "keep",
        product: "ChatGPT Plus",
        offer: "4 meses grátis",
        region: "US",
        validUntil: "2026-10-31",
        url: "https://help.openai.com/offer",
        match: "four free monthly billing periods",
        agent: "Codex",
        checked: "2026-09-01",
      },
      {
        id: "drop",
        product: "GLM Coding Plan",
        offer: "-50% créditos",
        region: "Global",
        validUntil: "2026-10-07",
        url: "https://docs.z.ai/devpack/overview",
        match: "September 25 to October 7, 2026",
        agent: "GLM Coding",
        checked: "2026-09-01",
      },
      {
        id: "chat",
        product: "Notion",
        offer: "grátis",
        region: "Global",
        validUntil: null,
        url: "https://www.notion.com/pricing",
        match: "Plus",
        checked: "2026-09-01",
      },
      {
        id: "old",
        product: "Cursor",
        offer: "R$ 500 / 1 ano",
        region: "BR",
        validUntil: "2026-09-01",
        url: "https://cursor.com/pricing",
        match: "R$ 500",
        agent: "Cursor",
        checked: "2026-08-01",
      },
    ],
    history: [],
  };
  const now = new Date("2026-09-25T15:00:00Z");
  await refreshPromos(doc, {
    now,
    fetchPage: async (url) => {
      if (url.includes("openai.com")) return null;
      if (url.includes("z.ai")) return "<html>pricing only</html>";
      return null;
    },
  });
  assert.deepEqual(doc.offers.map((offer) => offer.id), ["keep"]);
  assert.equal(doc.offers[0].checked, "2026-09-01");
  assert.deepEqual(doc.history.map((offer) => offer.reason), ["not-agent", "expired", "unconfirmed"]);
  assert.equal(offerStillListed("four free monthly billing periods of ChatGPT Plus", doc.offers[0]), true);
});

test("a aba Promoções lista a oferta e some quando não há nenhuma", async () => {
  const snapshot = JSON.parse(await readFile(new URL("../public/latest.json", import.meta.url), "utf8"));
  const signals = { releases: [], radar: [] };
  const promos = await loadPromos();
  const html = renderHtml(snapshot, signals, null, promos);
  assert.match(html, /tab-btn-promocoes/);
  assert.match(html, /Google AI Pro/);
  assert.doesNotMatch(html, /Google AI Plus/);
  assert.match(html, /12 meses grátis/);
  assert.match(html, />US</);
  assert.match(html, /31\/12\/2026/);
  assert.match(html, /blog\.google/);
  assert.match(html, /id="page-lancamentos"/);
  assert.match(html, /id="page-radar"/);
  const empty = renderHtml(snapshot, signals, null, { offers: [] });
  assert.match(empty, /Nenhuma promoção oficial ativa/);
  assert.doesNotMatch(empty, /Google AI Plus/);
});
