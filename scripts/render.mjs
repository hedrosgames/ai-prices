import { formatUsd } from "./parse.mjs";
import { formatPlanPrice } from "./plans.mjs";
import { formatPromoUntil, visiblePromos } from "./promos.mjs";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function deltaCell(input, output) {
  if (input == null && output == null) return "—";
  const part = (value) => {
    if (value == null) return "—";
    if (value === 0) return "0";
    const sign = value > 0 ? "+" : "";
    return `${sign}${formatUsd(value)}`;
  };
  return `${part(input)} / ${part(output)}`;
}

function deltaClass(input, output) {
  if (input == null && output == null) return "flat";
  const score = (input || 0) + (output || 0);
  if (score > 0) return "up";
  if (score < 0) return "down";
  return "flat";
}

function sourceStatusLabel(status) {
  if (status === "ok") return "coletado";
  if (status === "error") return "falhou";
  if (status === "unparsed") return "sem tabela numérica";
  if (status === "seed-only") return "só seed";
  return "não coletado";
}

function extractAaScore(label) {
  if (!label) return null;
  const match = String(label).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function sourceHostLink(url) {
  if (!url) return "—";
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    host = url;
  }
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(host)}</a>`;
}

function renderGroupedRows(rows, key, labels, renderRow) {
  let html = "";
  let current = null;
  for (const row of rows) {
    const group = row[key];
    if (group !== current) {
      current = group;
      const label = labels[group];
      if (label) html += `<tr class="signal-group"><th colspan="4">${escapeHtml(label)}</th></tr>`;
    }
    html += renderRow(row);
  }
  return html;
}

export function renderSignalSections(signals) {
  const releases = signals?.releases || [];
  const radar = signals?.radar || [];
  const releaseRows = releases.length
    ? renderGroupedRows(releases, "region", { us: "EUA", cn: "China" }, (row) => {
        const cls = row.isNew ? ` class="is-new"` : "";
        const topic = row.topic ? escapeHtml(row.topic) : "—";
        const when = row.dateLabel ? escapeHtml(row.dateLabel) : "—";
        return `<tr${cls}><td>${escapeHtml(row.name)}</td><td>${topic}</td><td>${when}</td><td>${sourceHostLink(row.url)}</td></tr>`;
      })
    : `<tr><td colspan="4">—</td></tr>`;
  const radarRows = radar.length
    ? renderGroupedRows(radar, "group", { aggregator: "Agregadores", harness: "Harnesses" }, (row) => {
        const cls = row.isNew ? ` class="is-new"` : "";
        const news = row.isNew && row.topic ? escapeHtml(row.topic) : "—";
        const blurb = row.blurb ? escapeHtml(row.blurb) : "—";
        return `<tr${cls}><td>${escapeHtml(row.name)}</td><td>${blurb}</td><td>${news}</td><td>${sourceHostLink(row.url)}</td></tr>`;
      })
    : `<tr><td colspan="4">—</td></tr>`;
  return `<div id="page-lancamentos" class="page-panel" role="tabpanel" aria-labelledby="tab-btn-lancamentos">
      <div class="table-card">
        <table class="signal-table">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Último</th>
              <th>Quando</th>
              <th>Fonte</th>
            </tr>
          </thead>
          <tbody>
            ${releaseRows}
          </tbody>
        </table>
      </div>
    </div>
    <div id="page-radar" class="page-panel" role="tabpanel" aria-labelledby="tab-btn-radar">
      <div class="table-card">
        <table class="signal-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>O que é</th>
              <th>Novidade</th>
              <th>Fonte</th>
            </tr>
          </thead>
          <tbody>
            ${radarRows}
          </tbody>
        </table>
      </div>
    </div>`;
}

export function renderPromosSection(promosDoc) {
  const offers = visiblePromos(promosDoc);
  const body = offers.length
    ? offers.map((offer) => `<tr>
        <td>${escapeHtml(offer.product)}</td>
        <td>${escapeHtml(offer.offer)}</td>
        <td>${escapeHtml(offer.region)}</td>
        <td>${escapeHtml(formatPromoUntil(offer.validUntil))}</td>
        <td>${sourceHostLink(offer.url)}</td>
      </tr>`).join("\n")
    : `<tr><td colspan="5">Nenhuma promoção oficial ativa</td></tr>`;
  return `<div id="page-promocoes" class="page-panel" role="tabpanel" aria-labelledby="tab-btn-promocoes">
      <div class="table-card">
        <table class="signal-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Oferta</th>
              <th>Região</th>
              <th>Válida até</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            ${body}
          </tbody>
        </table>
      </div>
    </div>`;
}

export function renderPlansSection(plansDoc) {
  const products = plansDoc?.products || [];
  if (!products.length) return "";
  const rows = [];
  for (const product of products) {
    for (const plan of product.plans || []) {
      const href = plan.sourceUrl || product.sourceUrl || "";
      const label = `${product.company} · ${product.product}`;
      const search = `${product.company} ${product.product} ${plan.name}`.toLowerCase();
      const priceAttr = plan.monthly == null ? "" : String(plan.monthly);
      rows.push(`<tr data-search="${escapeHtml(search)}" data-product="${escapeHtml(label)}" data-plan="${escapeHtml(plan.name)}" data-price="${escapeHtml(priceAttr)}">
        <td>${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>` : escapeHtml(label)}</td>
        <td>${escapeHtml(plan.name)}</td>
        <td class="price-month">${escapeHtml(formatPlanPrice(plan))}</td>
      </tr>`);
    }
  }
  return `<section class="plans-section" id="planos">
      <h2 class="section-title">Planos</h2>
      <div class="controls-bar">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input id="plans-q" class="search-input" type="search" placeholder="Buscar empresa ou plano" aria-label="Buscar plano">
        </div>
      </div>
      <div class="table-card">
        <table>
          <thead>
            <tr>
              <th data-plan-sort="product">Empresa/Produto</th>
              <th data-plan-sort="plan">Plano</th>
              <th data-plan-sort="price">Preço/mês</th>
            </tr>
          </thead>
          <tbody id="plans-body">
            ${rows.join("\n")}
          </tbody>
        </table>
        <div id="plans-empty" hidden>Nenhum plano encontrado.</div>
      </div>
    </section>
    <h2 class="section-title">API</h2>`;
}

