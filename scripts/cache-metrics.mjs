/**
 * Prompt-cache metrics dashboard — fetches GENERATION observations from Langfuse,
 * computes cache hit rates from usageDetails.input_cached_tokens, and opens
 * a self-contained HTML dashboard with Chart.js.
 *
 * Usage:  node --env-file=.env.local scripts/cache-metrics.mjs [--days 7]
 * @module scripts/cache-metrics
 */

import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const LANGFUSE_HOST =
  process.env.LANGFUSE_BASE_URL ||
  process.env.LANGFUSE_HOST ||
  "https://cloud.langfuse.com";
const PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY;
const SECRET_KEY = process.env.LANGFUSE_SECRET_KEY;

if (!PUBLIC_KEY || !SECRET_KEY) {
  console.error(
    "Missing LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY in environment.",
  );
  process.exit(1);
}

const AUTH = Buffer.from(`${PUBLIC_KEY}:${SECRET_KEY}`).toString("base64");

const daysArg = process.argv.includes("--days")
  ? Number(process.argv[process.argv.indexOf("--days") + 1])
  : 14;

const toDate = new Date();
const fromDate = new Date(toDate.getTime() - daysArg * 24 * 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// Langfuse API helpers
// ---------------------------------------------------------------------------

async function fetchGenerations() {
  const allGenerations = [];
  let cursor = undefined;
  let page = 0;

  console.log(
    `Fetching generations from ${fromDate.toISOString()} to ${toDate.toISOString()} …`,
  );

  while (true) {
    const params = new URLSearchParams({
      fields: "core,usage,model",
      type: "GENERATION",
    });
    if (cursor) params.set("cursor", cursor);

    const url = `${LANGFUSE_HOST}/api/public/observations?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${AUTH}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Langfuse API ${res.status}: ${text}`);
    }

    const json = await res.json();
    const observations = json.data ?? [];

    // Filter to date range (API returns newest-first with cursor pagination)
    for (const obs of observations) {
      const t = new Date(obs.startTime);
      if (t < fromDate) {
        // Past our window — stop paginating
        allGenerations.push(obs); // include this one if it's close
        return allGenerations.filter(
          (o) => new Date(o.startTime) >= fromDate,
        );
      }
      allGenerations.push(obs);
    }

    cursor = json.meta?.cursor;
    page++;
    if (!cursor || observations.length === 0) break;

    // Safety: don't fetch more than 50 pages
    if (page >= 50) {
      console.warn("Reached 50-page limit, using data collected so far.");
      break;
    }
  }

  return allGenerations.filter((o) => new Date(o.startTime) >= fromDate);
}

// ---------------------------------------------------------------------------
// Metric computation
// ---------------------------------------------------------------------------

function computeMetrics(generations) {
  const byDay = {};
  const byModel = {};
  let totalInput = 0;
  let totalCached = 0;
  let totalCost = 0;
  let totalCostSaved = 0;
  let generationsWithCache = 0;

  for (const gen of generations) {
    const usage = gen.usageDetails ?? {};
    const cost = gen.costDetails ?? {};
    const inputTokens = usage.input ?? 0;
    const cachedTokens = usage.input_cached_tokens ?? 0;
    const fullInput = inputTokens + cachedTokens;
    const inputPrice = gen.inputPrice ? Number(gen.inputPrice) : 0;

    totalInput += fullInput;
    totalCached += cachedTokens;
    totalCost += cost.total ?? gen.totalCost ?? 0;

    // Cost saved: cached tokens would have cost full input price, but are free/cheaper
    // Gemini cached tokens are 75% cheaper (0.25x cost)
    totalCostSaved += cachedTokens * inputPrice * 0.75;

    if (cachedTokens > 0) generationsWithCache++;

    // Group by day
    const day = gen.startTime.slice(0, 10);
    if (!byDay[day]) {
      byDay[day] = {
        input: 0,
        cached: 0,
        count: 0,
        cacheHits: 0,
        cost: 0,
      };
    }
    byDay[day].input += fullInput;
    byDay[day].cached += cachedTokens;
    byDay[day].count++;
    if (cachedTokens > 0) byDay[day].cacheHits++;
    byDay[day].cost += cost.total ?? gen.totalCost ?? 0;

    // Group by model
    const model = gen.model ?? "unknown";
    if (!byModel[model]) {
      byModel[model] = { input: 0, cached: 0, count: 0, cacheHits: 0 };
    }
    byModel[model].input += fullInput;
    byModel[model].cached += cachedTokens;
    byModel[model].count++;
    if (cachedTokens > 0) byModel[model].cacheHits++;
  }

  const cacheHitRate =
    totalInput > 0 ? ((totalCached / totalInput) * 100).toFixed(1) : "0.0";

  return {
    summary: {
      totalGenerations: generations.length,
      generationsWithCache,
      totalInput,
      totalCached,
      cacheHitRate,
      totalCost: totalCost.toFixed(4),
      estimatedSavings: totalCostSaved.toFixed(4),
    },
    byDay,
    byModel,
  };
}

