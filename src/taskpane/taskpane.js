/**
 * taskpane.js — Orchestrateur principal QHSE Analyzer Pro
 * Coordonne : ExcelBridge, QualityStats, ControlCharts, GeminiAI
 */
import "./taskpane.css";
import "../modules/statistics.js";
import "../modules/controlCharts.js";
import "../modules/excelBridge.js";
import "../modules/geminiAI.js";

// ─── État global ──────────────────────────────────────────────────────────────
const APP = {
  data:       null,   // { headers, rows, numericCols, textCols }
  mainCol:    null,   // données principales (numériques)
  catCol:     null,   // colonne catégorie (texte)
  spcResult:  null,   // dernier calcul SPC
  paretoResult: null, // dernier Pareto
  amdecRows:  [],     // lignes AMDEC
  charts:     {},     // instances Chart.js
  kpis:       {},     // KPIs dashboard
};

// ─── Démarrage ────────────────────────────────────────────────────────────────
Office.onReady((info) => {
  if (info.host !== Office.HostType.Excel) {
    setStatus("⚠ Excel requis");
    return;
  }
  initApp();
});

function initApp() {
  setupNavigation();
  setupDataHandlers();
  setupParetoHandlers();
  setupIshikawaHandlers();
  setupAMDECHandlers();
  setupSPCHandlers();
  setupDashboardHandlers();
  setupIAHandlers();
  setupRapportHandlers();
  GeminiAI.loadApiKey();
  setStatus("QHSE Analyzer Pro v2.0 ✓");
  log("Prêt — chargez vos données dans l'onglet Données.", "info");
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      const panel = document.getElementById(tab.dataset.panel);
      if (panel) panel.classList.add("active");
    });
  });
}

// ─── DONNÉES ──────────────────────────────────────────────────────────────────
function setupDataHandlers() {
  document.getElementById("btn-detect-range").addEventListener("click", async () => {
    try {
      const range = await ExcelBridge.detectUsedRange();
      document.getElementById("data-range").value = range;
      toast("Plage détectée : " + range, "info");
    } catch (e) { toast("Erreur détection : " + e.message, "error"); }
  });

  document.getElementById("btn-read-data").addEventListener("click", async () => {
    const range   = document.getElementById("data-range").value.trim();
    const headers = document.getElementById("data-headers").checked;
    if (!range) { toast("Saisissez une plage (ex: A1:F200)", "error"); return; }

    setBtnLoading("btn-read-data", true, "Lecture…");
    try {
      APP.data = await ExcelBridge.readRange(range, headers);
      renderColumnsUI();
      renderPreview();
      populateColumnSelects();
      toast(`✅ ${APP.data.totalRows} lignes lues`, "success");
      log(`${APP.data.totalRows} lignes · ${APP.data.headers.length} colonnes · ${APP.data.numericCols.length} num.`, "success");
    } catch (e) {
      toast("Erreur lecture : " + e.message, "error");
      log("Erreur : " + e.message, "error");
    }
    setBtnLoading("btn-read-data", false, "⬢ Importer les données");
  });
}

function renderColumnsUI() {
  const list = document.getElementById("columns-list");
  list.innerHTML = "";
  APP.data.headers.forEach((h, i) => {
    const isNum = APP.data.numericCols.some(c => c.index === i);
    const chip  = document.createElement("span");
    chip.className = `col-chip ${isNum ? "numeric" : "text"}`;
    chip.textContent = h;
    chip.title = isNum ? "Numérique" : "Texte";
    list.appendChild(chip);
  });
  document.getElementById("columns-card").style.display = "block";
}

function renderPreview() {
  const thead = document.getElementById("preview-thead");
  const tbody = document.getElementById("preview-tbody");
  thead.innerHTML = `<tr>${APP.data.headers.map(h => `<th>${h}</th>`).join("")}</tr>`;
  tbody.innerHTML = APP.data.rows.slice(0, 8).map(row =>
    `<tr>${row.map(v => `<td>${v ?? ""}</td>`).join("")}</tr>`
  ).join("");
  document.getElementById("preview-count").textContent = APP.data.totalRows;
  document.getElementById("preview-card").style.display = "block";
}

function populateColumnSelects() {
  const selects = ["select-main-col", "select-cat-col",
                   "pareto-col", "pareto-freq-col",
                   "spc-col", "spc-n-col"];

  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const currentVal = el.value;
    el.innerHTML = `<option value="">— Sélectionner —</option>`;
    APP.data.headers.forEach((h, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = h;
      el.appendChild(opt);
    });
    if (currentVal) el.value = currentVal;
  });

  // Pré-sélectionner la première colonne numérique
  if (APP.data.numericCols.length > 0) {
    const firstNum = APP.data.numericCols[0].index;
    ["select-main-col", "spc-col"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = firstNum;
    });
  }
  if (APP.data.textCols.length > 0) {
    const firstText = APP.data.textCols[0].index;
    ["select-cat-col", "pareto-col"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = firstText;
    });
  }
}

// ─── PARETO ───────────────────────────────────────────────────────────────────
function setupParetoHandlers() {
  document.getElementById("btn-pareto").addEventListener("click", () => {
    if (!APP.data) { toast("Importez d'abord vos données", "error"); return; }

    const catIdx  = parseInt(document.getElementById("pareto-col").value);
    const freqIdx = document.getElementById("pareto-freq-col").value;
    if (isNaN(catIdx)) { toast("Sélectionnez la colonne des causes", "error"); return; }

    const cats   = ExcelBridge.extractTextColumn(APP.data.rows, catIdx);
    const freqs  = freqIdx !== "" ? ExcelBridge.extractNumericColumn(APP.data.rows, parseInt(freqIdx)) : null;

    APP.paretoResult = QualityStats.paretoAnalysis(cats, freqs);
    renderParetoChart(APP.paretoResult);
    renderParetoTable(APP.paretoResult);
    document.getElementById("pareto-result").style.display = "block";
    toast(`✅ Pareto calculé — ${APP.paretoResult.rows.length} causes`, "success");
  });

  document.getElementById("btn-pareto-excel").addEventListener("click", async () => {
    if (!APP.paretoResult) return;
    await ExcelBridge.writePareto(APP.paretoResult.rows);
    toast("✅ Pareto écrit dans l'onglet 'Pareto'", "success");
  });
}

