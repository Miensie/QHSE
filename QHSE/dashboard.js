/**
 * ============================================================
 * dashboard.js — Tableau de bord qualité
 * KPIs, graphiques tendance, distribution
 * ============================================================
 */
"use strict";

const Dashboard = (() => {

  let _charts = {};

  /**
   * Met à jour tous les KPIs à partir des données et résultats SPC.
   */
  function updateKPIs(data, spcResult = null, capabilityResult = null) {
    const stats = Statistics.describe(data);
    if (!stats) return;

    // Affichage KPIs
    _setKPI("kpi-n",     stats.n,              "obs.");
    _setKPI("kpi-mean",  stats.mean?.toFixed(4),"x̄");
    _setKPI("kpi-std",   stats.std?.toFixed(4), "σ");

    // OOC
    const oocCount = spcResult?.chart1?.ooc?.count || 0;
    _setKPIColor("kpi-ooc", oocCount, oocCount > 0 ? "#FF4D6D" : "#00E676");

    // Capabilité
    if (capabilityResult) {
      _setKPIColor("kpi-cp",  capabilityResult.cp?.toFixed(3),
        capabilityResult.cp  >= 1.33 ? "#00E676" : "#FFB830");
      _setKPIColor("kpi-cpk", capabilityResult.cpk?.toFixed(3),
        capabilityResult.cpk >= 1.33 ? "#00E676" : "#FFB830");
      _setKPI("kpi-sigma", capabilityResult.sigmaLevel?.toFixed(1), "σ");
    }

    // Taux NC (approximation via Z-score si pas USL/LSL)
    const outliers = Statistics.detectOutliers(data);
    const ncRate   = +(outliers.length / stats.n * 100).toFixed(2);
    _setKPIColor("kpi-nc", ncRate, ncRate > 5 ? "#FF4D6D" : ncRate > 2 ? "#FFB830" : "#00E676");

    return { stats, oocCount, ncRate };
  }

  function _setKPI(id, value, unit) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? "—";
  }

  function _setKPIColor(id, value, color) {
    const el = document.getElementById(id);
    if (el) { el.textContent = value ?? "—"; el.style.color = color; }
  }

  /**
   * Dessine le graphique d'évolution temporelle.
   */
  function drawEvolutionChart(data, labels = null) {
    _destroyChart("dashboard");
    const canvas = document.getElementById("chart-dashboard");
    if (!canvas || !data?.length) return;

    const pts    = data.map((v, i) => ({ x: i + 1, y: v }));
    const stats  = Statistics.describe(data);
    const mean   = stats.mean;
    const ucl    = mean + 3 * stats.std;
    const lcl    = Math.max(0, mean - 3 * stats.std);
    const xLabels = labels || data.map((_, i) => i + 1);

    _charts["dashboard"] = new Chart(canvas, {
      type: "line",
      data: {
        labels: xLabels,
        datasets: [
          {
            label:           "Mesures",
            data:            data,
            borderColor:     "#00D4FF",
            backgroundColor: "rgba(0,212,255,0.06)",
            fill:            true,
            tension:         0.25,
            pointRadius:     data.map((v, i) => {
              const ooc = v > ucl || v < lcl;
              return ooc ? 5 : 3;
            }),
            pointBackgroundColor: data.map(v => (v > ucl || v < lcl) ? "#FF4D6D" : "#00D4FF"),
            borderWidth: 1.5,
          },
          {
            label:      "Moyenne",
            data:       new Array(data.length).fill(mean),
            borderColor: "#FFB830",
            borderDash:  [5, 3],
            borderWidth: 1.5,
            pointRadius: 0,
            fill:        false,
          },
          {
            label:      "UCL",
            data:       new Array(data.length).fill(ucl),
            borderColor: "rgba(255,77,109,0.5)",
            borderDash:  [3, 3],
            borderWidth: 1,
            pointRadius: 0,
            fill:        false,
          },
          {
            label:      "LCL",
            data:       new Array(data.length).fill(lcl),
            borderColor: "rgba(255,77,109,0.5)",
            borderDash:  [3, 3],
            borderWidth: 1,
            pointRadius: 0,
            fill:        false,
          },
        ],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#8BA8C8", font: { size: 9 }, boxWidth: 10 } },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${typeof ctx.raw === "number" ? ctx.raw.toFixed(4) : ctx.raw}`,
            },
          },
        },
        scales: {
          x: { ticks: { color: "#8BA8C8", font: { size: 9 }, maxTicksLimit: 12 },
               grid:  { color: "rgba(255,255,255,0.04)" } },
          y: { ticks: { color: "#8BA8C8", font: { size: 9 } },
               grid:  { color: "rgba(255,255,255,0.04)" } },
        },
      },
    });
  }

  /**
   * Dessine l'histogramme de distribution + courbe normale.
   */
  function drawDistributionChart(data, bins = 15) {
    _destroyChart("distribution");
    const canvas = document.getElementById("chart-distribution");
    if (!canvas || !data?.length) return;

    const stats  = Statistics.describe(data);
    const minVal = stats.min, maxVal = stats.max;
    const binWidth = (maxVal - minVal) / bins;

    // Construire les bins
    const binCounts = new Array(bins).fill(0);
    const binLabels = [];
    for (let i = 0; i < bins; i++) {
      const lo = minVal + i * binWidth;
      const hi = lo + binWidth;
      binLabels.push(((lo + hi) / 2).toFixed(3));
      data.forEach(v => { if (v >= lo && v < hi) binCounts[i]++; });
    }

    // Courbe normale théorique (densité × N × binWidth)
    const normalCurve = binLabels.map(lb => {
      const x   = parseFloat(lb);
      const z   = (x - stats.mean) / stats.std;
      const phi = Math.exp(-0.5 * z * z) / (stats.std * Math.sqrt(2 * Math.PI));
      return +(phi * data.length * binWidth).toFixed(2);
    });

    _charts["distribution"] = new Chart(canvas, {
      type: "bar",
      data: {
        labels: binLabels,
        datasets: [
          {
            type:            "bar",
            label:           "Distribution",
            data:            binCounts,
            backgroundColor: "rgba(0,212,255,0.35)",
            borderColor:     "rgba(0,212,255,0.8)",
            borderWidth:     1,
            order:           2,
          },
          {
            type:            "line",
            label:           "Normale théorique",
            data:            normalCurve,
            borderColor:     "#FFB830",
            backgroundColor: "transparent",
            borderWidth:     2,
            pointRadius:     0,
            tension:         0.4,
            order:           1,
          },
        ],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#8BA8C8", font: { size: 9 }, boxWidth: 10 } },
        },
        scales: {
          x: { ticks: { color: "#8BA8C8", font: { size: 9 }, maxRotation: 45, maxTicksLimit: 10 },
               grid:  { display: false } },
          y: { ticks: { color: "#8BA8C8", font: { size: 9 } },
               grid:  { color: "rgba(255,255,255,0.04)" },
               title: { display: true, text: "Effectif", color: "#8BA8C8", font: { size: 9 } } },
        },
      },
    });
  }

  function _destroyChart(id) {
    if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
  }

  function destroyAll() {
    Object.keys(_charts).forEach(id => _destroyChart(id));
  }

  return { updateKPIs, drawEvolutionChart, drawDistributionChart, destroyAll };

})();

window.Dashboard = Dashboard;
