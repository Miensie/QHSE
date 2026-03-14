/**
 * controlCharts.js — Cartes de contrôle SPC
 * Implémente : X̄-R, I-MR, Carte p, Carte c
 * + Détection des 8 règles de Nelson / Western Electric
 */
"use strict";

// ─── Constantes de tables SPC (ASTM, Montgomery) ─────────────────────────────
// d2, d3, A2, D3, D4 pour tailles de sous-groupes n=2..25
const SPC_CONSTANTS = {
  //  n:   d2,     d3,     A2,     D3,     D4
  2:  [1.128,  0.853,  1.880,  0,      3.267],
  3:  [1.693,  0.888,  1.023,  0,      2.575],
  4:  [2.059,  0.880,  0.729,  0,      2.282],
  5:  [2.326,  0.864,  0.577,  0,      2.115],
  6:  [2.534,  0.848,  0.483,  0,      2.004],
  7:  [2.704,  0.833,  0.419,  0.076,  1.924],
  8:  [2.847,  0.820,  0.373,  0.136,  1.864],
  9:  [2.970,  0.808,  0.337,  0.184,  1.816],
  10: [3.078,  0.797,  0.308,  0.223,  1.777],
  15: [3.472,  0.749,  0.223,  0.347,  1.653],
  20: [3.735,  0.729,  0.180,  0.415,  1.585],
  25: [3.931,  0.720,  0.153,  0.459,  1.541],
};

function getSPCConst(n) {
  if (SPC_CONSTANTS[n]) return SPC_CONSTANTS[n];
  // Interpolation simple pour n non tabulé
  const keys   = Object.keys(SPC_CONSTANTS).map(Number).sort((a, b) => a - b);
  const lower  = keys.filter(k => k <= n).pop() || 2;
  const upper  = keys.filter(k => k >= n)[0]    || 25;
  if (lower === upper) return SPC_CONSTANTS[lower];
  const t = (n - lower) / (upper - lower);
  const lo = SPC_CONSTANTS[lower], hi = SPC_CONSTANTS[upper];
  return lo.map((v, i) => v + t * (hi[i] - v));
}

// ─── Carte X̄-R ───────────────────────────────────────────────────────────────

/**
 * @param {number[]} data    - données brutes
 * @param {number}   n       - taille des sous-groupes
 * @returns {{ xbar, rChart, stats }}
 */
function xbarRChart(data, n = 5) {
  const k     = Math.floor(data.length / n);  // nombre de sous-groupes
  const [d2, , A2, D3, D4] = getSPCConst(n);

  const subgroups = [];
  for (let i = 0; i < k; i++) {
    const sg = data.slice(i * n, (i + 1) * n);
    const m  = QualityStats.mean(sg);
    const r  = Math.max(...sg) - Math.min(...sg);
    subgroups.push({ i: i + 1, mean: m, range: r, values: sg });
  }

  const Xdbar = QualityStats.mean(subgroups.map(s => s.mean));
  const Rbar  = QualityStats.mean(subgroups.map(s => s.range));
  const sigma = Rbar / d2;  // estimation de sigma

  const xbarChart = {
    points:  subgroups.map(s => ({ x: s.i, value: s.mean, outOfControl: false })),
    mean:    Xdbar,
    ucl:     Xdbar + A2 * Rbar,
    lcl:     Math.max(0, Xdbar - A2 * Rbar),
    sigma,
    title:   "Carte X̄",
    ylabel:  "Moyenne",
  };

  const rChart = {
    points:  subgroups.map(s => ({ x: s.i, value: s.range, outOfControl: false })),
    mean:    Rbar,
    ucl:     D4 * Rbar,
    lcl:     D3 * Rbar,
    title:   "Carte R",
    ylabel:  "Étendue",
  };

  // Détecter les violations
  applyNelsonRules(xbarChart);
  applyNelsonRules(rChart);

  return {
    xbarChart,
    rChart,
    stats: {
      n: data.length, k, subgroupSize: n,
      mean: Xdbar, rbar: Rbar, sigma,
      uclX: xbarChart.ucl, lclX: xbarChart.lcl,
      uclR: rChart.ucl,    lclR: rChart.lcl,
    },
  };
}

// ─── Carte I-MR (individuelle / étendue mobile) ───────────────────────────────

/**
 * @param {number[]} data
 */
