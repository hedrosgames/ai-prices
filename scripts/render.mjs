import { formatUsd } from "./parse.mjs";

export function escapeHtml(value) {
  return String(value)
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

export function renderHtml(snapshot) {
  const rows = snapshot.models
    .map((model) => {
      const search = `${model.family} ${model.name} ${model.variant || ""}`.toLowerCase();
      const badge = model.priceStatus === "official" ? "oficial" : `seed ${escapeHtml(model.priceAsOf)}`;
      const badgeClass = model.priceStatus === "official" ? "ok" : "seed";
      const href = model.sourceUrl
        ? `<a href="${escapeHtml(model.sourceUrl)}">${escapeHtml(model.sourceLabel)}</a>`
        : escapeHtml(model.sourceLabel);
      const sub = model.note ? `<span class="sub">${escapeHtml(model.note)}</span>` : "";
      return `<tr data-family="${escapeHtml(model.family)}" data-search="${escapeHtml(search)}">
        <td>${escapeHtml(model.family)}</td>
        <td><span class="name">${escapeHtml(model.name)}</span>${sub}</td>
        <td class="num">${formatUsd(model.inputPerMillion)}</td>
        <td class="num">${formatUsd(model.outputPerMillion)}</td>
        <td>${model.aaLabel ? escapeHtml(model.aaLabel) : "—"}</td>
        <td class="num delta ${deltaClass(model.deltaInput, model.deltaOutput)}">${deltaCell(model.deltaInput, model.deltaOutput)}</td>
        <td>${href} <span class="badge ${badgeClass}">${badge}</span></td>
        <td>${escapeHtml(model.collectedLabel)}</td>
      </tr>`;
    })
    .join("\n");

  const families = [...new Set(snapshot.models.map((model) => model.family))];
  const filters = ["Todas", ...families]
    .map((family, index) => {
      const value = index === 0 ? "all" : family;
      const pressed = index === 0 ? "true" : "false";
      return `<button type="button" data-filter="${escapeHtml(value)}" aria-pressed="${pressed}">${escapeHtml(family)}</button>`;
    })
    .join("");

  const sources = snapshot.sources
    .map((source) => {
      const link = source.url ? `<a href="${escapeHtml(source.url)}">${escapeHtml(source.label)}</a>` : escapeHtml(source.label);
      return `<li>${link}: ${escapeHtml(sourceStatusLabel(source.status))}. ${escapeHtml(source.detail || "")}</li>`;
    })
    .join("");

  const seedCount = snapshot.models.filter((model) => model.priceStatus === "seed").length;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ai-prices</title>
  <meta name="description" content="Tabela de preços de API de modelos de IA, em USD por 1 milhão de tokens.">
  <style>
    :root {
      color-scheme: light;
      --bg: #f3efe6;
      --card: #fffdf8;
      --ink: #1b1914;
      --muted: #5f584c;
      --line: #e3daca;
      --accent: #0e6b66;
      --chip: #efe8da;
      --ok: #14624f;
      --ok-bg: #d7f0e6;
      --seed: #7a4e00;
      --seed-bg: #f8e4bc;
      --up: #8d2b2b;
      --down: #0e6b66;
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) {
        color-scheme: dark;
        --bg: #141311;
        --card: #1e1c19;
        --ink: #f3efe6;
        --muted: #b7ad9d;
        --line: #343028;
        --accent: #7dccc4;
        --chip: #2a2722;
        --ok: #b7ead4;
        --ok-bg: #1c3b32;
        --seed: #f0cb86;
        --seed-bg: #3d3018;
        --up: #f0a3a3;
        --down: #8ed9cf;
      }
    }
    :root[data-theme="dark"] {
      color-scheme: dark;
      --bg: #141311;
      --card: #1e1c19;
      --ink: #f3efe6;
      --muted: #b7ad9d;
      --line: #343028;
      --accent: #7dccc4;
      --chip: #2a2722;
      --ok: #b7ead4;
      --ok-bg: #1c3b32;
      --seed: #f0cb86;
      --seed-bg: #3d3018;
      --up: #f0a3a3;
      --down: #8ed9cf;
    }
    :root[data-theme="light"] { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, sans-serif;
      background: var(--bg);
      color: var(--ink);
      line-height: 1.45;
    }
    header, main { width: min(1180px, calc(100% - 32px)); margin: 0 auto; }
    header { padding: 28px 0 8px; display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    h1 { font-size: 1.7rem; margin: 0 0 6px; letter-spacing: -0.03em; }
    p { margin: 0; color: var(--muted); }
    a { color: var(--accent); }
    button, input {
      font: inherit;
      color: var(--ink);
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 8px 12px;
    }
    button[aria-pressed="true"] { background: var(--ink); color: var(--bg); border-color: var(--ink); }
    .tools { display: flex; gap: 8px; align-items: center; }
    .filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
    #q { border-radius: 10px; min-width: min(100%, 220px); }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      overflow: auto;
    }
    table { width: 100%; border-collapse: collapse; min-width: 860px; }
    th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { font-size: 0.78rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); position: sticky; top: 0; background: var(--card); }
    .num { font-variant-numeric: tabular-nums; font-family: ui-monospace, monospace; white-space: nowrap; }
    .name { font-weight: 650; }
    .sub { display: block; color: var(--muted); font-size: 0.82rem; font-weight: 400; margin-top: 4px; max-width: 34rem; }
    .badge { display: inline-block; margin-top: 4px; padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; }
    .badge.ok { background: var(--ok-bg); color: var(--ok); }
    .badge.seed { background: var(--seed-bg); color: var(--seed); }
    .delta.up { color: var(--up); }
    .delta.down { color: var(--down); }
    .delta.flat { color: var(--muted); }
    #empty { padding: 20px 14px; }
    section { margin: 18px 0 40px; }
    ul { padding-left: 18px; }
    li { margin: 6px 0; }
    @media (max-width: 720px) {
      header { flex-direction: column; }
      h1 { font-size: 1.4rem; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>ai-prices</h1>
      <p>USD por 1 milhão de tokens. Coleta desta página: ${escapeHtml(snapshot.collectedAtBrt)}.</p>
      <p>${seedCount ? `${seedCount} linha(s) ainda em seed, marcadas na coluna Fonte.` : "Nenhuma linha em seed nesta coleta."} Δ vs ontem compara com a coleta de um dia anterior. Na primeira vez aparece —.</p>
    </div>
    <div class="tools">
      <button type="button" id="theme">Tema</button>
      <a href="./latest.json">latest.json</a>
    </div>
  </header>
  <main>
    <div class="filters" role="toolbar" aria-label="Filtrar família">
      ${filters}
      <input id="q" type="search" placeholder="Buscar modelo" aria-label="Buscar modelo">
    </div>
    <div class="card">
      <table>
        <caption class="sub" style="caption-side:bottom;padding:10px 14px;text-align:left">Preço base de entrada e saída. Cache, batch e fast mode não entram nas colunas In/Out, exceto quando a nota da linha diz o contrário.</caption>
        <thead>
          <tr>
            <th>Família</th>
            <th>Modelo</th>
            <th>In ($/1M)</th>
            <th>Out ($/1M)</th>
            <th>AA Index (versão)</th>
            <th>Δ vs ontem</th>
            <th>Fonte</th>
            <th>Coletado em</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <p id="empty" hidden>Nenhum modelo neste filtro.</p>
    </div>
    <section>
      <h2>Fontes desta coleta</h2>
      <ul>${sources}</ul>
      <p>AA Index só aparece quando a pesquisa de 2026-09-22 trouxe um número, e fica marcado como seed. Não é fetch do Artificial Analysis. GLM não tem preço neste MVP.</p>
    </section>
  </main>
  <script>
    const rows = [...document.querySelectorAll("tbody tr[data-family]")];
    const empty = document.querySelector("#empty");
    const search = document.querySelector("#q");
    function apply() {
      const current = document.querySelector("[data-filter][aria-pressed='true']");
      const family = current ? current.dataset.filter : "all";
      const query = search.value.trim().toLowerCase();
      let shown = 0;
      for (const row of rows) {
        const familyOk = family === "all" || row.dataset.family === family;
        const queryOk = !query || row.dataset.search.includes(query);
        const visible = familyOk && queryOk;
        row.hidden = !visible;
        if (visible) shown += 1;
      }
      empty.hidden = shown !== 0;
    }
    for (const button of document.querySelectorAll("[data-filter]")) {
      button.addEventListener("click", () => {
        for (const other of document.querySelectorAll("[data-filter]")) other.setAttribute("aria-pressed", "false");
        button.setAttribute("aria-pressed", "true");
        apply();
      });
    }
    search.addEventListener("input", apply);
    const theme = document.querySelector("#theme");
    const saved = localStorage.getItem("ai-prices-theme");
    if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
    theme.addEventListener("click", () => {
      const root = document.documentElement;
      const explicit = root.dataset.theme;
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const next = explicit === "dark" ? "light" : explicit === "light" ? "dark" : prefersDark ? "light" : "dark";
      root.dataset.theme = next;
      localStorage.setItem("ai-prices-theme", next);
    });
  </script>
</body>
</html>
`;
}
