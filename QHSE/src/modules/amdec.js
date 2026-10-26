/**
 * ============================================================
 * amdec.js — AMDEC (Analyse des Modes de Défaillance, 
 *            de leurs Effets et de leur Criticité)
 * RPN = Gravité × Occurrence × Détection (1–10 chacun)
 * ============================================================
 */
"use strict";

const AMDECModule = (() => {

  let _rows = [];
  let _rowCounter = 0;

  // Seuils de criticité RPN
  const CRITICITE = {
    critical: { min: 200, label: "CRITIQUE",  badge: "badge-red",  color: "#FF4D6D" },
    high:     { min: 100, label: "ÉLEVÉ",     badge: "badge-warn", color: "#FFB830" },
    medium:   { min: 50,  label: "MODÉRÉ",    badge: "badge",      color: "#FFD600" },
    low:      { min: 0,   label: "FAIBLE",    badge: "badge-green",color: "#00E676" },
  };

  function getCriticite(rpn) {
    if (rpn >= 200) return CRITICITE.critical;
    if (rpn >= 100) return CRITICITE.high;
    if (rpn >= 50)  return CRITICITE.medium;
    return CRITICITE.low;
  }

  /**
   * Ajoute une ligne vide dans la table AMDEC.
   */
  function addRow(composant = "", mode = "", effet = "", G = 5, O = 5, D = 5) {
    const id = ++_rowCounter;
    _rows.push({ id, composant, mode, effet, G, O, D, rpn: G * O * D });
    renderTable();
    return id;
  }

  /**
   * Supprime une ligne.
   */
  function removeRow(id) {
    _rows = _rows.filter(r => r.id !== id);
    renderTable();
  }

  /**
   * Recalcule tous les RPN depuis les inputs.
   */
  function recalcAll() {
    const tbody = document.getElementById("amdec-tbody");
    if (!tbody) return;

    _rows.forEach(row => {
      const trRow = tbody.querySelector(`tr[data-id="${row.id}"]`);
      if (!trRow) return;
      row.composant = trRow.querySelector(".amdec-composant")?.value || row.composant;
      row.mode      = trRow.querySelector(".amdec-mode")?.value      || row.mode;
      row.effet     = trRow.querySelector(".amdec-effet")?.value     || row.effet;
      row.G         = parseInt(trRow.querySelector(".amdec-G")?.value) || 1;
      row.O         = parseInt(trRow.querySelector(".amdec-O")?.value) || 1;
      row.D         = parseInt(trRow.querySelector(".amdec-D")?.value) || 1;
      row.rpn       = row.G * row.O * row.D;
    });

    // Trier par RPN décroissant
    _rows.sort((a, b) => b.rpn - a.rpn);
    renderTable();
    return _rows;
  }

  /**
   * Rend la table HTML.
   */
  function renderTable() {
    const tbody = document.getElementById("amdec-tbody");
    if (!tbody) return;

    tbody.innerHTML = _rows.map(row => {
      const crit = getCriticite(row.rpn);
      const rpnClass = row.rpn >= 200 ? "rpn-critical"
                     : row.rpn >= 100 ? "rpn-high"
                     : row.rpn >= 50  ? "rpn-medium" : "rpn-low";
      return `
        <tr data-id="${row.id}">
          <td><input class="amdec-composant" type="text"  value="${row.composant}" placeholder="Composant"/></td>
          <td><input class="amdec-mode"      type="text"  value="${row.mode}"      placeholder="Mode de défaillance"/></td>
          <td><input class="amdec-effet"     type="text"  value="${row.effet}"     placeholder="Effet"/></td>
          <td><input class="amdec-G" type="number" min="1" max="10" value="${row.G}" style="width:42px"/></td>
          <td><input class="amdec-O" type="number" min="1" max="10" value="${row.O}" style="width:42px"/></td>
          <td><input class="amdec-D" type="number" min="1" max="10" value="${row.D}" style="width:42px"/></td>
          <td style="font-family:var(--font-mono);font-weight:700" class="${rpnClass}">${row.rpn}</td>
          <td><span class="badge ${crit.badge}">${crit.label}</span></td>
          <td><button class="btn-del-row" onclick="AMDECModule.removeRow(${row.id})">✕</button></td>
        </tr>`;
    }).join("");
  }

  /**
   * Charge des données démo.
   */
  function loadDemo() {
    _rows = [];
    [
      { composant: "Vanne pneumatique V01",  mode: "Fuite interne",     effet: "Perte de pression",       G:7, O:4, D:3 },
      { composant: "Capteur température T1", mode: "Dérive calibration", effet: "Température hors tolérance",G:8, O:3, D:5 },
      { composant: "Moteur M03",             mode: "Surchauffe",         effet: "Arrêt production",         G:9, O:2, D:4 },
      { composant: "Convoyeur C02",          mode: "Bourrage",           effet: "Pièces non conformes",     G:6, O:6, D:3 },
      { composant: "Joint d'étanchéité J1",  mode: "Usure prématurée",   effet: "Contamination produit",    G:9, O:5, D:6 },
      { composant: "PLC principal",          mode: "Perte programme",    effet: "Arrêt ligne complète",     G:10,O:1, D:2 },
    ].forEach((r, i) => {
      _rows.push({ id: ++_rowCounter, ...r, rpn: r.G * r.O * r.D });
    });
    _rows.sort((a, b) => b.rpn - a.rpn);
    renderTable();
  }

  /**
   * Dessine le graphique cartographie des risques (bubble chart).
   */
  function drawRiskChart(canvasId, existingChart = null) {
    if (existingChart) existingChart.destroy();
    const ctx = document.getElementById(canvasId);
    if (!ctx || !_rows.length) return null;

    const data = _rows.map(r => ({
      x:     r.O,                        // Occurrence (axe X)
      y:     r.G,                        // Gravité (axe Y)
      r:     Math.max(5, r.rpn / 15),    // Taille bulle = RPN
      label: r.composant,
      rpn:   r.rpn,
    }));

    const colors = data.map(d => {
      const c = getCriticite(d.rpn);
      return c.color + "AA";
    });

    return new Chart(ctx, {
      type: "bubble",
      data: {
        datasets: [{
          label:           "Modes de défaillance",
          data,
          backgroundColor: colors,
          borderColor:     colors.map(c => c.replace("AA","FF")),
          borderWidth:     1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.raw.label} — RPN: ${ctx.raw.rpn} (G:${ctx.raw.y} O:${ctx.raw.x})`,
            },
          },
        },
        scales: {
          x: {
            min: 0, max: 11,
            title: { display: true, text: "Occurrence →", color: "#8BA8C8", font: { size: 9 } },
            ticks: { color: "#8BA8C8", font: { size: 9 } },
            grid:  { color: "rgba(255,255,255,0.04)" },
          },
          y: {
            min: 0, max: 11,
            title: { display: true, text: "Gravité →", color: "#8BA8C8", font: { size: 9 } },
            ticks: { color: "#8BA8C8", font: { size: 9 } },
            grid:  { color: "rgba(255,255,255,0.04)" },
          },
        },
      },
    });
  }

  /**
   * Prépare les données pour l'export Excel.
   */
  function toExcelData() {
    const headers = ["Composant","Mode de défaillance","Effet","Gravité (G)",
                     "Occurrence (O)","Détection (D)","RPN","Criticité"];
    const rows = _rows.map(r => [
      r.composant, r.mode, r.effet, r.G, r.O, r.D, r.rpn, getCriticite(r.rpn).label
    ]);
    return { headers, rows };
  }

  function getRows()    { return [..._rows]; }
  function clearRows()  { _rows = []; _rowCounter = 0; renderTable(); }

  return { addRow, removeRow, recalcAll, renderTable, loadDemo, drawRiskChart, toExcelData, getRows, clearRows, getCriticite };

})();

window.AMDECModule = AMDECModule;
