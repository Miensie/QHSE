/**
 * ============================================================
 * stateManager.js — Persistance de l'état entre sessions
 * Sauvegarde : config IA, seuils capabilité, historique calculs
 * ============================================================
 */
"use strict";

const StateManager = (() => {

  const KEYS = {
    AI_CONFIG:   "qhse_ai_config",
    CAP_PREFS:   "qhse_cap_prefs",
    HISTORY:     "qhse_calc_history",
    UI_PREFS:    "qhse_ui_prefs",
  };

  // ─── Sauvegarde / Chargement générique ───────────────────────────

  function save(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify({ v: 1, ts: Date.now(), data }));
      return true;
    } catch (e) {
      console.warn("[StateManager] Save failed:", e.message);
      return false;
    }
  }

  function load(key, defaultVal = null) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return defaultVal;
      const parsed = JSON.parse(raw);
      return parsed?.data ?? defaultVal;
    } catch {
      return defaultVal;
    }
  }

  function remove(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  // ─── Config IA ────────────────────────────────────────────────────

  function saveAIConfig(provider, keyHint) {
    // Ne jamais stocker la clé API complète — uniquement un hint (4 derniers chars)
    save(KEYS.AI_CONFIG, {
      provider,
      keyHint: keyHint ? "…" + String(keyHint).slice(-4) : null,
      savedAt: new Date().toISOString(),
    });
  }

  function loadAIConfig() {
    return load(KEYS.AI_CONFIG, { provider: "claude", keyHint: null });
  }

  // ─── Préférences capabilité ───────────────────────────────────────

  function saveCapPrefs(usl, lsl, target) {
    save(KEYS.CAP_PREFS, { usl, lsl, target });
  }

  function loadCapPrefs() {
    return load(KEYS.CAP_PREFS, { usl: null, lsl: null, target: null });
  }

  // ─── Historique des calculs ───────────────────────────────────────

  const MAX_HISTORY = 20;

  function addToHistory(entry) {
    const history = load(KEYS.HISTORY, []);
    history.unshift({
      ...entry,
      ts: new Date().toISOString(),
    });
    save(KEYS.HISTORY, history.slice(0, MAX_HISTORY));
  }

  function getHistory() {
    return load(KEYS.HISTORY, []);
  }

  function clearHistory() {
    remove(KEYS.HISTORY);
  }

  // ─── Préférences UI ───────────────────────────────────────────────

  function saveUIPrefs(prefs) {
    const current = load(KEYS.UI_PREFS, {});
    save(KEYS.UI_PREFS, { ...current, ...prefs });
  }

  function loadUIPrefs() {
    return load(KEYS.UI_PREFS, {
      lastPanel:    "panel-data",
      lastChartType:"imr",
      entreprise:   "",
      process:      "",
    });
  }

  // ─── Restauration UI depuis l'état sauvegardé ─────────────────────

  function restoreUI() {
    // Préférences capabilité
    const capPrefs = loadCapPrefs();
    if (capPrefs.usl !== null) {
      const uslEl = document.getElementById("cap-usl");
      const lslEl = document.getElementById("cap-lsl");
      const tgtEl = document.getElementById("cap-target");
      if (uslEl) uslEl.value = capPrefs.usl;
      if (lslEl) lslEl.value = capPrefs.lsl;
      if (tgtEl && capPrefs.target !== null) tgtEl.value = capPrefs.target;
    }

    // Préférences UI
    const uiPrefs = loadUIPrefs();
    if (uiPrefs.entreprise) {
      const el = document.getElementById("cfg-entreprise");
      if (el) el.value = uiPrefs.entreprise;
    }
    if (uiPrefs.process) {
      const el = document.getElementById("cfg-process");
      if (el) el.value = uiPrefs.process;
    }
    if (uiPrefs.lastChartType) {
      const el = document.getElementById("chart-type");
      if (el) el.value = uiPrefs.lastChartType;
    }

    // Config IA (provider seulement)
    const aiCfg = loadAIConfig();
    if (aiCfg.provider) {
      const el = document.getElementById("ai-provider");
      if (el) el.value = aiCfg.provider;
    }
  }

  // ─── Auto-save sur changements UI ────────────────────────────────

  function setupAutoSave() {
    // Sauvegarder les préférences à chaque changement
    const watch = (id, saveFn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", saveFn);
    };

    watch("ai-provider", () => {
      const p = document.getElementById("ai-provider")?.value;
      if (p) saveAIConfig(p, null);
    });

    watch("chart-type", () => {
      const t = document.getElementById("chart-type")?.value;
      saveUIPrefs({ lastChartType: t });
    });

    // Sauvegarder USL/LSL après saisie (debounce 1s)
    let capTimer = null;
    ["cap-usl", "cap-lsl", "cap-target"].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", () => {
        clearTimeout(capTimer);
        capTimer = setTimeout(() => {
          saveCapPrefs(
            parseFloat(document.getElementById("cap-usl")?.value) || null,
            parseFloat(document.getElementById("cap-lsl")?.value) || null,
            parseFloat(document.getElementById("cap-target")?.value) || null,
          );
        }, 1000);
      });
    });

    // Sauvegarder nom entreprise / procédé
    let uiTimer = null;
    ["cfg-entreprise", "cfg-process"].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", () => {
        clearTimeout(uiTimer);
        uiTimer = setTimeout(() => {
          saveUIPrefs({
            entreprise: document.getElementById("cfg-entreprise")?.value || "",
            process:    document.getElementById("cfg-process")?.value    || "",
          });
        }, 1000);
      });
    });
  }

  // ─── Export ──────────────────────────────────────────────────────

  return {
    save, load, remove,
    saveAIConfig, loadAIConfig,
    saveCapPrefs, loadCapPrefs,
    addToHistory, getHistory, clearHistory,
    saveUIPrefs, loadUIPrefs,
    restoreUI, setupAutoSave,
  };

})();

window.StateManager = StateManager;
