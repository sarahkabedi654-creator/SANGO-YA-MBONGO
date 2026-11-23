import { Chart } from 'chart.js/auto';
import { escapeHtml } from './actualites.js';

const charts = new Map();
export function drawTrend(id, points) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  charts.get(id)?.destroy();
  const chart = new Chart(canvas, {
    type: 'line',
    data: { labels: Object.keys(points), datasets: [{ label: 'Articles publiés', data: Object.values(points), borderColor: '#287c5a', backgroundColor: 'rgba(40,124,90,.09)', fill: true, tension: .36, pointRadius: 3, pointBackgroundColor: '#287c5a', borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { displayColors: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#87928c', maxTicksLimit: 8 } }, y: { beginAtZero: true, ticks: { precision: 0, color: '#87928c' }, grid: { color: '#edf0ed' } } } }
  });
  charts.set(id, chart);
}

export function mountAnalysis() {
  return `<section class="analysis-stats"><div class="panel analysis-chart"><div class="panel-heading"><div><div class="eyebrow">PUBLICATIONS INDEXÉES</div><h3>Volume quotidien · 30 jours</h3></div></div><div class="chart-wrap"><canvas id="analysis-trend" aria-label="Nombre d’articles par jour"></canvas><div class="chart-empty" id="analysis-empty">Les données apparaîtront lorsque des articles auront été collectés.</div></div></div><div class="panel"><div class="eyebrow">RÉPARTITION PAR SOURCE</div><h3>Articles enregistrés</h3><div id="analysis-sources" class="topic-list"><div class="empty-small">Chargement des agrégats…</div></div></div></section><section class="analysis-stats"><div class="panel"><div class="eyebrow">THÉMATIQUES</div><h3>Catégories éditoriales</h3><div id="analysis-topics" class="topic-list"></div></div><div class="panel"><div class="eyebrow">OPÉRATEURS CITÉS</div><h3>Mentions dans les articles</h3><div id="analysis-operators" class="topic-list"></div></div></section><section class="panel analysis-note"><span class="note-symbol">i</span><div><b>Méthode et limites</b><p>Les volumes et répartitions proviennent des articles réellement présents en base. Les mentions d’opérateurs sont détectées dans le titre et le résumé; un article peut mentionner plusieurs opérateurs. Elles ne mesurent ni les parts de marché ni l’activité transactionnelle. La couverture éditoriale des sources est partielle.</p></div></section><section class="panel indicator-panel"><div class="panel-heading"><div><div class="eyebrow">INDICATEURS &Eacute;CONOMIQUES</div><h3>Banque mondiale &middot; RDC</h3><p>Inclusion financi&egrave;re, connectivit&eacute; et contexte &eacute;conomique. Les p&eacute;riodes sont celles publi&eacute;es par la source.</p></div><button type="button" id="collect-indicators" class="button button-dark">Actualiser les indicateurs</button></div><p id="indicator-feedback" class="indicator-feedback" role="status" aria-live="polite"></p><div id="indicator-grid" class="indicator-grid"><div class="empty-small">Chargement des indicateurs officiels&hellip;</div></div><small class="indicator-disclaimer">Donn&eacute;es annuelles. Les indicateurs d&#39;acc&egrave;s et d&#39;usage ne mesurent pas les transactions mobile money ni les parts de march&eacute;.</small></section>`;
}

function renderBreakdown(elementId, rows) {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (!rows?.length) { el.innerHTML = '<div class="empty-small">Aucune donnée disponible.</div>'; return; }
  const maximum = Math.max(...rows.map(row => Number(row.count) || 0), 1);
  el.innerHTML = rows.map(row => `<div class="topic-row"><span>${escapeHtml(row.name)}</span><div class="topic-track"><i style="width:${Math.max(3, Math.round((Number(row.count) || 0) / maximum * 100))}%"></i></div><b>${Number(row.count).toLocaleString('fr-FR')}</b></div>`).join('');
}

export function updateAnalysis(state) {
  const data = state?.analytics;
  if (!data) {
    const empty = document.querySelector('#analysis-empty');
    if (empty) { empty.hidden = false; empty.textContent = 'Les agrégats analytiques sont indisponibles. Vérifiez la migration SQL get_dashboard_analytics et la connexion Supabase.'; }
    for (const id of ['analysis-sources', 'analysis-topics', 'analysis-operators']) {
      const element = document.getElementById(id);
      if (element) element.innerHTML = '<div class="empty-small">Données analytiques indisponibles.</div>';
    }
    return;
  }
  const points = {};
  for (const item of data.daily || []) {
    const date = new Date(`${item.date}T00:00:00`);
    points[date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })] = item.count;
  }
  if (Object.keys(points).length) {
    drawTrend('analysis-trend', points);
    const empty = document.querySelector('#analysis-empty');
    if (empty) empty.hidden = true;
  }
  renderBreakdown('analysis-sources', data.sources);
  renderBreakdown('analysis-topics', data.topics);
  renderBreakdown('analysis-operators', data.operators);
}

export function updateWorldBankIndicators(rows, error = null) {
  const grid = document.querySelector('#indicator-grid');
  if (!grid) return;
  if (error) {
    grid.innerHTML = '<div class="source-alert">Les indicateurs World Bank sont temporairement inaccessibles.</div>';
    return;
  }
  if (!rows?.length) {
    grid.innerHTML = '<div class="empty-state"><h3>Aucune observation enregistrée</h3><p>Les valeurs apparaîtront après la première collecte World Bank planifiée ou manuelle.</p></div>';
    return;
  }

  const grouped = rows.reduce((map, row) => { const items = map.get(row.indicator_code) || []; items.push(row); map.set(row.indicator_code, items); return map; }, new Map());
  grid.innerHTML = [...grouped.entries()].map(([code, observations]) => {
    const series = observations.sort((a, b) => Number(a.period) - Number(b.period));
    const latest = series.at(-1);
    const chartId = `world-bank-${code.replace(/[^A-Za-z0-9_-]/g, '-')}`;
    const updated = latest.fetched_at && Number.isFinite(Date.parse(latest.fetched_at))
      ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lubumbashi' }).format(new Date(latest.fetched_at))
      : 'Date de récupération inconnue';
    const number = Number(latest.value);
    const formatted = Number.isFinite(number) ? number.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—';
    return `<article class="indicator-card"><div class="eyebrow">${escapeHtml(code)}</div><h4>${escapeHtml(latest.indicator_name)}</h4><div class="indicator-value">${formatted} <span>${escapeHtml(latest.unit || '')}</span></div><p>Dernière période publiée : <b>${escapeHtml(latest.period)}</b></p><p class="indicator-updated">Récupérée le ${escapeHtml(updated)} · pays ISO3 ${escapeHtml(latest.country_code)}</p><div class="indicator-chart-wrap"><canvas id="${chartId}" aria-label="Évolution annuelle de ${escapeHtml(latest.indicator_name)}"></canvas></div><a class="text-link" href="https://data.worldbank.org/indicator/${encodeURIComponent(code)}?locations=CD" target="_blank" rel="noopener noreferrer">Source officielle World Bank ↗</a></article>`;
  }).join('');

  for (const [code, observations] of grouped) {
    const chartId = `world-bank-${code.replace(/[^A-Za-z0-9_-]/g, '-')}`;
    const canvas = document.getElementById(chartId);
    if (!canvas) continue;
    charts.get(chartId)?.destroy();
    const series = observations.slice().sort((a, b) => Number(a.period) - Number(b.period));
    charts.set(chartId, new Chart(canvas, {
      type: 'line',
      data: {
        labels: series.map(item => item.period),
        datasets: [{ label: series[0].unit || series[0].indicator_name, data: series.map(item => Number(item.value)), borderColor: '#287c5a', backgroundColor: 'rgba(40,124,90,.08)', fill: true, tension: .25, pointRadius: 2, pointBackgroundColor: '#287c5a', borderWidth: 2 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: false, ticks: { precision: 2 }, grid: { color: '#edf0ed' } } } }
    }));
  }
}