function renderParetoChart(result) {
  destroyChart("pareto");
  const canvas = document.getElementById("chart-pareto");
  const labels = result.rows.map(r => r.cause.substring(0, 20));
  const freqs  = result.rows.map(r => r.freq);
  const cumuls = result.rows.map(r => r.cumul);

  APP.charts["pareto"] = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: "Fréquence",
          data: freqs,
          backgroundColor: result.rows.map(r =>
            r.classe === "A" ? "rgba(248,81,73,0.7)" :
            r.classe === "B" ? "rgba(210,153,34,0.7)" : "rgba(72,79,88,0.7)"),
          borderRadius: 3,
          yAxisID: "yLeft",
        },
        {
          type: "line",
          label: "% Cumulé",
          data: cumuls,
          borderColor: "#39d0d8",
          pointBackgroundColor: "#39d0d8",
          pointRadius: 4,
          borderWidth: 2,
          fill: false,
          yAxisID: "yRight",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#8b949e", font: { size: 10 }, boxWidth: 12 } },
        annotation: {
          annotations: [{
            type: "line",
            yMin: 80, yMax: 80,
            yScaleID: "yRight",
            borderColor: "#f85149",
            borderDash: [4, 4],
            borderWidth: 1,
          }],
        },
      },
      scales: {
        x: { ticks: { color: "#8b949e", font: { size: 9 }, maxRotation: 45 }, grid: { color: "rgba(255,255,255,0.04)" } },
        yLeft:  { position: "left",  ticks: { color: "#8b949e", font: { size: 9 } }, grid: { color: "rgba(255,255,255,0.04)" } },
        yRight: { position: "right", min: 0, max: 100, ticks: { color: "#39d0d8", font: { size: 9 }, callback: v => v + "%" }, grid: { display: false } },
      },
    },
  });
}

function renderParetoTable(result) {
  document.getElementById("pareto-tbody").innerHTML = result.rows.map(r => `
    <tr>
      <td>${r.cause}</td>
      <td style="font-family:var(--font-data)">${r.freq}</td>
      <td style="font-family:var(--font-data)">${r.pct.toFixed(1)}%</td>
      <td style="font-family:var(--font-data)">${r.cumul.toFixed(1)}%</td>
      <td class="pareto-${r.classe.toLowerCase()}" style="font-weight:700">${r.classe}</td>
    </tr>`).join("");
}

// ─── ISHIKAWA ─────────────────────────────────────────────────────────────────
function setupIshikawaHandlers() {
  document.querySelectorAll(".ishi-add").forEach(block => {
    const cat = block.closest(".ishi-category").dataset.cat;
    const input = block.querySelector("input");
    const btn   = block.querySelector("button");
    const addCause = () => {
      const text = input.value.trim();
      if (!text) return;
      addIshikawaCause(cat, text);
      input.value = "";
    };
    btn.addEventListener("click", addCause);
    input.addEventListener("keydown", e => { if (e.key === "Enter") addCause(); });
  });

  document.getElementById("btn-ishi-ai").addEventListener("click", async () => {
    const effect = document.getElementById("ishi-effect").value.trim();
    if (!effect) { toast("Saisissez l'effet/problème", "error"); return; }
    if (!GeminiAI.hasApiKey()) { toast("Configurez la clé API Gemini", "error"); return; }
    setBtnLoading("btn-ishi-ai", true, "Analyse IA…");
    try {
      const existing = getIshikawaCauses();
      const suggestions = await GeminiAI.suggestIshikawaCauses(effect, existing);
      Object.entries(suggestions).forEach(([cat, causes]) => {
        if (Array.isArray(causes)) causes.forEach(c => addIshikawaCause(cat, c));
      });
      toast("✅ Causes IA ajoutées", "success");
    } catch (e) { toast("Erreur IA : " + e.message, "error"); }
    setBtnLoading("btn-ishi-ai", false, "✦ Suggestions IA");
  });

  document.getElementById("btn-ishi-generate").addEventListener("click", () => {
    const effect  = document.getElementById("ishi-effect").value.trim() || "Problème qualité";
    const causes  = getIshikawaCauses();
    renderIshikawaCanvas(effect, causes);
    document.getElementById("ishi-diagram-container").style.display = "block";
    toast("✅ Diagramme généré", "success");
  });
}

function addIshikawaCause(cat, text) {
  const container = document.getElementById(`causes-${cat}`);
  if (!container) return;
  const tag = document.createElement("div");
  tag.className = "ishi-cause-tag";
  tag.innerHTML = `<span>${text}</span><button title="Supprimer">×</button>`;
  tag.querySelector("button").addEventListener("click", () => tag.remove());
  container.appendChild(tag);
}

function getIshikawaCauses() {
  const cats = ["methode", "machine", "matiere", "main-oeuvre", "milieu", "mesure"];
  const result = {};
  cats.forEach(cat => {
    const el = document.getElementById(`causes-${cat}`);
    if (el) result[cat] = Array.from(el.querySelectorAll(".ishi-cause-tag span")).map(s => s.textContent);
  });
  return result;
}