// ---------------------------------------------------------------------------
// HTML dashboard generation
// ---------------------------------------------------------------------------

function generateDashboard(metrics) {
  const { summary, byDay, byModel } = metrics;

  const days = Object.keys(byDay).sort();
  const dayLabels = JSON.stringify(days);
  const dayCacheRates = JSON.stringify(
    days.map((d) => {
      const total = byDay[d].input;
      return total > 0
        ? Number(((byDay[d].cached / total) * 100).toFixed(1))
        : 0;
    }),
  );
  const dayCachedTokens = JSON.stringify(days.map((d) => byDay[d].cached));
  const dayFreshTokens = JSON.stringify(
    days.map((d) => byDay[d].input - byDay[d].cached),
  );
  const dayGenCounts = JSON.stringify(days.map((d) => byDay[d].count));
  const dayCosts = JSON.stringify(
    days.map((d) => Number(byDay[d].cost.toFixed(4))),
  );

  const models = Object.keys(byModel).sort();
  const modelLabels = JSON.stringify(models);
  const modelCacheRates = JSON.stringify(
    models.map((m) => {
      const total = byModel[m].input;
      return total > 0
        ? Number(((byModel[m].cached / total) * 100).toFixed(1))
        : 0;
    }),
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sunder — Prompt Cache Metrics</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 24px; }
  h1 { font-size: 1.5rem; margin-bottom: 4px; color: #fff; }
  .subtitle { font-size: 0.85rem; color: #888; margin-bottom: 24px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .kpi { background: #161616; border: 1px solid #262626; border-radius: 12px; padding: 20px; }
  .kpi-label { font-size: 0.75rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
  .kpi-value { font-size: 1.75rem; font-weight: 700; color: #fff; }
  .kpi-value.green { color: #22c55e; }
  .kpi-value.amber { color: #f59e0b; }
  .kpi-value.blue { color: #3b82f6; }
  .chart-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  .chart-card { background: #161616; border: 1px solid #262626; border-radius: 12px; padding: 20px; }
  .chart-card h2 { font-size: 0.9rem; color: #ccc; margin-bottom: 16px; }
  .chart-card.full { grid-column: 1 / -1; }
  canvas { width: 100% !important; }
  @media (max-width: 768px) { .chart-row { grid-template-columns: 1fr; } }
  .footer { text-align: center; color: #555; font-size: 0.75rem; margin-top: 32px; }
</style>
</head>
<body>

<h1>Prompt Cache Metrics</h1>
<p class="subtitle">Last ${daysArg} days &middot; ${summary.totalGenerations} generations &middot; Generated ${new Date().toLocaleString()}</p>

<div class="kpi-grid">
  <div class="kpi">
    <div class="kpi-label">Cache Hit Rate</div>
    <div class="kpi-value green">${summary.cacheHitRate}%</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Cached Tokens</div>
    <div class="kpi-value blue">${(summary.totalCached / 1000).toFixed(1)}k</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Total Input Tokens</div>
    <div class="kpi-value">${(summary.totalInput / 1000).toFixed(1)}k</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Generations w/ Cache</div>
    <div class="kpi-value amber">${summary.generationsWithCache} / ${summary.totalGenerations}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Total LLM Cost</div>
    <div class="kpi-value">$${summary.totalCost}</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Est. Cache Savings</div>
    <div class="kpi-value green">$${summary.estimatedSavings}</div>
  </div>
</div>

<div class="chart-row">
  <div class="chart-card full">
    <h2>Cache Hit Rate by Day (%)</h2>
    <canvas id="cacheRateChart" height="80"></canvas>
  </div>
</div>

<div class="chart-row">
  <div class="chart-card">
    <h2>Cached vs Fresh Input Tokens by Day</h2>
    <canvas id="tokenStackChart" height="160"></canvas>
  </div>
  <div class="chart-card">
    <h2>Daily Cost ($)</h2>
    <canvas id="costChart" height="160"></canvas>
  </div>
</div>

<div class="chart-row">
  <div class="chart-card">
    <h2>Generations per Day</h2>
    <canvas id="genCountChart" height="160"></canvas>
  </div>
  <div class="chart-card">
    <h2>Cache Hit Rate by Model</h2>
    <canvas id="modelChart" height="160"></canvas>
  </div>
</div>

<p class="footer">Sunder &middot; Langfuse cache metrics dashboard</p>

<script>
const chartDefaults = { responsive: true, maintainAspectRatio: true };
const gridColor = '#262626';
const tickColor = '#666';

// Cache hit rate line
new Chart(document.getElementById('cacheRateChart'), {
  type: 'line',
  data: {
    labels: ${dayLabels},
    datasets: [{
      label: 'Cache Hit Rate %',
      data: ${dayCacheRates},
      borderColor: '#22c55e',
      backgroundColor: 'rgba(34,197,94,0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 4,
      pointBackgroundColor: '#22c55e',
    }]
  },
  options: {
    ...chartDefaults,
    scales: {
      y: { min: 0, max: 100, grid: { color: gridColor }, ticks: { color: tickColor, callback: v => v + '%' } },
      x: { grid: { color: gridColor }, ticks: { color: tickColor } },
    },
    plugins: { legend: { display: false } },
  }
});

// Stacked token bar
new Chart(document.getElementById('tokenStackChart'), {
  type: 'bar',
  data: {
    labels: ${dayLabels},
    datasets: [
      { label: 'Cached', data: ${dayCachedTokens}, backgroundColor: '#22c55e' },
      { label: 'Fresh', data: ${dayFreshTokens}, backgroundColor: '#3b82f6' },
    ]
  },
  options: {
    ...chartDefaults,
    scales: {
      y: { stacked: true, grid: { color: gridColor }, ticks: { color: tickColor } },
      x: { stacked: true, grid: { color: gridColor }, ticks: { color: tickColor } },
    },
    plugins: { legend: { labels: { color: '#ccc' } } },
  }
});

// Cost chart
new Chart(document.getElementById('costChart'), {
  type: 'bar',
  data: {
    labels: ${dayLabels},
    datasets: [{
      label: 'Cost ($)',
      data: ${dayCosts},
      backgroundColor: '#f59e0b',
    }]
  },
  options: {
    ...chartDefaults,
    scales: {
      y: { grid: { color: gridColor }, ticks: { color: tickColor, callback: v => '$' + v } },
      x: { grid: { color: gridColor }, ticks: { color: tickColor } },
    },
    plugins: { legend: { display: false } },
  }
});

// Generations per day
new Chart(document.getElementById('genCountChart'), {
  type: 'bar',
  data: {
    labels: ${dayLabels},
    datasets: [{
      label: 'Generations',
      data: ${dayGenCounts},
      backgroundColor: '#8b5cf6',
    }]
  },
  options: {
    ...chartDefaults,
    scales: {
      y: { grid: { color: gridColor }, ticks: { color: tickColor } },
      x: { grid: { color: gridColor }, ticks: { color: tickColor } },
    },
    plugins: { legend: { display: false } },
  }
});

// Model breakdown
new Chart(document.getElementById('modelChart'), {
  type: 'bar',
  data: {
    labels: ${modelLabels},
    datasets: [{
      label: 'Cache Hit Rate %',
      data: ${modelCacheRates},
      backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'],
    }]
  },
  options: {
    ...chartDefaults,
    indexAxis: 'y',
    scales: {
      x: { min: 0, max: 100, grid: { color: gridColor }, ticks: { color: tickColor, callback: v => v + '%' } },
      y: { grid: { color: gridColor }, ticks: { color: tickColor } },
    },
    plugins: { legend: { display: false } },
  }
});
</script>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const generations = await fetchGenerations();
  console.log(`Fetched ${generations.length} generations.`);

  if (generations.length === 0) {
    console.log("No generations found in the time range.");
    process.exit(0);
  }

  const metrics = computeMetrics(generations);

  // Print summary to terminal
  console.log("\n── Prompt Cache Summary ──────────────────────");
  console.log(`  Cache hit rate:       ${metrics.summary.cacheHitRate}%`);
  console.log(
    `  Cached tokens:        ${(metrics.summary.totalCached / 1000).toFixed(1)}k`,
  );
  console.log(
    `  Total input tokens:   ${(metrics.summary.totalInput / 1000).toFixed(1)}k`,
  );
  console.log(
    `  Generations w/ cache: ${metrics.summary.generationsWithCache} / ${metrics.summary.totalGenerations}`,
  );
  console.log(`  Total LLM cost:       $${metrics.summary.totalCost}`);
  console.log(`  Est. cache savings:   $${metrics.summary.estimatedSavings}`);
  console.log("───────────────────────────────────────────────\n");

  // Write HTML dashboard
  const html = generateDashboard(metrics);
  const outPath = join(tmpdir(), "sunder-cache-metrics.html");
  writeFileSync(outPath, html);
  console.log(`Dashboard written to: ${outPath}`);

  // Open in browser
  try {
    const openCmd =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    execSync(`${openCmd} "${outPath}"`);
    console.log("Opened in browser.");
  } catch {
    console.log("Could not auto-open. Open the file manually.");
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