export function renderHtml(snapshot, signals = null, plansDoc = null, promosDoc = null) {
  const models = snapshot.models || [];
  const maxInput = Math.max(...models.map((m) => m.inputPerMillion || 0), 1);
  const maxOutput = Math.max(...models.map((m) => m.outputPerMillion || 0), 1);

  // Identify standout models for KPI cards
  const validModels = models.filter((m) => m.inputPerMillion != null && m.outputPerMillion != null);
  const cheapestInput = [...validModels].sort((a, b) => a.inputPerMillion - b.inputPerMillion)[0];
  const cheapestOutput = [...validModels].sort((a, b) => a.outputPerMillion - b.outputPerMillion)[0];
  const highestQuality = [...validModels]
    .filter((m) => extractAaScore(m.aaLabel) != null)
    .sort((a, b) => (extractAaScore(b.aaLabel) || 0) - (extractAaScore(a.aaLabel) || 0))[0];
  
  // Best sweet-spot: high AA index with blended price under $5
  const sweetSpot = [...validModels]
    .filter((m) => {
      const score = extractAaScore(m.aaLabel);
      const blended = (m.inputPerMillion * 3 + m.outputPerMillion) / 4;
      return score != null && score >= 40 && blended <= 5;
    })
    .sort((a, b) => {
      const scoreA = extractAaScore(a.aaLabel) || 0;
      const scoreB = extractAaScore(b.aaLabel) || 0;
      const blendA = (a.inputPerMillion * 3 + a.outputPerMillion) / 4;
      const blendB = (b.inputPerMillion * 3 + b.outputPerMillion) / 4;
      return scoreB / blendB - scoreA / blendA;
    })[0] || cheapestInput;

  // Render Table Rows
  const rows = models
    .map((model) => {
      const search = `${model.family} ${model.name} ${model.variant || ""} ${model.note || ""}`.toLowerCase();
      const badge = model.priceStatus === "official" ? "oficial" : `seed ${escapeHtml(model.priceAsOf)}`;
      const badgeClass = model.priceStatus === "official" ? "badge-official" : "badge-seed";
      const href = model.sourceUrl
        ? `<a href="${escapeHtml(model.sourceUrl)}" target="_blank" rel="noopener" class="source-link">${escapeHtml(model.sourceLabel)}</a>`
        : `<span class="source-link">${escapeHtml(model.sourceLabel)}</span>`;

      // Clean notes: isolate extra detail for tooltip
      let extraDetail = model.note || "";
      if (model.variant && extraDetail.startsWith(model.variant)) {
        extraDetail = extraDetail.slice(model.variant.length).replace(/^[\s·.,]+/, "").trim();
      }
      const infoTooltip = extraDetail
        ? `<span class="tooltip-trigger" tabindex="0" aria-label="${escapeHtml(extraDetail)}"><span class="info-icon">ℹ</span><span class="tooltip-box">${escapeHtml(extraDetail)}</span></span>`
        : "";

      const variantChip = model.variant
        ? `<span class="variant-chip">${escapeHtml(model.variant)}</span>`
        : "";

      // Bar percentages
      const inPct = Math.min(100, Math.max(3, Math.round(((model.inputPerMillion || 0) / maxInput) * 100)));
      const outPct = Math.min(100, Math.max(3, Math.round(((model.outputPerMillion || 0) / maxOutput) * 100)));

      // Blended Cost (3:1 standard ratio)
      const blendedCost = ((model.inputPerMillion * 3 + model.outputPerMillion) / 4);
      const blendedFormatted = formatUsd(blendedCost);

      // AA Index Pill
      const aaScore = extractAaScore(model.aaLabel);
      const aaContent = aaScore
        ? `<div class="aa-pill" title="${escapeHtml(model.aaLabel)}"><span class="aa-val">${aaScore}</span><span class="aa-sub">AA</span></div>`
        : `<span class="aa-na" title="${model.aaLabel ? escapeHtml(model.aaLabel) : 'Sem benchmark registrado'}">—</span>`;

      return `<tr data-family="${escapeHtml(model.family)}" data-search="${escapeHtml(search)}" data-id="${escapeHtml(model.id)}" data-in="${model.inputPerMillion}" data-out="${model.outputPerMillion}" data-blended="${blendedCost.toFixed(4)}" data-aa="${aaScore ?? 0}" data-name="${escapeHtml(model.name)}">
        <td class="col-model">
          <div class="model-cell">
            <span class="family-tag family-${escapeHtml(model.family.toLowerCase())}">${escapeHtml(model.family)}</span>
            <div class="name-box">
              <span class="model-name">${escapeHtml(model.name)}</span>
              ${variantChip}
              ${infoTooltip}
            </div>
          </div>
        </td>
        <td class="col-num" data-val="${model.inputPerMillion}">
          <div class="price-box">
            <span class="price-val">$${formatUsd(model.inputPerMillion)}</span>
            <div class="mini-bar-track"><div class="mini-bar in-bar" style="width: ${inPct}%"></div></div>
          </div>
        </td>
        <td class="col-num" data-val="${model.outputPerMillion}">
          <div class="price-box">
            <span class="price-val">$${formatUsd(model.outputPerMillion)}</span>
            <div class="mini-bar-track"><div class="mini-bar out-bar" style="width: ${outPct}%"></div></div>
          </div>
        </td>
        <td class="col-num col-blended" data-val="${blendedCost.toFixed(4)}">
          <span class="blended-val">$${blendedFormatted}</span>
        </td>
        <td class="col-center" data-val="${aaScore ?? 0}">
          ${aaContent}
        </td>
        <td class="col-delta col-center ${deltaClass(model.deltaInput, model.deltaOutput)}">
          ${deltaCell(model.deltaInput, model.deltaOutput)}
        </td>
        <td class="col-source">
          <div class="source-box">
            ${href}
            <span class="badge ${badgeClass}">${badge}</span>
          </div>
        </td>
      </tr>`;
    })
    .join("\n");

  const families = [...new Set(models.map((m) => m.family))];
  const filterButtons = ["Todas", ...families]
    .map((family, idx) => {
      const val = idx === 0 ? "all" : family;
      const active = idx === 0 ? "active" : "";
      return `<button type="button" class="filter-btn ${active}" data-filter="${escapeHtml(val)}">${escapeHtml(family)}</button>`;
    })
    .join("");

  const sourcesList = (snapshot.sources || [])
    .map((source) => {
      const link = source.url
        ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(source.label)}</a>`
        : escapeHtml(source.label);
      const badgeType = source.status === "ok" ? "badge-official" : source.status === "error" ? "badge-err" : "badge-seed";
      return `<div class="source-card">
        <div class="source-header">
          <strong>${link}</strong>
          <span class="badge ${badgeType}">${escapeHtml(sourceStatusLabel(source.status))}</span>
        </div>
        <div class="source-desc">${escapeHtml(source.detail || "")}</div>
      </div>`;
    })
    .join("");

  const seedCount = models.filter((m) => m.priceStatus === "seed").length;

  return `<!DOCTYPE html>
<html lang="pt-BR" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Prices — Radar Visual de Preços de APIs de IA</title>
  <meta name="description" content="Dashboard visual e analítico de preços de API de modelos de IA em USD por 1 milhão de tokens. Sem ruído, direto ao ponto.">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(22, 29, 47, 0.85);
      --card-border: rgba(255, 255, 255, 0.08);
      --card-hover: rgba(30, 41, 67, 0.95);
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --accent: #38bdf8;
      --accent-rgb: 56, 189, 248;
      --accent-glow: rgba(56, 189, 248, 0.15);
      --in-color: #38bdf8;
      --out-color: #a855f7;
      --success: #10b981;
      --success-bg: rgba(16, 185, 129, 0.15);
      --warning: #f59e0b;
      --warning-bg: rgba(245, 158, 11, 0.15);
      --danger: #ef4444;
      --chip-bg: rgba(255, 255, 255, 0.06);
      --table-header-bg: #111726;
      --table-row-hover: rgba(56, 189, 248, 0.04);
      --radius: 12px;
      --radius-sm: 6px;
      --shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    }
    :root[data-theme="light"] {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --card-border: #e2e8f0;
      --card-hover: #f1f5f9;
      --text: #0f172a;
      --text-muted: #475569;
      --text-dim: #94a3b8;
      --accent: #0284c7;
      --accent-rgb: 2, 132, 199;
      --accent-glow: rgba(2, 132, 199, 0.12);
      --in-color: #0284c7;
      --out-color: #7c3aed;
      --success: #059669;
      --success-bg: #d1fae5;
      --warning: #d97706;
      --warning-bg: #fef3c7;
      --danger: #dc2626;
      --chip-bg: #f1f5f9;
      --table-header-bg: #f8fafc;
      --table-row-hover: #f0f9ff;
      --shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding-bottom: 60px;
      min-height: 100vh;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* Layout */
    .container {
      width: min(1280px, calc(100% - 32px));
      margin: 0 auto;
    }

    /* Header */
    header {
      padding: 32px 0 20px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 24px;
    }
    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .brand-title {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    h1 {
      font-size: 1.85rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      background: linear-gradient(135deg, var(--text) 30%, var(--accent));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .live-dot {
      width: 10px;
      height: 10px;
      background-color: var(--success);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--success);
      display: inline-block;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.85); }
    }
    .tagline {
      color: var(--text-muted);
      font-size: 0.92rem;
      margin-top: 4px;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--card-border);
      background: var(--card-bg);
      color: var(--text);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn:hover {
      background: var(--card-hover);
      border-color: var(--accent);
    }

    /* KPI Highlights Cards */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 14px;
      margin-bottom: 24px;
    }
    .kpi-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 16px;
      box-shadow: var(--shadow);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      backdrop-filter: blur(8px);
      transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .kpi-card:hover {
      transform: translateY(-2px);
      border-color: rgba(var(--accent-rgb), 0.4);
    }
    .kpi-label {
      font-size: 0.78rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .kpi-value-box {
      margin: 10px 0 6px;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .kpi-val {
      font-size: 1.7rem;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: var(--text);
    }
    .kpi-unit {
      font-size: 0.8rem;
      color: var(--text-dim);
    }
    .kpi-sub {
      font-size: 0.85rem;
      color: var(--accent);
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Controls: Filters & Search */
    .controls-bar {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .filters-group {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .filter-btn {
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid var(--card-border);
      background: var(--card-bg);
      color: var(--text-muted);
      font-size: 0.82rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .filter-btn:hover {
      background: var(--card-hover);
      color: var(--text);
    }
    .filter-btn.active {
      background: var(--text);
      color: var(--bg);
      border-color: var(--text);
      font-weight: 600;
    }
    .search-box {
      position: relative;
      min-width: 240px;
    }
    .search-input {
      width: 100%;
      padding: 7px 12px 7px 32px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--card-border);
      background: var(--card-bg);
      color: var(--text);
      font-size: 0.85rem;
      outline: none;
      transition: border-color 0.2s ease;
    }
    .search-input:focus {
      border-color: var(--accent);
    }
    .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-dim);
      font-size: 0.85rem;
      pointer-events: none;
    }

    /* Main Table Container */
    .table-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow-x: auto;
      backdrop-filter: blur(8px);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.88rem;
    }
    th {
      background: var(--table-header-bg);
      color: var(--text-muted);
      font-size: 0.74rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 700;
      padding: 12px 14px;
      border-bottom: 1px solid var(--card-border);
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }
    th:hover {
      color: var(--accent);
    }
    th.sorted-asc::after { content: " ↑"; color: var(--accent); }
    th.sorted-desc::after { content: " ↓"; color: var(--accent); }
    td {
      padding: 11px 14px;
      border-bottom: 1px solid var(--card-border);
      vertical-align: middle;
    }
    tbody tr:hover {
      background: var(--table-row-hover);
    }

    /* Model cell styles */
    .model-cell {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .name-box {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }
    .model-name {
      font-weight: 650;
      color: var(--text);
    }
    .variant-chip {
      font-size: 0.72rem;
      padding: 1px 6px;
      border-radius: 4px;
      background: var(--chip-bg);
      color: var(--text-muted);
      border: 1px solid var(--card-border);
    }

    /* Family tags */
    .family-tag {
      font-size: 0.7rem;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .family-gpt { background: rgba(16, 185, 129, 0.15); color: #10b981; }
    .family-claude { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
    .family-gemini { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .family-grok { background: rgba(161, 161, 170, 0.15); color: #cbd5e1; }
    .family-qwen { background: rgba(168, 85, 247, 0.15); color: #c084fc; }
    .family-xiaomi { background: rgba(249, 115, 22, 0.15); color: #fb923c; }

    /* Price boxes & Mini-bars */
    .col-num {
      font-variant-numeric: tabular-nums;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .price-box {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 95px;
    }
    .price-val {
      font-weight: 650;
    }
    .mini-bar-track {
      height: 4px;
      width: 100%;
      background: var(--card-border);
      border-radius: 2px;
      overflow: hidden;
    }
    .mini-bar {
      height: 100%;
      border-radius: 2px;
      transition: width 0.3s ease;
    }
    .in-bar { background: var(--in-color); }
    .out-bar { background: var(--out-color); }
    .col-blended {
      font-weight: 600;
      color: var(--text);
    }

    /* AA Benchmark Pill */
    .aa-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 999px;
      color: var(--accent);
      font-weight: 700;
      font-size: 0.78rem;
    }
    .aa-sub {
      font-size: 0.65rem;
      opacity: 0.7;
    }
    .aa-na {
      color: var(--text-dim);
    }
    .col-center { text-align: center; }

    /* Delta indicators */
    .delta.up { color: var(--danger); }
    .delta.down { color: var(--success); }
    .delta.flat { color: var(--text-dim); }

    /* Source badges */
    .source-box {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .source-link {
      font-size: 0.8rem;
      font-weight: 500;
    }
    .badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 0.68rem;
      font-weight: 600;
      width: fit-content;
    }
    .badge-official {
      background: var(--success-bg);
      color: var(--success);
    }
    .badge-seed {
      background: var(--warning-bg);
      color: var(--warning);
    }
    .badge-err {
      background: rgba(239, 68, 68, 0.15);
      color: var(--danger);
    }

    /* Tooltip */
    .tooltip-trigger {
      position: relative;
      cursor: help;
      display: inline-flex;
      align-items: center;
    }
    .info-icon {
      color: var(--text-dim);
      font-size: 0.8rem;
      transition: color 0.2s ease;
    }
    .tooltip-trigger:hover .info-icon, .tooltip-trigger:focus .info-icon {
      color: var(--accent);
    }
    .tooltip-box {
      visibility: hidden;
      opacity: 0;
      position: absolute;
      bottom: 125%;
      left: 50%;
      transform: translateX(-50%);
      background: #1e293b;
      color: #f8fafc;
      font-size: 0.75rem;
      font-weight: 400;
      padding: 6px 10px;
      border-radius: 6px;
      white-space: normal;
      width: max-content;
      max-width: 250px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      border: 1px solid rgba(255,255,255,0.1);
      z-index: 50;
      pointer-events: none;
      transition: opacity 0.15s ease, visibility 0.15s ease;
    }
    .tooltip-trigger:hover .tooltip-box, .tooltip-trigger:focus .tooltip-box {
      visibility: visible;
      opacity: 1;
    }

    /* Methodology Modal / Drawer */
    .methodology-box {
      margin-top: 36px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 20px;
    }
    .methodology-summary {
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: var(--text);
    }
    .sources-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    .source-card {
      background: var(--chip-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-sm);
      padding: 12px;
    }
    .source-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .source-desc {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    /* Empty state */
    #empty-state {
      padding: 32px;
      text-align: center;
      color: var(--text-muted);
    }

    .page-tabs {
      display: flex;
      gap: 8px;
      margin: 20px 0 18px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 10px;
    }
    .page-tab {
      padding: 8px 16px;
      border-radius: var(--radius-sm);
      border: 1px solid transparent;
      background: transparent;
      color: var(--text-muted);
      font-weight: 700;
      font-size: 0.95rem;
      cursor: pointer;
    }
    .page-tab:hover { color: var(--text); background: var(--chip-bg); }
    .page-tab.active {
      background: var(--accent-glow);
      color: var(--accent);
      border-color: rgba(var(--accent-rgb), 0.3);
    }
    .page-panel { display: none; }
    .page-panel.active { display: block; }
    .signal-table thead th,
    .signal-group th {
      cursor: default;
    }
    .signal-table thead th:hover,
    .signal-group th:hover { color: var(--text-muted); }
    .signal-group th {
      background: transparent;
      color: var(--text-muted);
      font-size: 0.75rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    tr.is-new td { background: var(--warning-bg); }
    .page-panel .table-card { margin-bottom: 16px; }
    .section-title {
      font-size: 1.05rem;
      font-weight: 750;
      margin: 0 0 12px;
    }
    .plans-section { margin-bottom: 28px; }
    .price-month {
      font-variant-numeric: tabular-nums;
      font-weight: 650;
      white-space: nowrap;
    }

    @media (max-width: 768px) {
      .header-content { flex-direction: column; align-items: flex-start; }
      .page-tabs { flex-wrap: wrap; }
    }
  </style>
</head>
<body>
  <header>
    <div class="container header-content">
      <div>
        <div class="brand-title">
          <span class="live-dot" title="Coleta em tempo real"></span>
          <h1>ai-prices</h1>
        </div>
        <p class="tagline">Radar visual de preços de API por 1 milhão de tokens. Atualizado: ${escapeHtml(snapshot.collectedAtBrt)}.</p>
      </div>
      <div class="header-actions">
        <button type="button" class="btn" id="theme-btn">🌓 Tema</button>
        <a href="./latest.json" class="btn" target="_blank" rel="noopener">API JSON</a>
      </div>
    </div>
  </header>

  <main class="container">
    <nav class="page-tabs" role="tablist" aria-label="Seções">
      <button type="button" class="page-tab active" id="tab-btn-precos" role="tab" aria-selected="true" aria-controls="page-precos" data-page="page-precos">Preços</button>
      <button type="button" class="page-tab" id="tab-btn-promocoes" role="tab" aria-selected="false" aria-controls="page-promocoes" data-page="page-promocoes">Promoções</button>
      <button type="button" class="page-tab" id="tab-btn-lancamentos" role="tab" aria-selected="false" aria-controls="page-lancamentos" data-page="page-lancamentos">Lançamentos</button>
      <button type="button" class="page-tab" id="tab-btn-radar" role="tab" aria-selected="false" aria-controls="page-radar" data-page="page-radar">Radar</button>
    </nav>
    <div id="page-precos" class="page-panel active" role="tabpanel" aria-labelledby="tab-btn-precos">
    ${renderPlansSection(plansDoc)}
    <!-- Top KPI Highlights -->
    <section class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">🪙 Menor Custo Entrada (Input)</div>
        <div class="kpi-value-box">
          <span class="kpi-val">$${formatUsd(cheapestInput?.inputPerMillion)}</span>
          <span class="kpi-unit">/ 1M tokens</span>
        </div>
        <div class="kpi-sub">${escapeHtml(cheapestInput?.name || "")} (${escapeHtml(cheapestInput?.family || "")})</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">⚡ Menor Custo Saída (Output)</div>
        <div class="kpi-value-box">
          <span class="kpi-val">$${formatUsd(cheapestOutput?.outputPerMillion)}</span>
          <span class="kpi-unit">/ 1M tokens</span>
        </div>
        <div class="kpi-sub">${escapeHtml(cheapestOutput?.name || "")} (${escapeHtml(cheapestOutput?.family || "")})</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">🧠 Sweet Spot (Custo-Benefício)</div>
        <div class="kpi-value-box">
          <span class="kpi-val">$${formatUsd((sweetSpot?.inputPerMillion * 3 + sweetSpot?.outputPerMillion) / 4)}</span>
          <span class="kpi-unit">blended (3:1)</span>
        </div>
        <div class="kpi-sub">${escapeHtml(sweetSpot?.name || "")} · Score AA ${extractAaScore(sweetSpot?.aaLabel) || "—"}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">👑 Benchmark Topo de Linha</div>
        <div class="kpi-value-box">
          <span class="kpi-val">Score ${extractAaScore(highestQuality?.aaLabel) || "53"}</span>
          <span class="kpi-unit">AA Index</span>
        </div>
        <div class="kpi-sub">${escapeHtml(highestQuality?.name || "GPT-6 Astra / Claude Fable")}</div>
      </div>
    </section>

    <!-- Controls Bar -->
    <div class="controls-bar">
      <div class="filters-group" role="toolbar" aria-label="Filtrar família">
        ${filterButtons}
      </div>
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input id="q" class="search-input" type="search" placeholder="Buscar modelo ou variante..." aria-label="Buscar modelo">
      </div>
    </div>

    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th data-sort="name">Modelo / Provedor</th>
            <th data-sort="in">Input ($/1M)</th>
            <th data-sort="out">Output ($/1M)</th>
            <th data-sort="blended">Combinado (3:1)</th>
            <th data-sort="aa" class="col-center">AA Index</th>
            <th class="col-center">Δ 24h</th>
            <th>Fonte</th>
          </tr>
        </thead>
        <tbody id="models-body">
          ${rows}
        </tbody>
      </table>
      <div id="empty-state" hidden>Nenhum modelo encontrado com os filtros atuais.</div>
    </div>

    <!-- METODOLOGIA E FONTES (EXPANDÍVEL) -->
    <details class="methodology-box">
      <summary class="methodology-summary">
        <span>⚙️ Metodologia & Status das Fontes (${models.length} modelos, ${seedCount} em fallback seed)</span>
        <span style="font-size: 0.8rem; color: var(--text-dim);">Clique para expandir</span>
      </summary>
      <div class="sources-grid">
        ${sourcesList}
      </div>
    </details>
    </div>
    ${renderPromosSection(promosDoc)}
    ${renderSignalSections(signals)}
  </main>

  <script>
    // Theme Management
    const themeBtn = document.getElementById("theme-btn");
    const root = document.documentElement;
    const savedTheme = localStorage.getItem("ai-prices-theme");
    if (savedTheme) root.dataset.theme = savedTheme;
    themeBtn.addEventListener("click", () => {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      localStorage.setItem("ai-prices-theme", next);
    });

    const planRows = [...document.querySelectorAll("#plans-body tr")];
    const plansSearch = document.getElementById("plans-q");
    const plansEmpty = document.getElementById("plans-empty");
    if (plansSearch && planRows.length) {
      const applyPlans = () => {
        const query = plansSearch.value.trim().toLowerCase();
        let visible = 0;
        planRows.forEach((row) => {
          const show = !query || row.dataset.search.includes(query);
          row.hidden = !show;
          if (show) visible += 1;
        });
        if (plansEmpty) plansEmpty.hidden = visible > 0;
      };
      plansSearch.addEventListener("input", applyPlans);
      let planSort = "";
      let planAsc = true;
      document.querySelectorAll("th[data-plan-sort]").forEach((th) => {
        th.addEventListener("click", () => {
          const col = th.dataset.planSort;
          planAsc = planSort === col ? !planAsc : true;
          planSort = col;
          document.querySelectorAll("th[data-plan-sort]").forEach((item) => item.classList.remove("sorted-asc", "sorted-desc"));
          th.classList.add(planAsc ? "sorted-asc" : "sorted-desc");
          const body = document.getElementById("plans-body");
          planRows.sort((a, b) => {
            if (col === "price") {
              const av = a.dataset.price === "" ? null : Number(a.dataset.price);
              const bv = b.dataset.price === "" ? null : Number(b.dataset.price);
              if (av == null && bv == null) return 0;
              if (av == null) return 1;
              if (bv == null) return -1;
              return planAsc ? av - bv : bv - av;
            }
            const key = col === "plan" ? "plan" : "product";
            const cmp = a.dataset[key].localeCompare(b.dataset[key], "pt");
            return planAsc ? cmp : -cmp;
          });
          planRows.forEach((row) => body.appendChild(row));
        });
      });
    }

    const pageTabs = document.querySelectorAll(".page-tab");
    const pagePanels = document.querySelectorAll(".page-panel");
    pageTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        pageTabs.forEach((item) => {
          item.classList.remove("active");
          item.setAttribute("aria-selected", "false");
        });
        pagePanels.forEach((panel) => panel.classList.remove("active"));
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");
        const panel = document.getElementById(tab.dataset.page);
        if (panel) panel.classList.add("active");
      });
    });

    // Filtering and Search
    const rows = [...document.querySelectorAll("#models-body tr")];
    const filterBtns = document.querySelectorAll(".filter-btn");
    const searchInput = document.getElementById("q");
    const emptyState = document.getElementById("empty-state");

    let currentFamily = "all";
    let searchQuery = "";

    function applyFilter() {
      let visibleCount = 0;
      rows.forEach(row => {
        const familyMatch = currentFamily === "all" || row.dataset.family === currentFamily;
        const searchMatch = !searchQuery || row.dataset.search.includes(searchQuery);
        const visible = familyMatch && searchMatch;
        row.hidden = !visible;
        if (visible) visibleCount++;
      });
      emptyState.hidden = visibleCount > 0;
    }

    filterBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        filterBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentFamily = btn.dataset.filter;
        applyFilter();
      });
    });

    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      applyFilter();
    });

    // Column Sorting
    let sortCol = "blended";
    let sortAsc = true;
    const headers = document.querySelectorAll("th[data-sort]");
    headers.forEach(th => {
      th.addEventListener("click", () => {
        const col = th.dataset.sort;
        if (sortCol === col) {
          sortAsc = !sortAsc;
        } else {
          sortCol = col;
          sortAsc = true;
        }
        headers.forEach(h => h.classList.remove("sorted-asc", "sorted-desc"));
        th.classList.add(sortAsc ? "sorted-asc" : "sorted-desc");

        const tbody = document.getElementById("models-body");
        rows.sort((a, b) => {
          let valA, valB;
          if (col === "name") {
            valA = a.dataset.name.toLowerCase();
            valB = b.dataset.name.toLowerCase();
            return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
          } else {
            valA = parseFloat(a.dataset[col]) || 0;
            valB = parseFloat(b.dataset[col]) || 0;
            return sortAsc ? valA - valB : valB - valA;
          }
        });
        rows.forEach(r => tbody.appendChild(r));
      });
    });
  </script>
</body>
</html>
`;
}
