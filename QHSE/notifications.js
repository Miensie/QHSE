/**
 * ============================================================
 * notifications.js — Toasts enrichis + aide contextuelle
 * ============================================================
 */
"use strict";

const Notifications = (() => {

  // ─── Toasts enrichis ─────────────────────────────────────────────

  function toast(message, type = "info", opts = {}) {
    const {
      duration  = 3500,
      action    = null,   // { label, fn }
      detail    = null,
      progress  = false,
    } = opts;

    const container = document.getElementById("toast-container");
    if (!container) return;

    const icons = { success: "✅", error: "❌", info: "ℹ️", warn: "⚠️" };
    const t     = document.createElement("div");
    t.className = `toast ${type}`;
    t.style.cssText = "cursor:pointer;user-select:none";

    t.innerHTML = `
      <span style="font-size:13px">${icons[type] || "ℹ️"}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600">${message}</div>
        ${detail ? `<div style="font-size:10px;opacity:.75;margin-top:2px">${detail}</div>` : ""}
      </div>
      ${action ? `<button class="toast-action" style="
        background:rgba(255,255,255,.15);border:none;border-radius:3px;
        padding:3px 9px;color:inherit;font-size:10px;font-weight:700;
        cursor:pointer;white-space:nowrap">${action.label}</button>` : ""}
      <span style="font-size:16px;opacity:.5;margin-left:4px;cursor:pointer"
            onclick="this.closest('.toast').remove()">×</span>`;

    // Barre de progression
    if (progress) {
      const bar = document.createElement("div");
      bar.style.cssText = `
        position:absolute;bottom:0;left:0;height:2px;width:100%;
        background:currentColor;opacity:.4;border-radius:0 0 4px 4px;
        transition:width ${duration}ms linear`;
      t.style.position = "relative";
      t.style.overflow = "hidden";
      t.appendChild(bar);
      requestAnimationFrame(() => { bar.style.width = "0"; });
    }

    if (action) {
      t.querySelector(".toast-action")?.addEventListener("click", (e) => {
        e.stopPropagation();
        action.fn();
        t.remove();
      });
    }

    container.appendChild(t);

    const dismiss = setTimeout(() => {
      t.style.opacity = "0";
      t.style.transform = "translateY(8px)";
      t.style.transition = "all .3s ease";
      setTimeout(() => t.remove(), 300);
    }, duration);

    t.addEventListener("click", () => { clearTimeout(dismiss); t.remove(); });
  }

  // ─── Aide contextuelle (tooltips) ────────────────────────────────

  const HELP_TEXTS = {
    "spc-column":     "Sélectionnez la colonne de mesures à analyser. Doit être numérique.",
    "chart-type":     "I-MR : données individuelles (1 mesure/point). X̄-R : sous-groupes 2–10.",
    "subgroup-size":  "Nombre de mesures dans chaque sous-groupe. Standard : 4 ou 5.",
    "cap-usl":        "Limite supérieure de spécification (engineering). Ne pas confondre avec UCL (statistique).",
    "cap-lsl":        "Limite inférieure de spécification. USL − LSL = tolérance totale.",
    "cap-target":     "Valeur nominale cible. Utilisée pour calculer l'indice Cpm de Taguchi.",
    "btn-calc-spc":   "Calcule CL, UCL, LCL et applique les 8 règles de Nelson.",
    "btn-calc-cap":   "Requiert d'avoir calculé une carte SPC au préalable ou sélectionné une colonne.",
    "btn-msa-demo":   "Charge 3 opérateurs × 10 pièces × 2 répétitions de démonstration.",
    "btn-pareto":     "Trie les causes par fréquence décroissante et trace la courbe cumulée.",
    "btn-ishi-draw":  "Dessine le diagramme 5M sur le canvas. Cliquez 'Insérer' pour l'ajouter à Excel.",
    "btn-amdec-calc": "RPN = Gravité × Occurrence × Détection (1–10 chacun). Critique si RPN ≥ 200.",
    "btn-analyse-ia": "Envoie le bilan SPC + capabilité à l'IA pour une analyse experte.",
    "ai-key":         "Clé API confidentielle — elle ne quitte pas votre navigateur et n'est jamais stockée.",
  };

  function setupTooltips() {
    Object.entries(HELP_TEXTS).forEach(([id, text]) => {
      const el = document.getElementById(id);
      if (!el) return;

      const wrap = el.parentElement;
      if (!wrap) return;

      // Ajouter une icône d'aide à côté du label
      const label = wrap.querySelector(".form-label");
      if (label && !label.querySelector(".help-icon")) {
        const icon = document.createElement("span");
        icon.className = "help-icon";
        icon.innerHTML = " ⓘ";
        icon.style.cssText = `
          color:var(--text-muted);font-size:9px;cursor:help;
          font-style:normal;vertical-align:middle`;
        icon.title = text;
        label.appendChild(icon);
      }

      // Tooltip sur focus/hover
      const showTip = () => {
        const existing = document.getElementById("help-tooltip");
        if (existing) existing.remove();

        const tip = document.createElement("div");
        tip.id = "help-tooltip";
        tip.textContent = text;
        tip.style.cssText = `
          position:fixed;bottom:60px;left:10px;right:10px;
          background:#1D2D48;border:1px solid rgba(0,212,255,.3);
          border-radius:6px;padding:8px 12px;font-size:10px;
          color:#8BA8C8;z-index:9000;line-height:1.5;
          box-shadow:0 4px 20px rgba(0,0,0,.5);
          animation:fadeIn .15s ease`;
        document.body.appendChild(tip);

        setTimeout(() => tip.remove(), 4000);
      };

      el.addEventListener("focus", showTip);
    });
  }

  // ─── Indicateur de chargement global ─────────────────────────────

  function showLoading(message = "Chargement…") {
    const overlay = document.getElementById("loading-overlay");
    const msgEl   = document.getElementById("loading-msg");
    if (overlay) overlay.style.display = "flex";
    if (msgEl)   msgEl.textContent = message;
  }

  function hideLoading() {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.style.display = "none";
  }

  // ─── Badge de nouveauté ───────────────────────────────────────────

  function showNewBadge(tabDataPanel) {
    const tab = document.querySelector(`[data-panel="${tabDataPanel}"]`);
    if (!tab || tab.querySelector(".new-badge")) return;
    const badge = document.createElement("span");
    badge.className = "new-badge";
    badge.textContent = "NEW";
    badge.style.cssText = `
      font-size:7px;font-weight:700;background:var(--accent-red);
      color:white;padding:1px 4px;border-radius:3px;
      margin-left:4px;vertical-align:middle;letter-spacing:.05em`;
    tab.appendChild(badge);
    setTimeout(() => badge.remove(), 30000);
  }

  return { toast, setupTooltips, showLoading, hideLoading, showNewBadge };

})();

window.Notifications = Notifications;