function iMRChart(data) {
  const n = data.length;
  const mr = data.slice(1).map((v, i) => Math.abs(v - data[i])); // étendues mobiles

  const xbar  = QualityStats.mean(data);
  const mrbar = QualityStats.mean(mr);
  const d2    = 1.128; // pour n=2 sous-groupes

  const iChart = {
    points:  data.map((v, i) => ({ x: i + 1, value: v, outOfControl: false })),
    mean:    xbar,
    ucl:     xbar + 3 * (mrbar / d2),
    lcl:     xbar - 3 * (mrbar / d2),
    title:   "Carte I (Individuelle)",
    ylabel:  "Valeur",
  };

  const mrChart = {
    points:  mr.map((v, i) => ({ x: i + 2, value: v, outOfControl: false })),
    mean:    mrbar,
    ucl:     3.267 * mrbar,  // D4 pour n=2
    lcl:     0,
    title:   "Carte MR (Étendue mobile)",
    ylabel:  "Étendue mobile",
  };

  applyNelsonRules(iChart);
  applyNelsonRules(mrChart);

  return {
    iChart,
    mrChart,
    stats: {
      n: data.length,
      mean: xbar,
      mrbar,
      sigma: mrbar / d2,
      uclI: iChart.ucl, lclI: iChart.lcl,
      uclMR: mrChart.ucl,
    },
  };
}

// ─── Carte p (proportion de non-conformes) ────────────────────────────────────

/**
 * @param {number[]} defectives  - nombre de non-conformes par lot
 * @param {number[]} lotSizes    - taille de chaque lot
 */
function pChart(defectives, lotSizes) {
  const k    = defectives.length;
  const pbar = defectives.reduce((a, b) => a + b, 0) / lotSizes.reduce((a, b) => a + b, 0);

  const points = defectives.map((d, i) => {
    const p   = d / lotSizes[i];
    const ucl = pbar + 3 * Math.sqrt((pbar * (1 - pbar)) / lotSizes[i]);
    const lcl = Math.max(0, pbar - 3 * Math.sqrt((pbar * (1 - pbar)) / lotSizes[i]));
    return { x: i + 1, value: p, ucl, lcl, outOfControl: p > ucl || p < lcl };
  });

  return {
    chart: {
      points,
      mean:  pbar,
      ucl:   null, // variable
      lcl:   null,
      title: "Carte p",
      ylabel:"Proportion NC",
    },
    stats: { k, pbar, uclMean: points.reduce((a, b) => a + b.ucl, 0) / k },
  };
}

// ─── Carte c (nombre de défauts) ─────────────────────────────────────────────

/**
 * @param {number[]} defectCounts  - nombre de défauts par unité
 */
function cChart(defectCounts) {
  const cbar = QualityStats.mean(defectCounts);

  const chart = {
    points: defectCounts.map((v, i) => ({
      x: i + 1,
      value: v,
      outOfControl: false,
    })),
    mean:  cbar,
    ucl:   cbar + 3 * Math.sqrt(cbar),
    lcl:   Math.max(0, cbar - 3 * Math.sqrt(cbar)),
    title: "Carte c",
    ylabel:"Nb défauts",
  };

  applyNelsonRules(chart);
  return { chart, stats: { n: defectCounts.length, cbar, ucl: chart.ucl, lcl: chart.lcl } };
}

// ─── Règles de Nelson (détection de causes spéciales) ─────────────────────────

/**
 * Applique les 8 règles de Nelson sur un objet chart.
 * Marque chaque point et génère violations[].
 */
