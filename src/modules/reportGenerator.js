/**
 * ============================================================
 * reportGenerator.js — Rapport qualité HTML complet
 * Inclut : SPC, Capabilité, Pareto, AMDEC, MSA, IA
 * Design : impression + écran, compatible A4
 * ============================================================
 */
"use strict";

const ReportGenerator = (() => {

  // ─── Génération du rapport complet ───────────────────────────────

  function generate(params = {}) {
    const {
      entreprise = "—", process = "—",
      stats      = null,
      spcResult  = null,
      capResult  = null,
      paretoData = null,
      amdecRows  = [],
      msaResult  = null,
      testResult = null,
      iaAnalysis = null,
      date       = new Date().toLocaleDateString("fr-FR"),
    } = params;

    const ooc         = spcResult?.chart1?.ooc?.count ?? null;
    const statusOK    = ooc === 0;
    const statusColor = ooc === null ? "#8BA8C8" : statusOK ? "#00E676" : "#FF4D6D";
    const statusLabel = ooc === null ? "NON ÉVALUÉ" : statusOK ? "✓ SOUS CONTRÔLE" : "✗ HORS CONTRÔLE";

    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Rapport Qualité — ${entreprise}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@300;400;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0B1220;--bg2:#111B2E;--card:#162035;
  --cyan:#00D4FF;--amber:#FFB830;--green:#00E676;--red:#FF4D6D;--purple:#B388FF;
  --text:#E8F0FE;--muted:#8BA8C8;--dim:#4A6580;
  --border:rgba(0,212,255,.14);
  --mono:'IBM Plex Mono',monospace;
  --sans:'IBM Plex Sans',sans-serif;
}
html{font-family:var(--sans);background:var(--bg);color:var(--text);font-size:12px;line-height:1.55}
body{max-width:960px;margin:0 auto;padding:28px 24px 48px}

/* Header */
.report-header{
  display:flex;justify-content:space-between;align-items:flex-start;
  padding-bottom:18px;border-bottom:2px solid rgba(0,212,255,.25);margin-bottom:28px
}
.brand{display:flex;align-items:center;gap:12px}
.brand-hex{font-size:32px;color:var(--cyan);filter:drop-shadow(0 0 10px rgba(0,212,255,.4))}
.brand-title{font-size:20px;font-weight:700;letter-spacing:.04em}
.brand-pro{color:var(--amber)}
.brand-meta{font-size:10px;color:var(--muted);margin-top:3px;font-family:var(--mono)}
.status-badge{
  padding:8px 18px;border-radius:6px;font-weight:700;font-size:13px;
  background:${statusColor}1A;border:1.5px solid ${statusColor};color:${statusColor};
  white-space:nowrap;align-self:center
}

/* Sections */
.section{margin-bottom:28px}
h2{
  font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.14em;
  color:var(--cyan);border-bottom:1px solid var(--border);
  padding-bottom:7px;margin-bottom:14px;
  display:flex;align-items:center;gap:8px
}
h2 .section-icon{font-size:14px}

/* Cards */
.card{
  background:var(--card);border:1px solid var(--border);
  border-radius:8px;padding:16px;margin-bottom:12px
}
.card-sm{padding:10px 14px}

/* KPI Grid */
.kpi-grid{display:grid;gap:8px;margin-bottom:14px}
.kpi-grid-4{grid-template-columns:repeat(4,1fr)}
.kpi-grid-3{grid-template-columns:repeat(3,1fr)}
.kpi-grid-2{grid-template-columns:repeat(2,1fr)}
.kpi{
  background:var(--bg2);border:1px solid var(--border);
  border-radius:6px;padding:12px 10px;text-align:center
}
.kpi-label{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--dim);margin-bottom:5px}
.kpi-val{font-family:var(--mono);font-size:17px;font-weight:600;color:var(--cyan);line-height:1}
.kpi-unit{font-size:8px;color:var(--dim);margin-top:4px;font-family:var(--mono)}

/* Tables */
table{width:100%;border-collapse:collapse;margin:6px 0}
th{
  background:rgba(0,212,255,.07);color:var(--cyan);
  font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;
  padding:7px 10px;text-align:left;border-bottom:1px solid rgba(0,212,255,.25)
}
td{
  padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.04);
  font-family:var(--mono);font-size:10px;vertical-align:middle
}
tr:hover td{background:rgba(0,212,255,.03)}
.td-right{text-align:right}
.td-center{text-align:center}

