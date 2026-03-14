/**
 * ============================================================
 * capability.js — Module de capabilité procédé
 * Cp, Cpk, Pp, Ppk, DPMO, Niveau Sigma, SPC Gauge
 * Conformité ISO 9001 / IATF 16949 / Six Sigma
 * ============================================================
 */
"use strict";

const CapabilityModule = (() => {

  // ─── Calcul complet ───────────────────────────────────────────────

  /**
   * @param {number[]} data  - Mesures individuelles
   * @param {number}   usl   - Limite supérieure de spécification
   * @param {number}   lsl   - Limite inférieure de spécification
   * @param {number}   [target] - Valeur cible (optionnel)
   */
  function compute(data, usl, lsl, target = null) {
    const clean = data.filter(v => isFinite(v));
    if (clean.length < 5) throw new Error("Minimum 5 mesures requises pour la capabilité");
    if (usl <= lsl)       throw new Error("USL doit être supérieure à LSL");

    const n    = clean.length;
    const mu   = Statistics.mean(clean);
    const s    = Statistics.stdDev(clean);          // σ estimé (echantillon)
    const tol  = usl - lsl;                         // Tolérance totale

    // ── Indices de capabilité potentielle (Cp, Cpl, Cpu) ──────────
    const cp  = tol / (6 * s);                      // Capabilité potentielle
    const cpl = (mu - lsl) / (3 * s);               // Cpk inférieur
    const cpu = (usl - mu) / (3 * s);               // Cpk supérieur
    const cpk = Math.min(cpl, cpu);                 // Capabilité réelle

    // ── Indices de performance (Pp, Ppk) ─── σ global ─────────────
    // Pour simplifier, on utilise le même σ (données individuelles)
    const pp  = cp;
    const ppk = cpk;

    // ── Cpm (Taguchi — centrée sur la cible) ──────────────────────
    let cpm = null;
    if (target !== null) {
      const tau = Math.sqrt(s * s + (mu - target) ** 2);
      cpm = tol / (6 * tau);
    }

    // ── Défauts (DPMO / ppm) ──────────────────────────────────────
    const zUpper    = (usl - mu) / s;
    const zLower    = (mu - lsl) / s;
    const pncUpper  = 1 - Statistics.normalCDF(zUpper);
    const pncLower  = Statistics.normalCDF(-zLower);
    const ppmTotal  = +(( pncUpper + pncLower) * 1_000_000).toFixed(0);
    const dpmo      = ppmTotal;                      // équivalent pour mesures continues
    const yieldPct  = +((1 - (pncUpper + pncLower)) * 100).toFixed(3);

    // ── Niveau sigma (convention industrie : +1.5σ shift) ─────────
    const sigmaLevel = computeSigmaLevel(dpmo);

    // ── Verdict qualité ───────────────────────────────────────────
    const verdict = getVerdict(cpk);

    // ── Recommandation ciblage ────────────────────────────────────
    const bias = +((mu - (usl + lsl) / 2)).toFixed(4); // Biais par rapport au centre
    const recommendation = buildRecommendation(cpk, cp, bias, tol, s);

    return {
      // Données d'entrée
      n, usl, lsl, target,
      // Statistiques
      mean:   +mu.toFixed(6),
      std:    +s.toFixed(6),
      min:    +Math.min(...clean).toFixed(4),
      max:    +Math.max(...clean).toFixed(4),
      bias,
      // Indices
      cp:     +cp.toFixed(3),
      cpk:    +cpk.toFixed(3),
      cpl:    +cpl.toFixed(3),
      cpu:    +cpu.toFixed(3),
      pp:     +pp.toFixed(3),
      ppk:    +ppk.toFixed(3),
      cpm:    cpm !== null ? +cpm.toFixed(3) : null,
      // Défauts
      dpmo,
      ppmTotal,
      yieldPct,
      // Sigma
      sigmaLevel: +sigmaLevel.toFixed(2),
      // Verdict
      verdict,
      recommendation,
    };
  }

  // ─── Niveau sigma depuis DPMO ─────────────────────────────────────

  function computeSigmaLevel(dpmo) {
    // Tableau DPMO → Niveau sigma (interpolation)
    const table = [
      { dpmo: 3.4,      sigma: 6.0 },
      { dpmo: 233,      sigma: 5.0 },
      { dpmo: 6210,     sigma: 4.0 },
      { dpmo: 66807,    sigma: 3.0 },
      { dpmo: 308537,   sigma: 2.0 },
      { dpmo: 691462,   sigma: 1.0 },
      { dpmo: 933193,   sigma: 0.5 },
    ];
    for (let i = 0; i < table.length - 1; i++) {
      if (dpmo <= table[i].dpmo)    return table[i].sigma;
      if (dpmo <= table[i+1].dpmo) {
        const t = (dpmo - table[i].dpmo) / (table[i+1].dpmo - table[i].dpmo);
        return table[i].sigma + t * (table[i+1].sigma - table[i].sigma);
      }
    }
    return Math.max(0, 1.5 + Statistics.normalCDF(1 - dpmo / 1_000_000) * 3);
  }

  // ─── Verdict ──────────────────────────────────────────────────────

  function getVerdict(cpk) {
    if (cpk >= 1.67) return { label: "Excellent",    color: "#00E676", icon: "✦", class: "ok" };
    if (cpk >= 1.33) return { label: "Capable",      color: "#00E676", icon: "✓", class: "ok" };
    if (cpk >= 1.00) return { label: "Limite",       color: "#FFB830", icon: "⚠", class: "warn" };
    if (cpk >= 0.67) return { label: "Non capable",  color: "#FF4D6D", icon: "✗", class: "error" };
    return               { label: "Très dégradé",  color: "#FF4D6D", icon: "✗", class: "error" };
  }

  // ─── Recommandation automatique ──────────────────────────────────

  function buildRecommendation(cpk, cp, bias, tol, s) {
    const recs = [];

    if (cpk < 1.33 && cp >= 1.33) {
      // Capabilité potentielle suffisante mais décentrage
      recs.push({
        type:    "centrage",
        priorite:"haute",
        texte:   `Le procédé est décentré de ${Math.abs(bias).toFixed(4)} unités. ` +
                 `Recentrer le procédé permettrait d'atteindre Cpk = ${cp.toFixed(3)}.`,
        gain:    `Cpk actuel : ${cpk.toFixed(3)} → potentiel : ${cp.toFixed(3)}`,
      });
    }

    if (cp < 1.33) {
      // Dispersion trop grande
      const sigmaTarget = tol / (6 * 1.33);
      const reductionPct = Math.round((1 - sigmaTarget / s) * 100);
      recs.push({
        type:    "dispersion",
        priorite:"haute",
        texte:   `La dispersion est trop élevée (σ = ${s.toFixed(4)}). ` +
                 `Réduire σ de ${reductionPct}% pour atteindre Cp = 1.33.`,
        gain:    `Objectif σ ≤ ${sigmaTarget.toFixed(4)}`,
      });
    }

    if (cpk >= 1.33 && cpk < 1.67) {
      recs.push({
        type:    "optimisation",
        priorite:"faible",
        texte:   `Procédé capable mais optimisable. Objectif Six Sigma : Cpk ≥ 1.67.`,
        gain:    `Réduire σ de 20% pour atteindre Cpk = 1.67`,
      });
    }

    if (recs.length === 0) {
      recs.push({
        type:    "surveillance",
        priorite:"info",
        texte:   `Procédé excellent. Maintenir le plan de surveillance actuel (cartes SPC).`,
        gain:    "Maintenir les performances",
      });
    }

    return recs;
  }

  // ─── Dessin de la jauge de capabilité ────────────────────────────

  /**
   * Dessine une jauge visuelle du Cpk sur un canvas.
   */
  function drawGauge(canvasId, capResult) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H * 0.62, r = Math.min(W, H) * 0.38;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#111B2E";
    ctx.fillRect(0, 0, W, H);

    // Arcs de couleur (demi-cercle)
    const zones = [
      { from: Math.PI,     to: Math.PI*1.3,  color: "#FF4D6D" },  // < 1.00
      { from: Math.PI*1.3, to: Math.PI*1.55, color: "#FFB830" },  // 1.00–1.33
      { from: Math.PI*1.55,to: Math.PI*1.75, color: "#FFD600" },  // 1.33–1.50
      { from: Math.PI*1.75,to: Math.PI*2,    color: "#00E676" },  // ≥ 1.67
    ];

    zones.forEach(z => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, z.from, z.to);
      ctx.strokeStyle = z.color;
      ctx.lineWidth   = 16;
      ctx.lineCap     = "butt";
      ctx.stroke();
    });

    // Fond arc (couche de base plus fine)
    ctx.beginPath();
    ctx.arc(cx, cy, r - 10, Math.PI, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth   = 1;
    ctx.stroke();

    // Aiguille
    const cpkClamped = Math.min(2, Math.max(0, capResult.cpk));
    const angle = Math.PI + (cpkClamped / 2) * Math.PI;
    const nx = cx + (r - 25) * Math.cos(angle);
    const ny = cy + (r - 25) * Math.sin(angle);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = "#E8F0FE";
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    ctx.stroke();

    // Centre aiguille
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#E8F0FE";
    ctx.fill();

    // Valeur Cpk
    ctx.font         = "bold 20px 'IBM Plex Mono', monospace";
    ctx.fillStyle    = capResult.verdict.color;
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(capResult.cpk.toFixed(3), cx, cy + r * 0.35);

    ctx.font      = "11px 'IBM Plex Sans', sans-serif";
    ctx.fillStyle = "#8BA8C8";
    ctx.fillText("Cpk", cx, cy + r * 0.35 + 22);

    // Labels
    ctx.font      = "9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = "#4A6580";
    ctx.fillText("0",    cx - r - 8, cy + 6);
    ctx.fillText("1.0",  cx - r * 0.3, cy - r * 0.8);
    ctx.fillText("1.33", cx + r * 0.1, cy - r * 0.95);
    ctx.fillText("2.0",  cx + r + 2,   cy + 6);
  }

  // ─── Rendu UI de la section capabilité ───────────────────────────

  function renderCapabilityCard(capResult, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const v = capResult.verdict;
    el.innerHTML = `
      <div class="card-title">Indices de capabilité
        <span class="badge badge-${v.class === "ok" ? "green" : v.class === "warn" ? "warn" : "red"}">
          ${v.icon} ${v.label}
        </span>
      </div>

      <div class="kpi-row" style="grid-template-columns:repeat(4,1fr)">
        ${[["Cp",  capResult.cp],  ["Cpk", capResult.cpk],
           ["Cpl", capResult.cpl], ["Cpu", capResult.cpu]].map(([label, val]) => `
          <div class="kpi-card">
            <div class="kpi-label">${label}</div>
            <div class="kpi-value" style="font-size:14px;color:${val >= 1.33 ? "var(--accent-green)" : val >= 1.0 ? "var(--accent-amber)" : "var(--accent-red)"}">${val}</div>
          </div>`).join("")}
      </div>

      <div class="kpi-row" style="grid-template-columns:repeat(3,1fr);margin-top:6px">
        <div class="kpi-card"><div class="kpi-label">Niveau σ</div>
          <div class="kpi-value" style="font-size:14px">${capResult.sigmaLevel}</div><div class="kpi-unit">sigma</div></div>
        <div class="kpi-card"><div class="kpi-label">DPMO</div>
          <div class="kpi-value" style="font-size:12px;color:${capResult.dpmo > 6210 ? "var(--accent-red)" : "var(--accent-green)"}">
            ${capResult.dpmo.toLocaleString("fr-FR")}</div><div class="kpi-unit">défauts/M</div></div>
        <div class="kpi-card"><div class="kpi-label">Rendement</div>
          <div class="kpi-value" style="font-size:14px">${capResult.yieldPct}%</div><div class="kpi-unit">yield</div></div>
      </div>

      ${capResult.recommendation.map(r => `
        <div class="diag-item ${r.class || (r.priorite === "haute" ? "error" : r.priorite === "faible" ? "ok" : "warn")}" style="margin-top:5px">
          <span style="min-width:50px;font-size:9px;font-weight:700;text-transform:uppercase">${r.priorite}</span>
          <div><div style="font-size:11px">${r.texte}</div>
            <div style="font-size:10px;color:var(--accent-cyan);margin-top:2px">→ ${r.gain}</div>
          </div>
        </div>`).join("")}`;
  }

  // ─── Export Excel de la capabilité ───────────────────────────────

  function toExcelData(capResult) {
    return {
      headers: ["Paramètre", "Valeur", "Interprétation"],
      rows: [
        ["N mesures",           capResult.n,                "—"],
        ["Moyenne (x̄)",         capResult.mean,             "—"],
        ["Écart-type (σ)",       capResult.std,              "—"],
        ["USL",                  capResult.usl,              "Limite supérieure"],
        ["LSL",                  capResult.lsl,              "Limite inférieure"],
        ["Cp",                   capResult.cp,               capResult.cp >= 1.33 ? "Capable" : "Non capable"],
        ["Cpk",                  capResult.cpk,              capResult.verdict.label],
        ["Cpl (inférieur)",      capResult.cpl,              "—"],
        ["Cpu (supérieur)",      capResult.cpu,              "—"],
        ["Cpm (Taguchi)",        capResult.cpm ?? "—",       capResult.cpm ? "Avec cible" : "Sans cible"],
        ["Niveau Sigma",         capResult.sigmaLevel,       "Sigma"],
        ["DPMO",                 capResult.dpmo,             "Défauts par million"],
        ["Rendement (%)",        capResult.yieldPct,         "%"],
        ["Biais (centrage)",     capResult.bias,             capResult.bias === 0 ? "Centré" : "Décentré"],
      ],
    };
  }

  return { compute, drawGauge, renderCapabilityCard, toExcelData, getVerdict, computeSigmaLevel };

})();

window.CapabilityModule = CapabilityModule;
