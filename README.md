# ai-prices

Tabela de preços de API de modelos de IA, em USD por 1 milhão de tokens.

Site estático: [`public/index.html`](public/index.html) e [`public/latest.json`](public/latest.json).
Produção: [https://ai-prices.vercel.app](https://ai-prices.vercel.app), deploy automático da branch **main**.

## main e developer

| Branch | Papel |
| --- | --- |
| `main` | Produção. A Vercel publica o que está aqui. A coleta diária faz commit nesta branch. |
| `developer` | Trabalho contínuo de código. A coleta automática não grava aqui. |

Fluxo:

1. Mudança de código entra em `developer` (ou numa branch de PR que depois vai para `developer`).
2. Quando estiver pronto para o site, abra um PR de `developer` para `main` e faça o merge.
3. A Vercel publica `main` em [ai-prices.vercel.app](https://ai-prices.vercel.app). A coleta diária também grava em `main` e atualiza o site.

O primeiro site sai do PR que leva este MVP para `main`. A coleta diária grava em `main`, e a Vercel publica essa branch.

## Rodar local

Precisa de Node.js 22. Não há dependência de npm e não há secret.

```bash
node scripts/collect.mjs
npm test
npm run build
```

`npm run collect` faz o mesmo que o script. A coleta:

- busca as páginas oficiais de OpenAI, Anthropic, Gemini, xAI e Xiaomi MiMo
- se o fetch ou o parser falhar, usa o seed de `data/catalog.json` quando a linha tem número de fallback
- linha sem fetch e sem seed fica de fora (não inventa preço)
- grava `public/latest.json`, `public/index.html` e `data/history/AAAA-MM-DD.json`
- Δ vs ontem só aparece quando já existe coleta de um dia BRT anterior

Abra `public/index.html` no navegador. `npm run build` copia `public/` para `dist/`, que é o diretório publicado na Vercel.

## Cron

Arquivo: [`.github/workflows/collect.yml`](.github/workflows/collect.yml).

- Agenda: `0 12 * * *` (12:00 UTC)
- Isso é 09:00 em `America/Sao_Paulo`. O Brasil está em UTC−3 o ano inteiro, sem horário de verão
- Também dá para disparar à mão em Actions → Coleta diária de preços → Run workflow
- O job faz checkout de `main`, roda o script e dá push de volta em `main`

O cron do GitHub só passa a valer depois que o workflow estiver na branch padrão (`main`). No repositório, Actions → General → Workflow permissions precisa estar em **Read and write**, senão o bot não consegue commitar em `main`.

O mesmo job também atualiza lançamentos e radar: `public/releases.json`, `public/radar.json` e `data/history/signals/`. A agenda não muda.

## Lançamentos e Radar

A página tem três abas. **Preços** é a tabela de preços. **Lançamentos** e **Radar** são tabelas curtas.

- Lançamentos: último item do canal oficial de cada empresa (EUA e China). Colunas Empresa, Último (no máximo 5 palavras), Quando e Fonte. A linha só ganha destaque quando o item mudou em relação à coleta anterior.
- Radar: agregadores e harnesses. **O que é** é uma frase fixa em português, gravada no catálogo, e a coleta não reescreve esse texto. **Novidade** só aparece quando o canal oficial publicou algo novo desde a coleta anterior; caso contrário fica —.
- Se o fetch falha e já existe um último item, a aba Lançamentos mantém esse item sem marcar como novo. Sem item confirmado, a célula fica —. O script não inventa título.

Nenhum secret é obrigatório. Se uma fonte cair, o script segue e marca a linha como seed quando existe fallback.

## Planos de assinatura

A aba **Preços** abre com a tabela **Planos** (empresa, plano, preço mensal). A tabela de API continua abaixo. Os valores ficam em [`data/plans.json`](data/plans.json), com a URL oficial em cada produto.

A coleta diária tenta reler essas páginas. Se o fetch falha, o último preço permanece. Um parser só substitui o número quando encontra o plano de novo e o valor novo está na mesma ordem de grandeza. Preço não confirmado aparece como —.

## De onde vêm os números

| Fonte | O que entra na tabela |
| --- | --- |
| [OpenAI](https://developers.openai.com/api/docs/pricing) | GPT-6 Astra, Sol e Luna. Standard, contexto curto e (Astra) longo. |
| [Anthropic](https://platform.claude.com/docs/en/about-claude/pricing) | Fable 5.1, Fable 5, Opus 5.5, Opus 5, Sonnet 5, Haiku 4.5. Preço base. |
| [Gemini](https://ai.google.dev/gemini-api/docs/pricing) | 3.8, 3.7 e 3.6 Flash, paid tier Standard, preço vigente. |
| [xAI](https://docs.x.ai/developers/pricing) | grok-4.7, 4.6, 4.5, 4.3 e grok-build-0.1, abaixo do limiar de contexto longo. |
| [Xiaomi MiMo](https://mimo.mi.com/docs/en-US/price/pay-as-you-go) | mimo-v2.6 pro, flash e pro-ultraspeed. Real-time, USD, input = cache miss. |
| Qwen | Seed. A pesquisa de 2026-09-22 traz Qwen3.8-Max ~$2 / $6 (SG). A página oficial não publica a tabela numérica no HTML. |
| GLM | Sem linha. A pesquisa não traz preço e este MVP não tem parser. |
| AA Index | Não há fetch do Artificial Analysis. A coluna só mostra número quando a pesquisa de 2026-09-22 tinha um, sempre com o rótulo seed. |

Seed fica em `data/catalog.json`, com data `2026-09-22`. Na tabela, a coluna Fonte mostra `oficial` ou `seed 2026-09-22`.

Claudio.legal fica de fora: é reseller, e o preço nominal espelha a Anthropic.