function renderIshikawaCanvas(effect, causes) {
  const canvas = document.getElementById("chart-ishikawa");
  const ctx    = canvas.getContext("2d");
  canvas.width  = canvas.offsetWidth || 580;
  canvas.height = 300;
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#161b22";
  ctx.fillRect(0, 0, W, H);

  // Épine dorsale
  const spineY = H / 2;
  ctx.strokeStyle = "#8b949e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, spineY);
  ctx.lineTo(W - 60, spineY);
  ctx.stroke();

  // Boîte effet
  ctx.fillStyle = "#f85149";
  ctx.fillRect(W - 60, spineY - 18, 55, 36);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 9px 'Space Mono'";
  ctx.textAlign = "center";
  const lines = effect.match(/.{1,8}/g) || [effect];
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, W - 32, spineY - 4 + i * 12));

  const CATS = [
    { key: "methode",     label: "Méthode",       color: "#58a6ff", x: 0.15, y: -1 },
    { key: "machine",     label: "Machine",        color: "#d29922", x: 0.40, y: -1 },
    { key: "matiere",     label: "Matière",        color: "#bc8cff", x: 0.65, y: -1 },
    { key: "main-oeuvre", label: "Main d'œuvre",   color: "#3fb950", x: 0.15, y:  1 },
    { key: "milieu",      label: "Milieu",         color: "#39d0d8", x: 0.40, y:  1 },
    { key: "mesure",      label: "Mesure",         color: "#f85149", x: 0.65, y:  1 },
  ];

  CATS.forEach(cat => {
    const bx = cat.x * (W - 80) + 40;
    const by = spineY + cat.y * 70;
    // Branche principale
    ctx.strokeStyle = cat.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx, spineY);
    ctx.stroke();
    // Label catégorie
    ctx.fillStyle = cat.color;
    ctx.font = "bold 10px 'DM Sans'";
    ctx.textAlign = "center";
    ctx.fillText(cat.label, bx, by + cat.y * 14);
    // Causes
    const catCauses = causes[cat.key] || [];
    catCauses.slice(0, 3).forEach((c, i) => {
      const cx = bx - 30 + i * 20;
      const cy = by + cat.y * (25 + i * 14);
      ctx.strokeStyle = cat.color + "88";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(bx, spineY);
      ctx.stroke();
      ctx.fillStyle = "#8b949e";
      ctx.font = "8px 'DM Sans'";
      ctx.textAlign = cat.y < 0 ? "right" : "left";
      ctx.fillText(c.substring(0, 15), cx, cy - cat.y * 4);
    });
  });
}

// ─── AMDEC ────────────────────────────────────────────────────────────────────
function setupAMDECHandlers() {
  // Mise à jour RPN en temps réel
  ["amdec-g", "amdec-o", "amdec-d"].forEach(id => {
    document.getElementById(id).addEventListener("input", updateRPNPreview);
  });

  document.getElementById("btn-amdec-add").addEventListener("click", addAMDECRow);
  document.getElementById("btn-amdec-clear").addEventListener("click", () => {
    APP.amdecRows = [];
    renderAMDECTable();
    document.getElementById("amdec-results-card").style.display = "none";
  });
  document.getElementById("btn-amdec-excel").addEventListener("click", async () => {
    if (!APP.amdecRows.length) return;
    await ExcelBridge.writeAMDEC(APP.amdecRows);
    toast("✅ AMDEC écrit dans Excel", "success");
  });
}

function updateRPNPreview() {
  const g = parseInt(document.getElementById("amdec-g").value) || 1;
  const o = parseInt(document.getElementById("amdec-o").value) || 1;
  const d = parseInt(document.getElementById("amdec-d").value) || 1;
  const rpn = g * o * d;
  const badge = document.getElementById("amdec-rpn-preview");
  badge.textContent = rpn;
  badge.className = "rpn-badge " + (rpn >= 100 ? "critical" : rpn >= 50 ? "major" : "minor");
}

function addAMDECRow() {
  const row = {
    fonction: document.getElementById("amdec-fonction").value.trim(),
    mode:     document.getElementById("amdec-mode").value.trim(),
    effet:    document.getElementById("amdec-effet").value.trim(),
    cause:    document.getElementById("amdec-cause").value.trim(),
    g:        parseInt(document.getElementById("amdec-g").value) || 1,
    o:        parseInt(document.getElementById("amdec-o").value) || 1,
    d:        parseInt(document.getElementById("amdec-d").value) || 1,
    action:   document.getElementById("amdec-action").value.trim(),
  };
  row.rpn = row.g * row.o * row.d;
  if (!row.mode) { toast("Saisissez au moins le mode de défaillance", "error"); return; }

  APP.amdecRows.push(row);
  APP.amdecRows.sort((a, b) => b.rpn - a.rpn);
  renderAMDECTable();
  document.getElementById("amdec-results-card").style.display = "block";
  ["amdec-fonction","amdec-mode","amdec-effet","amdec-cause","amdec-action"].forEach(id => {
    document.getElementById(id).value = "";
  });
  ["amdec-g","amdec-o","amdec-d"].forEach(id => document.getElementById(id).value = 1);
  updateRPNPreview();
  toast(`✅ Mode ajouté (RPN=${row.rpn})`, "success");
}

function renderAMDECTable() {
  document.getElementById("amdec-count").textContent = APP.amdecRows.length;
  document.getElementById("amdec-tbody").innerHTML = APP.amdecRows.map((r, i) => {
    const cls = r.rpn >= 100 ? "critical" : r.rpn >= 50 ? "major" : "minor";
    return `<tr>
      <td>${r.fonction}</td><td>${r.mode}</td><td>${r.effet}</td><td>${r.cause}</td>
      <td style="text-align:center">${r.g}</td>
      <td style="text-align:center">${r.o}</td>
      <td style="text-align:center">${r.d}</td>
      <td><span class="rpn-badge ${cls}" style="font-size:11px">${r.rpn}</span></td>
      <td style="font-size:10px">${r.action}</td>
      <td><button onclick="removeAMDECRow(${i})" style="background:none;border:none;color:var(--accent-red);cursor:pointer;font-size:11px">✕</button></td>
    </tr>`;
  }).join("");

  renderAMDECChart();
}

window.removeAMDECRow = (i) => {
  APP.amdecRows.splice(i, 1);
  renderAMDECTable();
};

