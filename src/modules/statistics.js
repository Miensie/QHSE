/**
 * statistics.js — Fonctions statistiques pour l'analyse qualité
 * Basé sur les méthodes ISO 9001 / Six Sigma / GUM
 */
"use strict";

// ─── Statistiques descriptives ────────────────────────────────────────────────

function mean(data) {
  if (!data.length) return 0;
  return data.reduce((a, b) => a + b, 0) / data.length;
}

function variance(data, population = false) {
  if (data.length < 2) return 0;
  const m = mean(data);
  const sum = data.reduce((acc, v) => acc + (v - m) ** 2, 0);
  return sum / (population ? data.length : data.length - 1);
}

function stdDev(data, population = false) {
  return Math.sqrt(variance(data, population));
}

function median(data) {
  const sorted = [...data].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function range(data) {
  return Math.max(...data) - Math.min(...data);
}

function percentile(data, p) {
  const sorted = [...data].sort((a, b) => a - b);
  const idx    = (p / 100) * (sorted.length - 1);
  const lower  = Math.floor(idx);
  const upper  = Math.ceil(idx);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function skewness(data) {
  const n = data.length;
  const m = mean(data);
  const s = stdDev(data);
  if (s === 0) return 0;
  const sum = data.reduce((acc, v) => acc + ((v - m) / s) ** 3, 0);
  return (n / ((n - 1) * (n - 2))) * sum;
}

function kurtosis(data) {
  const n = data.length;
  const m = mean(data);
  const s = stdDev(data);
  if (s === 0) return 0;
  const sum = data.reduce((acc, v) => acc + ((v - m) / s) ** 4, 0);
  return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum
    - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
}

function summarize(data) {
  const sorted = [...data].sort((a, b) => a - b);
  return {
    n:     data.length,
    mean:  mean(data),
    std:   stdDev(data),
    min:   sorted[0],
    q1:    percentile(data, 25),
    median:median(data),
    q3:    percentile(data, 75),
    max:   sorted[sorted.length - 1],
    range: range(data),
    cv:    (stdDev(data) / mean(data)) * 100, // coeff variation %
    skewness: skewness(data),
    kurtosis: kurtosis(data),
  };
}

// ─── Indices de capabilité ────────────────────────────────────────────────────

/**
 * Calcule Cp et Cpk.
 * @param {number[]} data  - données mesurées
 * @param {number}   lsl   - lower spec limit
 * @param {number}   usl   - upper spec limit
 * @returns {{ cp, cpk, ppm }}
 */
function capability(data, lsl, usl) {
  const m  = mean(data);
  const s  = stdDev(data);

  if (s === 0) return { cp: Infinity, cpk: Infinity, ppm: 0 };

  const cp  = (usl - lsl) / (6 * s);
  const cpu = (usl - m) / (3 * s);
  const cpl = (m - lsl) / (3 * s);
  const cpk = Math.min(cpu, cpl);

  // Estimation PPM hors spécifications (approximation normale)
  const zUpper = (usl - m) / s;
  const zLower = (m - lsl) / s;
  const ppmUpper = 1_000_000 * normCDF(-zUpper);
  const ppmLower = 1_000_000 * normCDF(-zLower);
  const ppm      = ppmUpper + ppmLower;

  return { cp, cpk, cpu, cpl, ppm: Math.round(ppm), sigma: m / s };
}

// Distribution normale standard CDF (approximation Abramowitz & Stegun)
function normCDF(z) {
  const a1 =  0.254829592, a2 = -0.284496736, a3 =  1.421413741;
  const a4 = -1.453152027, a5 =  1.061405429, p  =  0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

// ─── Histogramme ──────────────────────────────────────────────────────────────

/**
 * Calcule les classes d'un histogramme (règle de Sturges).
 */
function histogram(data, numBins = null) {
  const n    = data.length;
  const bins = numBins || Math.max(5, Math.ceil(Math.log2(n) + 1)); // Sturges
  const min  = Math.min(...data);
  const max  = Math.max(...data);
  const step = (max - min) / bins;

  const counts = Array(bins).fill(0);
  const edges  = Array.from({ length: bins + 1 }, (_, i) => min + i * step);

  data.forEach(v => {
    let idx = Math.floor((v - min) / step);
    if (idx >= bins) idx = bins - 1;
    counts[idx]++;
  });

  return {
    counts,
    edges,
    labels: edges.slice(0, -1).map((e, i) => `[${e.toFixed(2)}, ${edges[i + 1].toFixed(2)}[`),
  };
}

// ─── Pareto ───────────────────────────────────────────────────────────────────

/**
 * Calcule les données pour un diagramme de Pareto.
 * @param {string[]} categories  - tableau de catégories/causes
 * @param {number[]} [counts]    - fréquences (si null, compte les occurrences)
 */
function paretoAnalysis(categories, counts = null) {
  // Agréger les fréquences
  const freq = {};
  if (counts) {
    categories.forEach((c, i) => { freq[c] = (freq[c] || 0) + (counts[i] || 0); });
  } else {
    categories.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
  }

  const total = Object.values(freq).reduce((a, b) => a + b, 0);

  // Trier par fréquence décroissante
  const sorted = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([cause, f]) => ({ cause, freq: f, pct: (f / total) * 100 }));

  // Calcul du cumulé
  let cumul = 0;
  sorted.forEach(item => {
    cumul += item.pct;
    item.cumul = cumul;
    item.classe = item.cumul <= 80 ? "A" : item.cumul <= 95 ? "B" : "C";
  });

  return { rows: sorted, total };
}

window.QualityStats = {
  mean, variance, stdDev, median, range, percentile,
  skewness, kurtosis, summarize,
  capability, normCDF,
  histogram,
  paretoAnalysis,
};
