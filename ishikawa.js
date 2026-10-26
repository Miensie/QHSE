/**
 * ============================================================
 * ishikawa.js — Diagramme d'Ishikawa (Cause-Effet / 5M)
 * Dessin SVG natif sur canvas HTML5
 * ============================================================
 */
"use strict";

const IshikawaModule = (() => {

  // Catégories 5M (+ option 6M avec Management)
  const CATEGORIES_5M = [
    { id: "methode",    label: "Méthode",      color: "#00D4FF", side: "top" },
    { id: "machine",    label: "Machine",      color: "#FFB830", side: "top" },
    { id: "matiere",    label: "Matière",      color: "#00E676", side: "top" },
    { id: "maindoeuvre",label: "Main-d'œuvre", color: "#B388FF", side: "bottom" },
    { id: "milieu",     label: "Milieu",       color: "#FF4D6D", side: "bottom" },
    { id: "mesure",     label: "Mesure",       color: "#80DEEA", side: "bottom" },
  ];

  /**
   * Crée les champs de saisie dans l'UI pour chaque catégorie 5M.
   */
  function buildInputUI(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = CATEGORIES_5M.map(cat => `
      <div class="card" style="margin-bottom:8px">
        <div class="card-title" style="color:${cat.color}">
          <span>◆</span> ${cat.label}
        </div>
        <div id="ishi-inputs-${cat.id}">
          <input class="form-control ishi-cause-input" 
                 data-category="${cat.id}" 
                 placeholder="Cause 1…" 
                 style="margin-bottom:4px"/>
          <input class="form-control ishi-cause-input" 
                 data-category="${cat.id}" 
                 placeholder="Cause 2…" 
                 style="margin-bottom:4px"/>
          <input class="form-control ishi-cause-input" 
                 data-category="${cat.id}" 
                 placeholder="Cause 3…"/>
        </div>
      </div>`).join("");
  }

  /**
   * Lit les causes saisies depuis l'UI.
   */
  function readCauses() {
    const causes = {};
    CATEGORIES_5M.forEach(cat => {
      causes[cat.id] = Array.from(
        document.querySelectorAll(`.ishi-cause-input[data-category="${cat.id}"]`)
      )
        .map(inp => inp.value.trim())
        .filter(Boolean);
    });
    return causes;
  }

  /**
   * Pré-remplit les causes depuis un objet (utilisé par l'IA).
   */
  function fillCauses(causesObj) {
    CATEGORIES_5M.forEach(cat => {
      const inputs = Array.from(
        document.querySelectorAll(`.ishi-cause-input[data-category="${cat.id}"]`)
      );
      const vals = causesObj[cat.id] || [];
      inputs.forEach((inp, i) => { inp.value = vals[i] || ""; });
    });
  }

  /**
   * Dessine le diagramme d'Ishikawa sur le canvas.
   * @param {string} canvasId
   * @param {string} effet - Problème/Effet
   * @param {Object} causes - { methode: [...], machine: [...], ... }
   */
  function draw(canvasId, effet, causes) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Fond
    ctx.fillStyle = "#111B2E";
    ctx.fillRect(0, 0, W, H);

    const cx = W * 0.13, cy = H / 2; // début arête principale (gauche)
    const ex = W * 0.88, ey = H / 2; // fin (droite — boîte effet)

    // ── Arête principale ──
    ctx.strokeStyle = "#00D4FF";
    ctx.lineWidth   = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex - 60, ey);
    ctx.stroke();

    // ── Flèche effet ──
    drawArrow(ctx, ex - 60, ey, ex - 10, ey, "#00D4FF", 2.5);

    // ── Boîte effet ──
    const boxW = 110, boxH = 44;
    ctx.strokeStyle = "#00D4FF";
    ctx.lineWidth   = 1.5;
    ctx.fillStyle   = "rgba(0,212,255,0.12)";
    ctx.beginPath();
    ctx.roundRect(ex - boxW / 2 + 5, ey - boxH / 2, boxW, boxH, 4);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle   = "#E8F0FE";
    ctx.font        = "bold 10px 'IBM Plex Sans', sans-serif";
    ctx.textAlign   = "center";
    ctx.textBaseline = "middle";
    wrapText(ctx, effet || "Effet / Problème", ex - boxW / 2 + 5 + boxW / 2, ey, boxW - 8, 14);

    // ── Arêtes secondaires (catégories) ──
    const topCats    = CATEGORIES_5M.filter(c => c.side === "top");
    const bottomCats = CATEGORIES_5M.filter(c => c.side === "bottom");
    const axisLength = ex - 60 - cx;

    // Positions X des arêtes le long de la colonne vertébrale
    const positions = [0.22, 0.50, 0.78];

    topCats.forEach((cat, i) => {
      const xBranch = cx + axisLength * positions[i];
      const yTop    = cy - H * 0.3;
      drawBranch(ctx, xBranch, cy, xBranch - 30, yTop, cat, causes[cat.id] || [], "top");
    });

    bottomCats.forEach((cat, i) => {
      const xBranch = cx + axisLength * positions[i];
      const yBot    = cy + H * 0.3;
      drawBranch(ctx, xBranch, cy, xBranch - 30, yBot, cat, causes[cat.id] || [], "bottom");
    });
  }

  function drawBranch(ctx, x0, y0, x1, y1, cat, causes, side) {
    // Arête principale de la catégorie
    ctx.strokeStyle = cat.color;
    ctx.lineWidth   = 1.8;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    // Label catégorie
    ctx.fillStyle   = cat.color;
    ctx.font        = "bold 9px 'IBM Plex Sans', sans-serif";
    ctx.textAlign   = "center";
    ctx.textBaseline = side === "top" ? "bottom" : "top";
    ctx.fillText(cat.label, x1, side === "top" ? y1 - 3 : y1 + 3);

    // Causes (sous-arêtes)
    const dirY = side === "top" ? 1 : -1;
    causes.slice(0, 3).forEach((cause, i) => {
      const t  = 0.3 + i * 0.25;
      const cx = x0 + (x1 - x0) * t;
      const cy = y0 + (y1 - y0) * t;
      const cx2 = cx - 22;
      const cy2 = cy + dirY * 28;

      ctx.strokeStyle = cat.color + "88";
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx2, cy2);
      ctx.stroke();

      ctx.fillStyle   = "#8BA8C8";
      ctx.font        = "8px 'IBM Plex Mono', monospace";
      ctx.textAlign   = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(cause.substring(0, 16), cx2 - 2, cy2);
    });
  }

  function drawArrow(ctx, x1, y1, x2, y2, color, lw) {
    const headLen = 10, angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.strokeStyle = color;
    ctx.lineWidth   = lw;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 7), y2 - headLen * Math.sin(angle - Math.PI / 7));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 7), y2 - headLen * Math.sin(angle + Math.PI / 7));
    ctx.stroke();
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    const lines = [];
    words.forEach(word => {
      const test = line + word + " ";
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line); line = word + " ";
      } else { line = test; }
    });
    lines.push(line);
    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((l, i) => ctx.fillText(l.trim(), x, startY + i * lineHeight));
  }

  return { CATEGORIES_5M, buildInputUI, readCauses, fillCauses, draw };

})();

window.IshikawaModule = IshikawaModule;
