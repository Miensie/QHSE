/**
 * ============================================================
 * pareto.js — Diagramme de Pareto (principe 80/20)
 * ============================================================
 */
"use strict";

const ParetoModule = (() => {

  /**
   * Calcule le Pareto depuis un tableau de catégories/fréquences.
   * @param {string[]} categories
   * @param {number[]|null} frequencies - si null, compte les occurrences
   */
  function compute(categories, frequencies = null) {
    // Compter les fréquences si non fournies
    const freqMap = {};
    if (frequencies) {
      categories.forEach((c, i) => {
        freqMap[c] = (freqMap[c] || 0) + (frequencies[i] || 0);
      });
    } else {
      categories.forEach(c => { freqMap[c] = (freqMap[c] || 0) + 1; });
    }

    // Trier par fréquence décroissante
    const sorted = Object.entries(freqMap)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    const total = sorted.reduce((s, e) => s + e.count, 0);

    // Cumulatif
    let cumul = 0;
    sorted.forEach(e => {
      cumul += e.count;
      e.pct     = +(e.count / total * 100).toFixed(1);
      e.cumul   = +cumul.toFixed(0);
      e.cumulPct= +(cumul / total * 100).toFixed(1);
    });

    // Ligne 80%
    const vital80 = sorted.filter(e => e.cumulPct <= 80.1).map(e => e.label);

    return { items: sorted, total, vital80 };
  }

  /**
   * Calcule le Pareto depuis des données brutes exportées par ExcelBridge.
   */
  function computeFromRaw(rawData, causeKey, freqKey = null) {
    const categories  = rawData.map(row => String(row[causeKey] || "Inconnu"));
    const frequencies = freqKey ? rawData.map(row => parseFloat(row[freqKey]) || 0) : null;
    return compute(categories, frequencies);
  }

  /**
   * Dessine la carte Pareto sur un canvas Chart.js.
   * Retourne l'instance Chart.
   */
  function drawChart(canvasId, paretoData, existingChart = null) {
    if (existingChart) { existingChart.destroy(); }
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const labels   = paretoData.items.map(e => e.label.substring(0, 22));
    const counts   = paretoData.items.map(e => e.count);
    const cumulPct = paretoData.items.map(e => e.cumulPct);

    return new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type:            "bar",
            label:           "Fréquence",
            data:            counts,
            backgroundColor: counts.map((_, i) =>
              paretoData.items[i].cumulPct <= 80
                ? "rgba(0,212,255,0.7)"
                : "rgba(0,212,255,0.2)"),
            borderColor:     "rgba(0,212,255,0.9)",
            borderWidth:     1,
            yAxisID:         "y",
            order:           2,
          },
          {
            type:            "line",
            label:           "Cumulé %",
            data:            cumulPct,
            borderColor:     "#FFB830",
            backgroundColor: "transparent",
            borderWidth:     2,
            pointBackgroundColor: "#FFB830",
            pointRadius:     4,
            yAxisID:         "y2",
            tension:         0.1,
            order:           1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#8BA8C8", font: { size: 10 } } },
          annotation: {}, // plugin optionnel
        },
        scales: {
          x: { ticks: { color: "#8BA8C8", font: { size: 9 }, maxRotation: 45 },
               grid: { color: "rgba(255,255,255,0.04)" } },
          y: { ticks: { color: "#8BA8C8", font: { size: 9 } },
               grid: { color: "rgba(255,255,255,0.04)" },
               title: { display: true, text: "Fréquence", color: "#8BA8C8", font: { size: 9 } } },
          y2: {
            position: "right",
            min: 0, max: 100,
            ticks: { color: "#FFB830", font: { size: 9 }, callback: v => v + "%" },
            grid: { display: false },
            title: { display: true, text: "Cumulé %", color: "#FFB830", font: { size: 9 } },
          },
        },
      },
    });
  }

  /**
   * Génère le HTML du tableau Pareto.
   */
  function buildTable(paretoData) {
    const rows = paretoData.items.map(e => `
      <tr>
        <td>${e.label}</td>
        <td style="text-align:right;font-family:var(--font-mono)">${e.count}</td>
        <td style="text-align:right;font-family:var(--font-mono)">${e.pct}%</td>
        <td style="text-align:right;font-family:var(--font-mono)">${e.cumul}</td>
        <td style="text-align:right;font-family:var(--font-mono);
          color:${e.cumulPct <= 80 ? "var(--accent-cyan)" : "var(--text-muted)"}">
          ${e.cumulPct}%</td>
      </tr>`).join("");
    return `<thead><tr>
      <th>Cause</th><th>Fréquence</th><th>%</th><th>Cumulé</th><th>Cumulé %</th>
    </tr></thead><tbody>${rows}</tbody>`;
  }

  /**
   * Génère le texte d'analyse 80/20.
   */
  function buildAnalysis(paretoData) {
    const top = paretoData.vital80;
    const pct = top.length > 0
      ? (top.length / paretoData.items.length * 100).toFixed(0)
      : 0;
    return `<strong>${top.length} cause(s)</strong> sur ${paretoData.items.length} 
      représentent <strong>80% des défauts</strong> (${pct}% des catégories).<br>
      Causes vitales : <strong style="color:var(--accent-cyan)">${top.join(", ") || "—"}</strong><br>
      Total observé : <strong>${paretoData.total}</strong> occurrences.`;
  }

  return { compute, computeFromRaw, drawChart, buildTable, buildAnalysis };

})();

window.ParetoModule = ParetoModule;