function renderAMDECChart() {
  destroyChart("amdec");
  const canvas = document.getElementById("chart-amdec");
  if (!canvas || !APP.amdecRows.length) return;
  const top8 = APP.amdecRows.slice(0, 8);
  APP.charts["amdec"] = new Chart(canvas, {
    type: "bar",
    data: {
      labels: top8.map(r => r.mode.substring(0, 16)),
      datasets: [{
        data: top8.map(r => r.rpn),
        backgroundColor: top8.map(r => r.rpn >= 100 ? "rgba(248,81,73,0.7)" : r.rpn >= 50 ? "rgba(210,153,34,0.7)" : "rgba(63,185,80,0.7)"),
        borderRadius: 3,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#8b949e", font: { size: 9 } }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: { ticks: { color: "#8b949e", font: { size: 9 } }, grid: { display: false } },
      },
    },
  });
}

// ─── SPC ──────────────────────────────────────────────────────────────────────
function setupSPCHandlers() {
  document.getElementById("spc-type").addEventListener("change", function () {
    const isPChart = this.value === "p";
    document.getElementById("spc-n-row").style.display = isPChart ? "flex" : "none";
    document.getElementById("spc-subgroup-row").style.display =
      (this.value === "xbar-r") ? "flex" : "none";
  });

  document.getElementById("btn-spc").addEventListener("click", () => {
    if (!APP.data) { toast("Importez d'abord vos données", "error"); return; }
    const type   = document.getElementById("spc-type").value;
    const colIdx = parseInt(document.getElementById("spc-col").value);
    if (isNaN(colIdx)) { toast("Sélectionnez la colonne de données", "error"); return; }

    const data = ExcelBridge.extractNumericColumn(APP.data.rows, colIdx);
    if (data.length < 10) { toast("Minimum 10 points requis pour une carte SPC", "error"); return; }

    computeSPC(type, data);
  });

  document.getElementById("btn-spc-excel").addEventListener("click", async () => {
    if (!APP.spcResult) return;
    const { stats, chart1 } = APP.spcResult;
    await ExcelBridge.writeSPCResults(APP.spcResult.type, stats, chart1.points);
    toast("✅ Carte SPC écrite dans Excel", "success");
  });
}

function computeSPC(type, data) {
  let result;
  const subSize = parseInt(document.getElementById("spc-subgroup").value) || 5;

  if (type === "xbar-r") {
    const r = ControlCharts.xbarRChart(data, subSize);
    APP.spcResult = { type, stats: r.stats, chart1: r.xbarChart, chart2: r.rChart };
    renderSPCResults(r.stats, r.xbarChart, r.rChart, r.stats);
  } else if (type === "imr") {
    const r = ControlCharts.iMRChart(data);
    APP.spcResult = { type, stats: r.stats, chart1: r.iChart, chart2: r.mrChart };
    renderSPCResults(r.stats, r.iChart, r.mrChart, r.stats);
  } else if (type === "c") {
    const r = ControlCharts.cChart(data);
    APP.spcResult = { type, stats: r.stats, chart1: r.chart, chart2: null };
    renderSPCResults(r.stats, r.chart, null, r.stats);
  }

  document.getElementById("spc-results").style.display = "block";
  updateDashboardKPIs();
}

function renderSPCResults(stats, chart1, chart2, rawStats) {
  document.getElementById("spc-chart1-title").textContent = chart1.title;
  ControlCharts.renderControlChart("chart-spc-1", chart1);

  const chart2Card = document.getElementById("spc-chart2-card");
  if (chart2) {
    chart2Card.style.display = "block";
    document.getElementById("spc-chart2-title").textContent = chart2.title;
    ControlCharts.renderControlChart("chart-spc-2", chart2);
  } else {
    chart2Card.style.display = "none";
  }

  // KPIs SPC
  document.getElementById("spc-kpis").innerHTML = `
    <div class="kpi-item"><div class="kpi-item-label">N points</div><div class="kpi-item-value">${stats.n}</div></div>
    <div class="kpi-item"><div class="kpi-item-label">Moyenne</div><div class="kpi-item-value">${stats.mean?.toFixed(4)}</div></div>
    <div class="kpi-item"><div class="kpi-item-label">Sigma</div><div class="kpi-item-value">${stats.sigma?.toFixed(4) ?? "—"}</div></div>
    <div class="kpi-item"><div class="kpi-item-label">UCL</div><div class="kpi-item-value" style="color:var(--accent-red)">${(stats.uclX ?? stats.ucl ?? stats.uclI)?.toFixed(4)}</div></div>
    <div class="kpi-item"><div class="kpi-item-label">LCL</div><div class="kpi-item-value" style="color:var(--accent-red)">${(stats.lclX ?? stats.lcl ?? stats.lclI)?.toFixed(4)}</div></div>
    <div class="kpi-item"><div class="kpi-item-label">Pts HC</div><div class="kpi-item-value" style="color:var(--accent-amber)">${chart1.violations?.filter(v => v.rule === 1).length ?? 0}</div></div>
  `;

  // Violations
  const allViol = [
    ...(chart1.violations || []),
    ...(chart2?.violations || []),
  ];
  const violEl = document.getElementById("spc-violations");
  if (allViol.length === 0) {
    violEl.innerHTML = `<div class="violation-item rule-3" style="background:rgba(63,185,80,0.1);border-color:var(--accent-green)">✅ Aucune violation — procédé sous contrôle statistique.</div>`;
  } else {
    violEl.innerHTML = allViol.map(v => `
      <div class="violation-item rule-${Math.min(v.rule, 3)}">
        <strong>R${v.rule}</strong> ${v.label}
      </div>`).join("");
  }

  APP.kpis.pointsHC = allViol.filter(v => v.rule === 1).length;
  APP.kpis.mean     = stats.mean;
  APP.kpis.sigma    = stats.sigma;
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function setupDashboardHandlers() {
  document.getElementById("btn-dashboard").addEventListener("click", () => {
    if (!APP.data) { toast("Importez d'abord vos données", "error"); return; }
    const colIdx = parseInt(document.getElementById("select-main-col").value);
    const catIdx = parseInt(document.getElementById("select-cat-col").value);

    if (isNaN(colIdx)) { toast("Sélectionnez la colonne principale", "error"); return; }
    const data = ExcelBridge.extractNumericColumn(APP.data.rows, colIdx);

    const lsl = parseFloat(document.getElementById("dash-lsl").value);
    const usl = parseFloat(document.getElementById("dash-usl").value);

    // Calcul KPIs
    const stats = QualityStats.summarize(data);
    const nc    = !isNaN(lsl) && !isNaN(usl)
      ? data.filter(v => v < lsl || v > usl).length : 0;

    APP.kpis = {
      ...APP.kpis,
      tauxNC:   (nc / data.length) * 100,
      nbDefauts: nc,
      mean:     stats.mean,
      sigma:    stats.std,
      ...(!isNaN(lsl) && !isNaN(usl) ? QualityStats.capability(data, lsl, usl) : {}),
    };

    updateDashboardKPIs();
    renderHistogram(data, lsl, usl);
    renderEvolution(data);
    document.getElementById("dash-charts-card").style.display    = "block";
    document.getElementById("dash-evolution-card").style.display = "block";
    toast("✅ Dashboard calculé", "success");
  });
}

function updateDashboardKPIs() {
  const fmt = v => v !== undefined && !isNaN(v) ? v.toFixed(2) : "—";
  document.getElementById("kpi-nc").textContent      = fmt(APP.kpis.tauxNC);
  document.getElementById("kpi-defauts").textContent = APP.kpis.nbDefauts ?? "—";
  document.getElementById("kpi-cpk").textContent     = fmt(APP.kpis.cpk);
  document.getElementById("kpi-hc").textContent      = APP.kpis.pointsHC ?? "—";
}

function renderHistogram(data, lsl, usl) {
  destroyChart("histogram");
  const canvas = document.getElementById("chart-histogram");
  const hist   = QualityStats.histogram(data, 12);
  const colors = hist.counts.map((_, i) => {
    const center = (hist.edges[i] + hist.edges[i + 1]) / 2;
    return (!isNaN(lsl) && center < lsl) || (!isNaN(usl) && center > usl)
      ? "rgba(248,81,73,0.6)" : "rgba(57,208,216,0.5)";
  });
  APP.charts["histogram"] = new Chart(canvas, {
    type: "bar",
    data: {
      labels: hist.edges.slice(0, -1).map(v => v.toFixed(2)),
      datasets: [{ data: hist.counts, backgroundColor: colors, borderRadius: 2 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#8b949e", font: { size: 8 }, maxRotation: 45 }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: { ticks: { color: "#8b949e", font: { size: 9 } }, grid: { color: "rgba(255,255,255,0.04)" } },
      },
    },
  });
}

function renderEvolution(data) {
  destroyChart("evolution");
  const canvas = document.getElementById("chart-evolution");
  const step   = Math.max(1, Math.floor(data.length / 50));
  const sampled = data.filter((_, i) => i % step === 0);
  const mean   = QualityStats.mean(data);
  APP.charts["evolution"] = new Chart(canvas, {
    type: "line",
    data: {
      labels: sampled.map((_, i) => i * step + 1),
      datasets: [
        { label: "Valeur", data: sampled, borderColor: "#58a6ff", backgroundColor: "rgba(88,166,255,0.06)", fill: true, tension: 0.2, pointRadius: 2, borderWidth: 1.5 },
        { label: "Moyenne", data: Array(sampled.length).fill(mean), borderColor: "#3fb950", borderDash: [4, 3], pointRadius: 0, borderWidth: 1.5, fill: false },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#8b949e", font: { size: 10 }, boxWidth: 12 } } },
      scales: {
        x: { ticks: { color: "#8b949e", font: { size: 9 } }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: { ticks: { color: "#8b949e", font: { size: 9 } }, grid: { color: "rgba(255,255,255,0.04)" } },
      },
    },
  });
}

// ─── IA ───────────────────────────────────────────────────────────────────────
function setupIAHandlers() {
  document.getElementById("btn-save-key").addEventListener("click", () => {
    const key = document.getElementById("gemini-key").value.trim();
    if (!key) { toast("Saisissez votre clé API", "error"); return; }
    GeminiAI.setApiKey(key);
    toast("✅ Clé API sauvegardée", "success");
  });

  document.getElementById("btn-ia-spc").addEventListener("click", async () => {
    if (!APP.spcResult) { toast("Calculez d'abord les cartes SPC", "error"); return; }
    if (!GeminiAI.hasApiKey()) { toast("Configurez la clé API Gemini", "error"); return; }
    await runIAAnalysis("spc");
  });

  document.getElementById("btn-ia-pareto").addEventListener("click", async () => {
    if (!APP.paretoResult) { toast("Calculez d'abord le Pareto", "error"); return; }
    if (!GeminiAI.hasApiKey()) { toast("Configurez la clé API Gemini", "error"); return; }
    await runIAAnalysis("pareto");
  });

  document.getElementById("btn-ia-amdec").addEventListener("click", async () => {
    if (!APP.amdecRows.length) { toast("Saisissez des données AMDEC", "error"); return; }
    if (!GeminiAI.hasApiKey()) { toast("Configurez la clé API Gemini", "error"); return; }
    await runIAAnalysis("amdec");
  });

  document.getElementById("btn-ia-global").addEventListener("click", async () => {
    if (!GeminiAI.hasApiKey()) { toast("Configurez la clé API Gemini", "error"); return; }
    await runIAAnalysis("global");
  });

  document.getElementById("btn-chat-send").addEventListener("click", handleChatSend);
  document.getElementById("chat-input").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSend(); }
  });
  document.querySelectorAll(".chat-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.getElementById("chat-input").value = chip.dataset.prompt;
      handleChatSend();
    });
  });
}