function applyNelsonRules(chart) {
  const pts    = chart.points;
  const mu     = chart.mean;
  const sigma  = chart.sigma || ((chart.ucl - mu) / 3);
  const violations = [];

  pts.forEach((p, i) => {
    p.outOfControl = false;
    p.violationRules = [];
  });

  // R1 : Point hors ±3σ (hors limites de contrôle)
  pts.forEach((p, i) => {
    const ucl = chart.ucl ?? p.ucl;
    const lcl = chart.lcl ?? p.lcl;
    if (ucl !== null && (p.value > ucl || p.value < lcl)) {
      p.outOfControl = true;
      p.violationRules.push(1);
      violations.push({ rule: 1, point: i + 1, label: `Point ${i + 1} hors limites (±3σ)` });
    }
  });

  if (sigma > 0) {
    const z = pts.map(p => (p.value - mu) / sigma);

    // R2 : 9 points consécutifs du même côté
    for (let i = 8; i < pts.length; i++) {
      const slice = z.slice(i - 8, i + 1);
      if (slice.every(v => v > 0) || slice.every(v => v < 0)) {
        pts[i].violationRules.push(2);
        pts[i].outOfControl = true;
        violations.push({ rule: 2, point: i + 1, label: `Point ${i + 1} : 9 consécutifs même côté de la moyenne (R2)` });
      }
    }

    // R3 : 6 points monotones (tendance)
    for (let i = 5; i < pts.length; i++) {
      const slice = pts.slice(i - 5, i + 1).map(p => p.value);
      const asc  = slice.every((v, j) => j === 0 || v > slice[j - 1]);
      const desc = slice.every((v, j) => j === 0 || v < slice[j - 1]);
      if (asc || desc) {
        pts[i].violationRules.push(3);
        violations.push({ rule: 3, point: i + 1, label: `Point ${i + 1} : tendance de 6 points monotones (R3)` });
      }
    }

    // R4 : 14 points alternant (oscillation)
    for (let i = 13; i < pts.length; i++) {
      const slice = pts.slice(i - 13, i + 1).map(p => p.value);
      const alt = slice.every((v, j) => {
        if (j === 0) return true;
        return j % 2 === 1 ? v > slice[j - 1] : v < slice[j - 1];
      });
      if (alt) {
        pts[i].violationRules.push(4);
        violations.push({ rule: 4, point: i + 1, label: `Point ${i + 1} : oscillation de 14 points (R4)` });
      }
    }

    // R5 : 2 des 3 derniers points > ±2σ (même côté)
    for (let i = 2; i < pts.length; i++) {
      const slice = z.slice(i - 2, i + 1);
      if (slice.filter(v => v > 2).length >= 2 || slice.filter(v => v < -2).length >= 2) {
        pts[i].violationRules.push(5);
        violations.push({ rule: 5, point: i + 1, label: `Point ${i + 1} : 2/3 points > ±2σ (R5)` });
      }
    }

    // R6 : 4 des 5 derniers points > ±1σ (même côté)
    for (let i = 4; i < pts.length; i++) {
      const slice = z.slice(i - 4, i + 1);
      if (slice.filter(v => v > 1).length >= 4 || slice.filter(v => v < -1).length >= 4) {
        pts[i].violationRules.push(6);
        violations.push({ rule: 6, point: i + 1, label: `Point ${i + 1} : 4/5 points > ±1σ (R6)` });
      }
    }
  }

  chart.violations = violations;
  return violations;
}

// ─── Rendu Chart.js ───────────────────────────────────────────────────────────

function renderControlChart(canvasId, chartData) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();

  const labels = chartData.points.map(p => p.x);
  const values = chartData.points.map(p => p.value);

  // Couleur des points selon le statut
  const pointColors = chartData.points.map(p =>
    p.outOfControl ? "#f85149" : "#58a6ff"
  );
  const pointRadii = chartData.points.map(p => p.outOfControl ? 6 : 3);

  // Lignes UCL/LCL variables (carte p) ou fixes
  const uclValues = chartData.points.map(p => p.ucl ?? chartData.ucl);
  const lclValues = chartData.points.map(p => p.lcl ?? chartData.lcl);

  new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: chartData.ylabel,
          data: values,
          borderColor: "#58a6ff",
          backgroundColor: "rgba(88,166,255,0.06)",
          fill: true,
          tension: 0.2,
          pointBackgroundColor: pointColors,
          pointRadius: pointRadii,
          pointHoverRadius: 7,
          borderWidth: 1.5,
        },
        {
          label: "UCL",
          data: uclValues,
          borderColor: "#f85149",
          borderDash: [6, 3],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
        {
          label: "Moyenne",
          data: Array(labels.length).fill(chartData.mean),
          borderColor: "#3fb950",
          borderDash: [3, 3],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
        {
          label: "LCL",
          data: lclValues,
          borderColor: "#f85149",
          borderDash: [6, 3],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#8b949e", font: { size: 10 }, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const pt = chartData.points[ctx.dataIndex];
              if (ctx.datasetIndex === 0 && pt?.outOfControl) {
                return ` ${ctx.dataset.label}: ${ctx.raw?.toFixed(4)} ⚠ HORS CONTRÔLE`;
              }
              return ` ${ctx.dataset.label}: ${ctx.raw?.toFixed(4)}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#8b949e", font: { size: 9 } },
          grid:  { color: "rgba(255,255,255,0.04)" },
        },
        y: {
          ticks: { color: "#8b949e", font: { size: 9 } },
          grid:  { color: "rgba(255,255,255,0.04)" },
        },
      },
    },
  });
}

window.ControlCharts = {
  xbarRChart,
  iMRChart,
  pChart,
  cChart,
  applyNelsonRules,
  renderControlChart,
};