/* Badges */
.badge{
  display:inline-block;padding:2px 9px;border-radius:20px;
  font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.06em
}
.badge-green{background:rgba(0,230,118,.15);border:1px solid var(--green);color:var(--green)}
.badge-warn {background:rgba(255,184,48,.15);border:1px solid var(--amber);color:var(--amber)}
.badge-red  {background:rgba(255,77,109,.15);border:1px solid var(--red);  color:var(--red)}
.badge-cyan {background:rgba(0,212,255,.12); border:1px solid var(--cyan); color:var(--cyan)}

/* Diag items */
.diag{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:5px;
      border-left:3px solid;margin-bottom:5px;font-size:11px;line-height:1.45}
.diag.ok   {border-color:var(--green); background:rgba(0,230,118,.06)}
.diag.warn {border-color:var(--amber); background:rgba(255,184,48,.06)}
.diag.error{border-color:var(--red);   background:rgba(255,77,109,.06)}
.diag.info {border-color:var(--cyan);  background:rgba(0,212,255,.06)}
.diag-icon{font-size:13px;min-width:16px}

/* Capabilité gauge ASCII */
.cap-gauge{
  font-family:var(--mono);font-size:11px;text-align:center;
  padding:12px;background:var(--bg2);border-radius:6px;
  letter-spacing:.06em
}
.cap-bar{display:flex;align-items:center;gap:8px;justify-content:center;margin:6px 0}
.cap-segment{height:12px;border-radius:2px}

/* Actions */
.action-row{
  display:grid;grid-template-columns:70px 1fr auto;gap:10px;
  align-items:start;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.04)
}

/* Watermark / footer */
.report-footer{
  margin-top:36px;padding-top:12px;border-top:1px solid var(--border);
  display:flex;justify-content:space-between;align-items:center;
  color:var(--dim);font-size:10px
}
.footer-logo{font-weight:700;color:var(--cyan);font-family:var(--mono)}