async function runIAAnalysis(type) {
  const zone    = document.getElementById("ia-result-zone");
  const content = document.getElementById("ia-content");
  zone.style.display = "block";
  content.innerHTML  = `<span class="spinner"></span> Analyse Gemini en cours…`;

  const btnMap = { spc: "btn-ia-spc", pareto: "btn-ia-pareto", amdec: "btn-ia-amdec", global: "btn-ia-global" };
  setBtnLoading(btnMap[type], true, "Analyse…");

  try {
    let result;
    if (type === "spc") {
      const violations = [
        ...(APP.spcResult.chart1.violations || []),
        ...(APP.spcResult.chart2?.violations || []),
      ];
      result = await GeminiAI.analyzeSPC(APP.spcResult.stats, violations, APP.spcResult.type);
    } else if (type === "pareto") {
      result = await GeminiAI.analyzePareto(APP.paretoResult.rows, APP.paretoResult.total);
    } else if (type === "amdec") {
      result = await GeminiAI.analyzeAMDEC(APP.amdecRows);
    } else {
      result = await GeminiAI.globalDiagnosis(APP.kpis, APP.spcResult?.stats, APP.paretoResult?.rows);
    }
    content.innerHTML = GeminiAI.formatResponseHTML(result);
    toast("✅ Analyse IA terminée", "success");
  } catch (e) {
    content.innerHTML = `<span style="color:var(--accent-red)">❌ ${e.message}</span>`;
    toast(e.message, "error");
  }

  setBtnLoading(btnMap[type], false, { spc:"◉ Interpréter les cartes SPC", pareto:"◈ Analyser le Pareto", amdec:"⚠ Évaluer l'AMDEC", global:"⬢ Diagnostic global" }[type]);
}

