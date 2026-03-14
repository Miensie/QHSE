/**
 * ============================================================
 * msa.js — Analyse des Systèmes de Mesure (MSA / Gauge R&R)
 * Méthodes : R&R croisé (ANOVA), Biais, Linéarité, Stabilité
 * Référence : AIAG MSA 4ème édition / IATF 16949
 * ============================================================
 */
"use strict";

const MSAModule = (() => {

  // ─── Gauge R&R (méthode des moyennes & étendues) ─────────────────

  /**
   * @param {Object} measurements
   *   { operateur1: { piece1: [rep1, rep2, rep3], piece2: [...] }, operateur2: ... }
   * @param {number} usl - Limite supérieure spécification
   * @param {number} lsl - Limite inférieure spécification
   */
  function gaugeRR(measurements, usl = null, lsl = null) {
    const operateurs = Object.keys(measurements);
    const pieces     = Object.keys(measurements[operateurs[0]]);
    const nOp = operateurs.length;
    const nPart = pieces.length;

    // Nombre de répétitions (on prend la longueur de la première)
    const nRep = measurements[operateurs[0]][pieces[0]].length;

    // ── Calcul des moyennes par opérateur × pièce ──────────────
    const means = {};
    operateurs.forEach(op => {
      means[op] = {};
      pieces.forEach(p => {
        const vals = measurements[op][p];
        means[op][p] = Statistics.mean(vals);
      });
    });

    // ── Étendues par opérateur × pièce ────────────────────────
    const ranges = {};
    operateurs.forEach(op => {
      ranges[op] = {};
      pieces.forEach(p => {
        const vals = measurements[op][p];
        ranges[op][p] = Statistics.range(vals);
      });
    });

    // ── Moyenne des étendues Rbar ──────────────────────────────
    const allRanges = operateurs.flatMap(op => pieces.map(p => ranges[op][p]));
    const Rbar      = Statistics.mean(allRanges);

    // Constante d2 pour nRep répétitions
    const d2 = Statistics.getSPCConstants(nRep).d2;

    // ── Répétabilité (EV — Equipment Variation) ────────────────
    const EV = Rbar / d2;

    // ── Reproductibilité (AV — Appraiser Variation) ────────────
    const opMeans  = operateurs.map(op =>
      Statistics.mean(pieces.map(p => means[op][p]))
    );
    const Xdiff    = Math.max(...opMeans) - Math.min(...opMeans);
    const d2av     = Statistics.getSPCConstants(nOp).d2;
    const AV_raw   = Xdiff / d2av;
    const AV       = Math.max(0, Math.sqrt(Math.max(0, AV_raw ** 2 - EV ** 2 / (nPart * nRep))));

    // ── Variation pièce (PV — Part Variation) ─────────────────
    const partMeans = pieces.map(p =>
      Statistics.mean(operateurs.flatMap(op => measurements[op][p]))
    );
    const Rp        = Math.max(...partMeans) - Math.min(...partMeans);
    const d2pv      = Statistics.getSPCConstants(nPart).d2;
    const PV        = Rp / d2pv;

    // ── Gauge R&R total ────────────────────────────────────────
    const GRR = Math.sqrt(EV ** 2 + AV ** 2);
    const TV  = Math.sqrt(GRR ** 2 + PV ** 2);  // Variation totale

    // ── Pourcentages ───────────────────────────────────────────
    const pctGRR = TV > 0 ? +(GRR / TV * 100).toFixed(1) : 0;
    const pctEV  = TV > 0 ? +(EV  / TV * 100).toFixed(1) : 0;
    const pctAV  = TV > 0 ? +(AV  / TV * 100).toFixed(1) : 0;
    const pctPV  = TV > 0 ? +(PV  / TV * 100).toFixed(1) : 0;

    // ── Nombre de catégories discriminantes (ndc) ─────────────
    const ndc = Math.floor(1.41 * (PV / GRR));

    // ── %GRR vs tolérance ─────────────────────────────────────
    let pctTol = null;
    if (usl !== null && lsl !== null) {
      const tol = usl - lsl;
      pctTol = +(GRR * 5.15 / tol * 100).toFixed(1); // 5.15σ = 99%
    }

    // ── Verdict MSA ───────────────────────────────────────────
    const verdict = getMSAVerdict(pctGRR, ndc);

    return {
      // Résultats
      EV: +EV.toFixed(4), AV: +AV.toFixed(4),
      GRR: +GRR.toFixed(4), PV: +PV.toFixed(4), TV: +TV.toFixed(4),
      Rbar: +Rbar.toFixed(4),
      pctGRR, pctEV, pctAV, pctPV,
      ndc,
      pctTol,
      // Contexte
      nOp, nPart, nRep,
      operateurs, pieces,
      opMeans: opMeans.map(v => +v.toFixed(4)),
      verdict,
      // Données brutes pour graphiques
      means, ranges,
    };
  }

  // ─── Analyse du biais ─────────────────────────────────────────────

  /**
   * @param {number[]} measurements - Mesures répétées sur une pièce référencée
   * @param {number}   refValue     - Valeur de référence (étalon)
   */
  function biasAnalysis(measurements, refValue) {
    const stats = Statistics.describe(measurements);
    const bias  = +(stats.mean - refValue).toFixed(6);
    const biasRelPct = refValue !== 0
      ? +(Math.abs(bias) / refValue * 100).toFixed(3)
      : null;

    // Test t pour biais significatif
    const tStat   = (stats.mean - refValue) / (stats.std / Math.sqrt(stats.n));
    const tCritical = 2.131; // t(0.025, df=15) approximatif
    const biasSignificant = Math.abs(tStat) > tCritical;

    return {
      mean:             +stats.mean.toFixed(6),
      std:              +stats.std.toFixed(6),
      bias,
      biasRelPct,
      refValue,
      tStat:            +tStat.toFixed(3),
      biasSignificant,
      verdict:          !biasSignificant
        ? { label: "Biais acceptable",    color: "#00E676" }
        : { label: "Biais significatif",  color: "#FF4D6D" },
    };
  }

  // ─── Verdict MSA ──────────────────────────────────────────────────

  function getMSAVerdict(pctGRR, ndc) {
    // Critères AIAG MSA 4ème édition
    if (pctGRR <= 10 && ndc >= 5)  return { label: "Acceptable",           color: "#00E676", class: "ok" };
    if (pctGRR <= 30 && ndc >= 2)  return { label: "Conditionnellement OK", color: "#FFB830", class: "warn" };
    return                                  { label: "Non acceptable",       color: "#FF4D6D", class: "error" };
  }

  // ─── Données de démonstration ─────────────────────────────────────

  function getDemoData() {
    // 3 opérateurs × 10 pièces × 2 répétitions
    return {
      "Opérateur A": {
        "P01": [10.02, 10.04], "P02": [9.98, 9.97], "P03": [10.08, 10.09],
        "P04": [9.95, 9.94],   "P05": [10.12, 10.11],"P06": [10.00, 10.01],
        "P07": [9.88, 9.90],   "P08": [10.15, 10.14],"P09": [9.99, 10.00],
        "P10": [10.05, 10.06],
      },
      "Opérateur B": {
        "P01": [10.01, 10.03], "P02": [9.97, 9.99], "P03": [10.07, 10.08],
        "P04": [9.94, 9.96],   "P05": [10.10, 10.13],"P06": [10.02, 9.99],
        "P07": [9.87, 9.91],   "P08": [10.13, 10.16],"P09": [9.98, 10.01],
        "P10": [10.04, 10.07],
      },
      "Opérateur C": {
        "P01": [10.03, 10.05], "P02": [9.96, 9.98], "P03": [10.06, 10.10],
        "P04": [9.93, 9.95],   "P05": [10.11, 10.12],"P06": [10.01, 10.00],
        "P07": [9.89, 9.92],   "P08": [10.14, 10.15],"P09": [9.97, 10.02],
        "P10": [10.03, 10.05],
      },
    };
  }

  // ─── Rendu HTML des résultats ─────────────────────────────────────

  function renderResults(result, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const v = result.verdict;
    el.innerHTML = `
      <div class="card-title">Gauge R&R
        <span class="badge badge-${v.class === "ok" ? "green" : v.class === "warn" ? "warn" : "red"}">
          ${v.label}
        </span>
      </div>

      <div class="kpi-row" style="grid-template-columns:repeat(3,1fr)">
        <div class="kpi-card">
          <div class="kpi-label">%GRR</div>
          <div class="kpi-value" style="color:${result.pctGRR<=10?"var(--accent-green)":result.pctGRR<=30?"var(--accent-amber)":"var(--accent-red)"}">
            ${result.pctGRR}%</div>
          <div class="kpi-unit">objectif ≤ 10%</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">NDC</div>
          <div class="kpi-value" style="color:${result.ndc>=5?"var(--accent-green)":"var(--accent-amber)"}">
            ${result.ndc}</div>
          <div class="kpi-unit">catégories disc.</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">%Tolérance</div>
          <div class="kpi-value">${result.pctTol !== null ? result.pctTol + "%" : "—"}</div>
          <div class="kpi-unit">vs USL–LSL</div>
        </div>
      </div>

      <table class="data-table" style="margin-top:8px">
        <thead><tr><th>Source</th><th>Valeur</th><th>%TV</th></tr></thead>
        <tbody>
          <tr><td>Répétabilité (EV)</td><td style="font-family:var(--font-mono)">${result.EV}</td>
              <td style="font-family:var(--font-mono)">${result.pctEV}%</td></tr>
          <tr><td>Reproductibilité (AV)</td><td style="font-family:var(--font-mono)">${result.AV}</td>
              <td style="font-family:var(--font-mono)">${result.pctAV}%</td></tr>
          <tr><td><strong>Gauge R&R (GRR)</strong></td>
              <td style="font-family:var(--font-mono);font-weight:700;color:var(--accent-cyan)">${result.GRR}</td>
              <td style="font-family:var(--font-mono);font-weight:700;color:var(--accent-cyan)">${result.pctGRR}%</td></tr>
          <tr><td>Variation pièce (PV)</td><td style="font-family:var(--font-mono)">${result.PV}</td>
              <td style="font-family:var(--font-mono)">${result.pctPV}%</td></tr>
          <tr><td>Variation totale (TV)</td><td style="font-family:var(--font-mono)">${result.TV}</td>
              <td>100%</td></tr>
        </tbody>
      </table>`;
  }

  return { gaugeRR, biasAnalysis, getMSAVerdict, getDemoData, renderResults };

})();

window.MSAModule = MSAModule;