/* Print */
@media print{
  html{background:#fff;color:#000;font-size:11px}
  body{padding:12px}
  :root{
    --bg:#fff;--bg2:#f4f6f8;--card:#f8f9fa;
    --cyan:#0056b3;--amber:#c47000;--green:#2e7d32;--red:#c62828;
    --text:#1a1a1a;--muted:#555;--dim:#888;
    --border:rgba(0,0,0,.12)
  }
  .status-badge{border-width:1px}
  .card{border-color:rgba(0,0,0,.1)}
  .report-header{page-break-after:avoid}
  .section{page-break-inside:avoid}
}
</style>
</head>
<body>

<!-- ══ HEADER ══════════════════════════════════════════════════════ -->
<div class="report-header">
  <div class="brand">
    <div class="brand-hex">⬡</div>
    <div>
      <div class="brand-title">QHSE Analyzer <span class="brand-pro">PRO</span></div>
      <div class="brand-meta">RAPPORT D'ANALYSE QUALITÉ &nbsp;·&nbsp; ${date}</div>
      <div class="brand-meta" style="margin-top:2px">
        Entreprise : <strong>${entreprise}</strong> &nbsp;·&nbsp;
        Procédé : <strong>${process}</strong>
      </div>
    </div>
  </div>
  <div class="status-badge">${statusLabel}</div>
</div>

${stats ? _sectionStats(stats) : ""}
${spcResult ? _sectionSPC(spcResult) : ""}
${capResult ? _sectionCapability(capResult) : ""}
${paretoData ? _sectionPareto(paretoData) : ""}
${amdecRows?.length ? _sectionAMDEC(amdecRows) : ""}
${msaResult ? _sectionMSA(msaResult) : ""}
${testResult ? _sectionTests(testResult) : ""}
${iaAnalysis ? _sectionIA(iaAnalysis) : ""}
${_sectionMethodology()}

<!-- ══ FOOTER ══════════════════════════════════════════════════════ -->
<div class="report-footer">
  <div><span class="footer-logo">⬡ QHSE Analyzer Pro v2.0</span></div>
  <div>ISO 9001:2015 &nbsp;·&nbsp; IATF 16949 &nbsp;·&nbsp; Six Sigma &nbsp;·&nbsp; Règles de Nelson</div>
  <div>Généré le ${date}</div>
</div>

</body></html>`;
  }

  // ─── Sections ─────────────────────────────────────────────────────

  function _sectionStats(s) {
    return `
<div class="section">
<h2><span class="section-icon">📊</span>Statistiques descriptives</h2>
<div class="card">
<div class="kpi-grid kpi-grid-4">
  ${_kpi("N mesures", s.n, "obs.")}
  ${_kpi("Moyenne x̄", s.mean, "")}
  ${_kpi("Écart-type σ", s.std, "")}
  ${_kpi("Étendue", s.range, "max−min")}
</div>
<div class="kpi-grid kpi-grid-4" style="margin-top:0">
  ${_kpi("Min", s.min, "")}
  ${_kpi("Max", s.max, "")}
  ${_kpi("Médiane", s.median, "")}
  ${_kpi("CV", s.cv !== null ? s.cv+"%" : "—", "coeff. variation")}
</div>
<div class="kpi-grid kpi-grid-2" style="margin-top:0">
  ${_kpi("Asymétrie (skew)", s.skew, s.skew > 0 ? "droite" : "gauche")}
  ${_kpi("Kurtosis", s.kurt, s.kurt > 0 ? "pointue" : "aplatie")}
</div>
</div>
</div>`;
  }

  function _sectionSPC(r) {
    const c1  = r.chart1;
    const ooc = c1.ooc.count;
    const viol = c1.ooc.violations;
    return `
<div class="section">
<h2><span class="section-icon">📉</span>Carte de contrôle SPC — ${c1.title}</h2>
<div class="card">
<div class="kpi-grid kpi-grid-4">
  ${_kpi("CL", c1.CL?.toFixed(4), "ligne centrale")}
  ${_kpiColor("UCL", c1.UCL?.toFixed(4), "limite sup.", "var(--amber)")}
  ${_kpiColor("LCL", c1.LCL?.toFixed(4), "limite inf.", "var(--amber)")}
  ${_kpiColor("Points OOC", ooc, "hors contrôle", ooc > 0 ? "var(--red)" : "var(--green)")}
</div>
${ooc === 0
  ? `<div class="diag ok"><span class="diag-icon">✓</span><strong>Procédé sous contrôle statistique</strong> — aucune violation des règles de Nelson détectée.</div>`
  : `<div class="diag error"><span class="diag-icon">✗</span><strong>${ooc} point(s) hors limites 3σ</strong> — intervention requise.</div>`}
${viol.length ? `
<table style="margin-top:10px">
<tr><th>Règle Nelson</th><th>Point(s)</th><th>Description</th></tr>
${viol.map(v => `<tr>
  <td class="td-center"><span class="badge badge-warn">Règle ${v.rule}</span></td>
  <td class="td-center td-right">#${v.index + 1}</td>
  <td>${v.desc}</td>
</tr>`).join("")}
</table>` : ""}
</div>
${r.chart2 ? `
<div class="card card-sm">
<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--cyan);margin-bottom:8px">${r.chart2.title}</div>
<div class="kpi-grid kpi-grid-4">
  ${_kpi("CL", r.chart2.CL?.toFixed(4), "")}
  ${_kpiColor("UCL", r.chart2.UCL?.toFixed(4), "", "var(--amber)")}
  ${_kpiColor("LCL", r.chart2.LCL?.toFixed(4), "", "var(--amber)")}
  ${_kpiColor("OOC", r.chart2.ooc?.count, "", r.chart2.ooc?.count > 0 ? "var(--red)" : "var(--green)")}
</div>
</div>` : ""}
</div>`;
  }

  function _sectionCapability(c) {
    const v = c.verdict;
    const badgeClass = v.label === "Excellent" || v.label === "Capable" ? "badge-green"
      : v.label === "Limite" ? "badge-warn" : "badge-red";

    // Barre de capabilité ASCII
    const pct = Math.min(100, Math.round(Math.min(2, Math.max(0, c.cpk)) / 2 * 100));
    const barGreen = Math.round(pct * 0.6), barAmber = Math.round(pct * 0.25), barRed = pct - barGreen - barAmber;

    return `
<div class="section">
<h2><span class="section-icon">◈</span>Indices de capabilité procédé</h2>
<div class="card">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
  <span style="font-size:13px;font-weight:700">Cpk = <span style="color:${v.color};font-family:var(--mono)">${c.cpk}</span></span>
  <span class="badge ${badgeClass}">${v.icon} ${v.label}</span>
</div>

<div class="cap-bar">
  <span style="font-size:9px;color:var(--dim);min-width:22px">0</span>
  <div style="flex:1;height:10px;background:rgba(255,255,255,.07);border-radius:4px;overflow:hidden;display:flex">
    <div class="cap-segment" style="width:${barGreen}%;background:var(--red)"></div>
    <div class="cap-segment" style="width:${barAmber}%;background:var(--amber)"></div>
    <div class="cap-segment" style="width:${barRed}%;background:var(--green)"></div>
    <div style="width:${100-pct}%;background:transparent"></div>
  </div>
  <span style="font-size:9px;color:var(--dim);min-width:22px;text-align:right">2.0</span>
</div>

<div class="kpi-grid kpi-grid-4" style="margin-top:10px">
  ${_kpiColor("Cp",  c.cp,  "potentiel",   c.cp  >= 1.33 ? "var(--green)" : "var(--amber)")}
  ${_kpiColor("Cpk", c.cpk, "réel",        c.cpk >= 1.33 ? "var(--green)" : "var(--red)")}
  ${_kpi("Cpl", c.cpl, "inf.")}
  ${_kpi("Cpu", c.cpu, "sup.")}
</div>
<div class="kpi-grid kpi-grid-3" style="margin-top:0">
  ${_kpi("Niveau σ", c.sigmaLevel, "sigma")}
  ${_kpiColor("DPMO", c.dpmo?.toLocaleString("fr-FR"), "def./million", c.dpmo > 6210 ? "var(--red)" : "var(--green)")}
  ${_kpiColor("Rendement", c.yieldPct+"%", "yield", c.yieldPct >= 99.99 ? "var(--green)" : "var(--amber)")}
</div>
${c.recommendation?.length ? `
<div style="margin-top:10px">
${c.recommendation.map(r => `
<div class="diag ${r.priorite === "haute" ? "error" : r.priorite === "faible" ? "ok" : "warn"}">
  <span class="diag-icon">${r.priorite === "haute" ? "🔴" : r.priorite === "faible" ? "🟢" : "🟡"}</span>
  <div>
    <strong>${r.texte}</strong>
    <div style="font-size:10px;color:var(--cyan);margin-top:2px">→ ${r.gain}</div>
  </div>
</div>`).join("")}
</div>` : ""}
</div>
</div>`;
  }

  function _sectionPareto(p) {
    return `
<div class="section">
<h2><span class="section-icon">◈</span>Analyse de Pareto (80/20)</h2>
<div class="card">
<p style="font-size:11px;margin-bottom:12px;color:var(--muted)">
  <strong style="color:var(--text)">${p.vital80.length} cause(s) vitale(s)</strong> sur ${p.items.length} 
  représentent 80% des défauts — 
  <span style="color:var(--cyan)">${p.vital80.join(", ") || "—"}</span>
</p>
<table>
<tr><th>#</th><th>Cause</th><th>Fréquence</th><th class="td-right">%</th><th class="td-right">Cumulé %</th><th>Vital</th></tr>
${p.items.map((e, i) => `
<tr>
  <td class="td-center" style="color:var(--dim)">${i + 1}</td>
  <td>${e.label}</td>
  <td class="td-right">${e.count}</td>
  <td class="td-right">${e.pct}%</td>
  <td class="td-right" style="color:${e.cumulPct <= 80 ? "var(--cyan)" : "var(--dim)"}">${e.cumulPct}%</td>
  <td class="td-center">${p.vital80.includes(e.label) ? '<span class="badge badge-cyan">Vital</span>' : ""}</td>
</tr>`).join("")}
</table>
<div style="margin-top:10px;font-size:10px;color:var(--muted)">
  Total : <strong style="color:var(--text)">${p.total}</strong> occurrences
</div>
</div>
</div>`;
  }

  function _sectionAMDEC(rows) {
    const critical = rows.filter(r => r.rpn >= 200).length;
    const high     = rows.filter(r => r.rpn >= 100 && r.rpn < 200).length;
    return `
<div class="section">
<h2><span class="section-icon">⚠</span>AMDEC — Analyse des Modes de Défaillance</h2>
<div class="card">
${critical > 0
  ? `<div class="diag error" style="margin-bottom:10px"><span class="diag-icon">✗</span>
     <strong>${critical} mode(s) critique(s)</strong> (RPN ≥ 200) — action immédiate requise.</div>`
  : high > 0
  ? `<div class="diag warn" style="margin-bottom:10px"><span class="diag-icon">⚠</span>
     <strong>${high} mode(s) à risque élevé</strong> (RPN ≥ 100) — planifier des actions.</div>`
  : `<div class="diag ok" style="margin-bottom:10px"><span class="diag-icon">✓</span>Aucun mode critique.</div>`}
<table>
<tr><th>Composant</th><th>Mode</th><th>Effet</th><th class="td-center">G</th><th class="td-center">O</th><th class="td-center">D</th><th class="td-center">RPN</th><th>Criticité</th></tr>
${rows.map(r => {
  const badgeClass = r.rpn >= 200 ? "badge-red" : r.rpn >= 100 ? "badge-warn" : r.rpn >= 50 ? "" : "badge-green";
  const label = r.rpn >= 200 ? "Critique" : r.rpn >= 100 ? "Élevé" : r.rpn >= 50 ? "Modéré" : "Faible";
  return `<tr>
  <td>${r.composant}</td><td>${r.mode}</td><td>${r.effet || "—"}</td>
  <td class="td-center">${r.G}</td><td class="td-center">${r.O}</td><td class="td-center">${r.D}</td>
  <td class="td-center" style="font-weight:700;color:${r.rpn>=200?"var(--red)":r.rpn>=100?"var(--amber)":"var(--green)"}">${r.rpn}</td>
  <td class="td-center"><span class="badge ${badgeClass}">${label}</span></td>
</tr>`;}).join("")}
</table>
</div>
</div>`;
  }

  function _sectionMSA(r) {
    const v = r.verdict;
    const badgeClass = v.class === "ok" ? "badge-green" : v.class === "warn" ? "badge-warn" : "badge-red";
    return `
<div class="section">
<h2><span class="section-icon">⊞</span>Analyse MSA — Gauge R&amp;R</h2>
<div class="card">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
  <span style="font-size:12px">${r.nOp} opérateurs · ${r.nPart} pièces · ${r.nRep} répétitions</span>
  <span class="badge ${badgeClass}">${v.label}</span>
</div>
<div class="kpi-grid kpi-grid-3">
  ${_kpiColor("%GRR", r.pctGRR+"%", "objectif ≤ 10%", r.pctGRR<=10?"var(--green)":r.pctGRR<=30?"var(--amber)":"var(--red)")}
  ${_kpiColor("NDC", r.ndc, "catégories disc. (≥5)", r.ndc>=5?"var(--green)":"var(--amber)")}
  ${_kpi("%Tolérance", r.pctTol !== null ? r.pctTol+"%" : "—", "vs USL−LSL")}
</div>
<table style="margin-top:10px">
<tr><th>Source de variation</th><th class="td-right">Valeur</th><th class="td-right">% TV</th><th>Interprétation</th></tr>
<tr><td>Répétabilité — EV (équipement)</td><td class="td-right">${r.EV}</td><td class="td-right">${r.pctEV}%</td><td>Variation due à l'instrument</td></tr>
<tr><td>Reproductibilité — AV (opérateur)</td><td class="td-right">${r.AV}</td><td class="td-right">${r.pctAV}%</td><td>Variation entre opérateurs</td></tr>
<tr style="font-weight:700"><td>Gauge R&amp;R — GRR</td>
  <td class="td-right" style="color:${r.pctGRR<=10?"var(--green)":"var(--red)"}">${r.GRR}</td>
  <td class="td-right" style="color:${r.pctGRR<=10?"var(--green)":"var(--red)"}">${r.pctGRR}%</td>
  <td style="color:var(--muted)">${r.pctGRR<=10?"Acceptable":r.pctGRR<=30?"Conditionnellement OK":"Non acceptable"}</td></tr>
<tr><td>Variation pièce — PV</td><td class="td-right">${r.PV}</td><td class="td-right">${r.pctPV}%</td><td>Variation entre pièces</td></tr>
<tr><td>Variation totale — TV</td><td class="td-right">${r.TV}</td><td class="td-right">100%</td><td>—</td></tr>
</table>
</div>
</div>`;
  }

  function _sectionTests(r) {
    if (!r) return "";
    const color = r.rejected ? "var(--red)" : "var(--green)";
    return `
<div class="section">
<h2><span class="section-icon">⟿</span>Tests statistiques</h2>
<div class="card">
<div class="diag ${r.rejected ? "error" : "ok"}">
  <span class="diag-icon">${r.rejected ? "✗" : "✓"}</span>
  <div><strong>${r.type}</strong><br>
  <span style="font-size:11px">${r.conclusion}</span></div>
</div>
<div class="kpi-grid kpi-grid-3" style="margin-top:10px">
  ${_kpiColor("Statistique", r.tStat ?? r.F ?? r.chi2 ?? "—", "", color)}
  ${_kpiColor("p-value", r.pValue, "", r.pValue < 0.05 ? "var(--red)" : "var(--green)")}
  ${_kpi("α seuil", r.alpha, "")}
</div>
</div>
</div>`;
  }

  function _sectionIA(ia) {
    if (!ia) return "";
    const statusColor = ia.statut === "sous_controle" ? "var(--green)"
      : ia.statut === "hors_controle" ? "var(--red)" : "var(--amber)";
    return `
<div class="section">
<h2><span class="section-icon">✦</span>Analyse Intelligence Artificielle</h2>
<div class="card">
${ia.synthese ? `<p style="font-size:11px;line-height:1.65;margin-bottom:12px">${ia.synthese}</p>` : ""}
${ia.diagnostic?.length ? `
<div style="margin-bottom:12px">
<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:6px">Diagnostic</div>
${ia.diagnostic.map(d => `<div class="diag info"><span class="diag-icon">◉</span>${d}</div>`).join("")}
</div>` : ""}
${ia.causes_probables?.length ? `
<div style="margin-bottom:12px">
<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:6px">Causes probables</div>
${ia.causes_probables.map(c => `<div class="diag warn"><span class="diag-icon">⚠</span>${c}</div>`).join("")}
</div>` : ""}
${ia.actions?.length ? `
<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:8px">Plan d'actions correctives</div>
${ia.actions.map(a => `
<div class="action-row">
  <span class="badge ${a.priorite==="haute"?"badge-red":a.priorite==="moyenne"?"badge-warn":"badge-green"}">${a.priorite}</span>
  <div><strong>${a.action}</strong>${a.detail ? `<br><span style="font-size:10px;color:var(--muted)">${a.detail}</span>` : ""}</div>
  <span style="font-size:9px;color:var(--dim);white-space:nowrap">${a.delai || ""}</span>
</div>`).join("")}` : ""}
</div>
</div>`;
  }

  function _sectionMethodology() {
    return `
<div class="section">
<h2><span class="section-icon">◉</span>Méthodologie et références</h2>
<div class="card card-sm">
<table>
<tr><th>Outil</th><th>Méthode</th><th>Référentiel</th></tr>
<tr><td>Cartes de contrôle</td><td>Shewhart (X̄-R, I-MR, p, c)</td><td>ISO 7870, AIAG SPC 2e éd.</td></tr>
<tr><td>Détection hors contrôle</td><td>8 règles de Nelson (Western Electric)</td><td>ISO 8258</td></tr>
<tr><td>Indices de capabilité</td><td>Cp, Cpk, Cpm (Taguchi), DPMO</td><td>ISO 22514, AIAG PPAP</td></tr>
<tr><td>Analyse système mesure</td><td>Gauge R&amp;R (Méthode R̄&amp;R)</td><td>AIAG MSA 4e éd., IATF 16949</td></tr>
<tr><td>Diagramme de Pareto</td><td>Principe 80/20 (Juran)</td><td>ISO 9001:2015 §10.2</td></tr>
<tr><td>AMDEC</td><td>RPN = G × O × D (1–10)</td><td>IEC 60812, AIAG FMEA</td></tr>
<tr><td>Tests statistiques</td><td>t de Student (Welch), test F</td><td>ISO 5725</td></tr>
<tr><td>Analyse IA</td><td>LLM multi-fournisseurs (Claude/Gemini/OpenAI)</td><td>Expertise interne</td></tr>
</table>
</div>
</div>`;
  }

  // ─── Helpers KPI ─────────────────────────────────────────────────

  function _kpi(label, val, unit) {
    return `<div class="kpi">
      <div class="kpi-label">${label}</div>
      <div class="kpi-val">${val ?? "—"}</div>
      ${unit ? `<div class="kpi-unit">${unit}</div>` : ""}
    </div>`;
  }

  function _kpiColor(label, val, unit, color) {
    return `<div class="kpi">
      <div class="kpi-label">${label}</div>
      <div class="kpi-val" style="color:${color}">${val ?? "—"}</div>
      ${unit ? `<div class="kpi-unit">${unit}</div>` : ""}
    </div>`;
  }

  // ─── Export / Ouverture ──────────────────────────────────────────

  function download(params) {
    const html = generate(params);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const ent  = (params.entreprise || "rapport").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
    a.href     = url;
    a.download = `Rapport_QHSE_${ent}_${new Date().toISOString().substring(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openInWindow(params) {
    const win = window.open("", "_blank");
    if (win) { win.document.write(generate(params)); win.document.close(); }
  }

  return { generate, download, openInWindow };

})();

window.ReportGenerator = ReportGenerator;