async function handleChatSend() {
  const input = document.getElementById("chat-input");
  const msg   = input.value.trim();
  if (!msg) return;
  if (!GeminiAI.hasApiKey()) { toast("Configurez la clé API Gemini", "error"); return; }

  input.value = "";
  appendChatMsg("user", msg);
  const typingId = appendChatMsg("assistant", `<span class="spinner"></span>`);

  try {
    const context = {
      spc:    APP.spcResult?.stats,
      kpis:   APP.kpis,
      pareto: APP.paretoResult?.rows?.slice(0, 5),
    };
    const resp = await GeminiAI.sendChatMessage(msg, context);
    document.getElementById(typingId).innerHTML = GeminiAI.formatResponseHTML(resp);
  } catch (e) {
    document.getElementById(typingId).innerHTML = `❌ ${e.message}`;
  }
}

let _chatMsgCount = 0;
function appendChatMsg(role, html) {
  const id  = `chat-msg-${++_chatMsgCount}`;
  const box = document.getElementById("chat-messages");
  box.insertAdjacentHTML("beforeend", `
    <div class="chat-msg chat-${role}">
      <div class="chat-bubble" id="${id}">${html}</div>
    </div>`);
  box.scrollTop = box.scrollHeight;
  return id;
}

// ─── RAPPORT ──────────────────────────────────────────────────────────────────
function setupRapportHandlers() {
  document.getElementById("btn-rapport-html").addEventListener("click", () => {
    generateHTMLReport();
  });

  document.getElementById("btn-rapport-excel").addEventListener("click", async () => {
    setBtnLoading("btn-rapport-excel", true, "Génération…");
    try {
      await generateExcelReport();
      toast("✅ Rapport généré dans Excel", "success");
      logRapport("Rapport Excel créé avec succès", "success");
    } catch (e) {
      toast("Erreur rapport : " + e.message, "error");
      logRapport("Erreur : " + e.message, "error");
    }
    setBtnLoading("btn-rapport-excel", false, "📊 Générer dans Excel");
  });
}

async function generateExcelReport() {
  const info = {
    entreprise: document.getElementById("rpt-entreprise").value || "—",
    ref:        document.getElementById("rpt-ref").value        || "—",
    periode:    document.getElementById("rpt-periode").value    || "—",
    analyste:   document.getElementById("rpt-analyste").value   || "—",
  };

  const summaryData = [
    ["Rapport QHSE — QHSE Analyzer Pro v2.0", ""],
    ["", ""],
    ["Entreprise",  info.entreprise],
    ["Référence",   info.ref],
    ["Période",     info.periode],
    ["Analyste",    info.analyste],
    ["Date",        new Date().toLocaleDateString("fr-FR")],
    ["", ""],
    ["=== KPIs QUALITÉ ===", ""],
    ["Taux NC (%)",         APP.kpis.tauxNC?.toFixed(2)   ?? "—"],
    ["Nb défauts",          String(APP.kpis.nbDefauts      ?? "—")],
    ["Cp",                  APP.kpis.cp?.toFixed(3)        ?? "—"],
    ["Cpk",                 APP.kpis.cpk?.toFixed(3)       ?? "—"],
    ["Points hors contrôle",String(APP.kpis.pointsHC       ?? "—")],
  ];
  await ExcelBridge.writeTable("Rapport_QHSE", "A1", summaryData);

  if (document.getElementById("rpt-include-pareto").checked && APP.paretoResult) {
    await ExcelBridge.writePareto(APP.paretoResult.rows);
    logRapport("Onglet Pareto créé", "success");
  }
  if (document.getElementById("rpt-include-amdec").checked && APP.amdecRows.length) {
    await ExcelBridge.writeAMDEC(APP.amdecRows);
    logRapport("Onglet AMDEC créé", "success");
  }
  if (document.getElementById("rpt-include-kpis").checked) {
    await ExcelBridge.writeDashboard(APP.kpis);
    logRapport("Onglet Dashboard créé", "success");
  }
}

function generateHTMLReport() {
  const info = {
    entreprise: document.getElementById("rpt-entreprise").value || "—",
    ref:        document.getElementById("rpt-ref").value        || "—",
    periode:    document.getElementById("rpt-periode").value    || "—",
    analyste:   document.getElementById("rpt-analyste").value   || "—",
  };

  // Lire les cases à cocher
  const inc = {
    pareto: document.getElementById("rpt-include-pareto").checked,
    spc:    document.getElementById("rpt-include-spc").checked,
    amdec:  document.getElementById("rpt-include-amdec").checked,
    kpis:   document.getElementById("rpt-include-kpis").checked,
    ia:     document.getElementById("rpt-include-ia").checked,
    ishi:   document.getElementById("rpt-include-ishi").checked,
  };

  const kpis  = APP.kpis;
  let sections = "";

  // ── KPIs ──
  if (inc.kpis) {
    sections += `<h2>KPIs Qualité</h2>
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">Taux NC</div><div class="kpi-val">${kpis.tauxNC?.toFixed(2) ?? "—"}%</div></div>
      <div class="kpi"><div class="kpi-label">Nb défauts</div><div class="kpi-val">${kpis.nbDefauts ?? "—"}</div></div>
      <div class="kpi"><div class="kpi-label">Cp</div><div class="kpi-val">${kpis.cp?.toFixed(3) ?? "—"}</div></div>
      <div class="kpi"><div class="kpi-label">Cpk</div><div class="kpi-val">${kpis.cpk?.toFixed(3) ?? "—"}</div></div>
      <div class="kpi"><div class="kpi-label">Points HC</div><div class="kpi-val">${kpis.pointsHC ?? "—"}</div></div>
      <div class="kpi"><div class="kpi-label">Moyenne</div><div class="kpi-val">${kpis.mean?.toFixed(4) ?? "—"}</div></div>
      <div class="kpi"><div class="kpi-label">Sigma</div><div class="kpi-val">${kpis.sigma?.toFixed(4) ?? "—"}</div></div>
      <div class="kpi"><div class="kpi-label">PPM estimés</div><div class="kpi-val">${kpis.ppm?.toLocaleString("fr-FR") ?? "—"}</div></div>
    </div>`;
  }

  // ── Pareto ──
  if (inc.pareto) {
    const pareto = APP.paretoResult;
    const rows = pareto
      ? pareto.rows.map(r =>
          `<tr>
            <td>${r.cause}</td>
            <td style="text-align:right">${r.freq}</td>
            <td style="text-align:right">${r.pct.toFixed(1)}%</td>
            <td style="text-align:right;font-weight:600">${r.cumul.toFixed(1)}%</td>
            <td style="text-align:center;font-weight:700;color:${r.classe==="A"?"#dc2626":r.classe==="B"?"#d97706":"#6b7280"}">${r.classe}</td>
          </tr>`).join("")
      : `<tr><td colspan="5" style="color:#9ca3af;font-style:italic">Aucun Pareto calculé — lancez l'analyse Pareto d'abord.</td></tr>`;
    sections += `<h2>Analyse de Pareto</h2>
    <p class="note">Total : ${pareto ? pareto.total + " défauts" : "—"}</p>
    <table><thead><tr><th>Cause</th><th>Fréq.</th><th>%</th><th>% Cumulé</th><th>Classe</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  }

  // ── SPC ──
  if (inc.spc) {
    const spc = APP.spcResult;
    const violations = spc
      ? [...(spc.chart1?.violations || []), ...(spc.chart2?.violations || [])]
      : [];
    const violRows = violations.length
      ? violations.map(v => `<tr><td>R${v.rule}</td><td>${v.label}</td></tr>`).join("")
      : `<tr><td colspan="2" style="color:#16a34a;font-weight:600">Aucune violation — procédé sous contrôle</td></tr>`;
    sections += `<h2>Cartes de contrôle SPC — ${spc ? spc.type.toUpperCase() : "—"}</h2>
    ${spc ? `<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="kpi"><div class="kpi-label">N points</div><div class="kpi-val">${spc.stats.n}</div></div>
      <div class="kpi"><div class="kpi-label">Moyenne</div><div class="kpi-val">${spc.stats.mean?.toFixed(4)}</div></div>
      <div class="kpi"><div class="kpi-label">UCL</div><div class="kpi-val" style="color:#dc2626">${(spc.stats.uclX??spc.stats.uclI??spc.stats.ucl??0).toFixed(4)}</div></div>
      <div class="kpi"><div class="kpi-label">LCL</div><div class="kpi-val" style="color:#dc2626">${(spc.stats.lclX??spc.stats.lclI??spc.stats.lcl??0).toFixed(4)}</div></div>
    </div>` : ""}
    <table><thead><tr><th>Règle</th><th>Violation détectée</th></tr></thead>
    <tbody>${violRows}</tbody></table>`;
  }

  // ── AMDEC ──
  if (inc.amdec) {
    const rows = APP.amdecRows.length
      ? APP.amdecRows.map(r =>
          `<tr>
            <td>${r.fonction || "—"}</td>
            <td>${r.mode || "—"}</td>
            <td>${r.effet || "—"}</td>
            <td>${r.cause || "—"}</td>
            <td style="text-align:center">${r.g}</td>
            <td style="text-align:center">${r.o}</td>
            <td style="text-align:center">${r.d}</td>
            <td style="text-align:center;font-weight:700;color:${r.rpn>=100?"#dc2626":r.rpn>=50?"#d97706":"#16a34a"}">${r.rpn}</td>
            <td>${r.rpn>=100?"CRITIQUE":r.rpn>=50?"MAJEUR":"MINEUR"}</td>
            <td>${r.action || "—"}</td>
          </tr>`).join("")
      : `<tr><td colspan="10" style="color:#9ca3af;font-style:italic">Aucune AMDEC saisie.</td></tr>`;
    sections += `<h2>Tableau AMDEC (${APP.amdecRows.length} mode(s))</h2>
    <table style="font-size:11px">
      <thead><tr><th>Fonction</th><th>Mode</th><th>Effet</th><th>Cause</th><th>G</th><th>O</th><th>D</th><th>RPN</th><th>Criticité</th><th>Action</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }

  // ── Ishikawa ──
  if (inc.ishi) {
    const cats = ["methode","machine","matiere","main-oeuvre","milieu","mesure"];
    const labels = { methode:"Méthode", machine:"Machine", matiere:"Matière", "main-oeuvre":"Main d'œuvre", milieu:"Milieu", mesure:"Mesure" };
    let ishiRows = "";
    cats.forEach(cat => {
      const el = document.getElementById("causes-" + cat);
      const causes = el ? Array.from(el.querySelectorAll(".ishi-cause-tag span")).map(s => s.textContent) : [];
      if (causes.length) {
        ishiRows += `<tr><td style="font-weight:600">${labels[cat]}</td><td>${causes.join(" · ")}</td></tr>`;
      }
    });
    const effect = document.getElementById("ishi-effect")?.value || "—";
    sections += `<h2>Diagramme d'Ishikawa — ${effect}</h2>
    <table><thead><tr><th>Catégorie</th><th>Causes identifiées</th></tr></thead>
    <tbody>${ishiRows || '<tr><td colspan="2" style="color:#9ca3af;font-style:italic">Aucune cause saisie.</td></tr>'}</tbody></table>`;
  }

  // ── Analyse IA ──
  if (inc.ia) {
    const iaContent = document.getElementById("ia-content")?.innerText?.trim();
    sections += `<h2>Analyse IA — Gemini</h2>
    <div class="ia-block">${iaContent
      ? iaContent.replace(/\n/g, "<br>")
      : "<em style='color:#9ca3af'>Aucune analyse IA effectuée — lancez l'analyse depuis l'onglet IA d'abord.</em>"
    }</div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<title>Rapport QHSE — ${info.entreprise}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:32px;max-width:960px;margin:auto}
  h1{font-size:22px;border-bottom:3px solid #39d0d8;padding-bottom:10px;margin-bottom:6px}
  h2{font-size:14px;font-weight:700;margin:28px 0 10px;border-left:4px solid #39d0d8;padding-left:10px;color:#1c2b3a}
  .meta{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;background:#f6f8fa;border-radius:8px;padding:16px;margin:16px 0}
  .meta-item .lbl{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em}
  .meta-item .val{font-weight:700;font-size:14px;margin-top:2px}
  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}
  .kpi{background:#f6f8fa;border-radius:8px;padding:10px;text-align:center}
  .kpi-label{font-size:10px;color:#6b7280;text-transform:uppercase}
  .kpi-val{font-size:18px;font-weight:700;margin-top:3px}
  .note{font-size:12px;color:#6b7280;margin-bottom:8px}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  th{background:#1c2b3a;color:#e6edf3;font-size:11px;padding:7px 10px;text-align:left;white-space:nowrap}
  td{padding:6px 10px;border-bottom:1px solid #e5e7eb}
  tr:nth-child(even) td{background:#f9fafb}
  .ia-block{background:#f6f8fa;border-radius:8px;padding:14px;font-size:12px;line-height:1.7;white-space:pre-wrap}
  .footer{margin-top:48px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center}
  @media print{body{padding:16px} h2{break-before:avoid}}
</style></head><body>
<h1>Rapport Qualité QHSE</h1>
<div class="meta">
  <div class="meta-item"><div class="lbl">Entreprise</div><div class="val">${info.entreprise}</div></div>
  <div class="meta-item"><div class="lbl">Référence</div><div class="val">${info.ref}</div></div>
  <div class="meta-item"><div class="lbl">Période</div><div class="val">${info.periode}</div></div>
  <div class="meta-item"><div class="lbl">Analyste</div><div class="val">${info.analyste}</div></div>
</div>
${sections}
<div class="footer">Généré par QHSE Analyzer Pro v2.0 &nbsp;·&nbsp; ${new Date().toLocaleDateString("fr-FR")}</div>
</body></html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "Rapport_QHSE_" + info.entreprise.replace(/\s+/g, "_") + "_" + new Date().toISOString().slice(0,10) + ".html";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast("Rapport HTML téléchargé", "success");
  logRapport("Rapport HTML généré (" + Object.values(inc).filter(Boolean).length + " sections)", "success");
}

function logRapport(msg, type) {
  const el = document.getElementById("log-rapport");
  if (!el) return;
  const e = document.createElement("div");
  e.className = `log-entry ${type}`;
  e.innerHTML = `<span class="log-ts">${new Date().toLocaleTimeString("fr-FR")}</span>${msg}`;
  el.appendChild(e);
  el.scrollTop = el.scrollHeight;
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────
function destroyChart(id) {
  if (APP.charts[id]) { APP.charts[id].destroy(); delete APP.charts[id]; }
}

function toast(message, type = "info", duration = 3500) {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${{success:"✅",error:"❌",info:"ℹ️",warn:"⚠️"}[type]||"ℹ️"}</span><span>${message}</span>`;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => {
    el.style.transition = "all 0.3s ease";
    el.style.opacity    = "0";
    el.style.transform  = "translateX(20px)";
    setTimeout(() => el.remove(), 300);
  }, duration);
}

function log(message, type = "info") {
  const el = document.getElementById("log-data");
  if (!el) return;
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="log-ts">${new Date().toLocaleTimeString("fr-FR")}</span>${message}`;
  el.appendChild(entry);
  el.scrollTop = el.scrollHeight;
}

function setBtnLoading(id, loading, label) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading ? `<span class="spinner"></span> ${label}` : label;
}

function setStatus(msg) {
  const el = document.getElementById("footer-status");
  if (el) el.textContent = msg;
}
