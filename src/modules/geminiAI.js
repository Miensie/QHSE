/**
 * geminiAI.js — Intégration Google Gemini API (AI Studio)
 * Analyse SPC, Pareto, AMDEC + Chat QHSE interactif
 */
"use strict";

// NB : depuis le 18/09/2026, Google réserve les modèles 2.5 aux comptes qui les
// utilisaient déjà (une nouvelle clé reçoit un 404). Le modèle est donc configurable
// depuis l'onglet IA ; vérifier les noms à jour sur ai.google.dev/gemini-api/docs/models
const GEMINI_CONFIG = {
  baseUrl:   "https://generativelanguage.googleapis.com/v1beta/models",
  defaultModel: "gemini-3.5-flash-lite",
  maxTokens: 4096,
  timeoutMs: 60000,
  storageKey: "qhse_gemini_key",
  modelStorageKey: "qhse_gemini_model",
};

// Wrapper localStorage sécurisé (Edge Tracking Prevention bloque localStorage en iframe)
const _store = {};
const storage = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return _store[key] ?? null; }
  },
  set(key, val) {
    try { localStorage.setItem(key, val); } catch { _store[key] = val; }
  },
};

let _apiKey     = "";
let _model      = GEMINI_CONFIG.defaultModel;
let _chatHistory = [];

// ─── Gestion de la clé API ────────────────────────────────────────────────────

function setApiKey(key) {
  _apiKey = key.trim();
  try { storage.set(GEMINI_CONFIG.storageKey, _apiKey); } catch {}
}

function loadApiKey() {
  try {
    const saved = storage.get(GEMINI_CONFIG.storageKey);
    if (saved) _apiKey = saved;
  } catch {}
  return _apiKey;
}

function hasApiKey() { return !!_apiKey; }

function setModel(model) {
  _model = (model || "").trim() || GEMINI_CONFIG.defaultModel;
  storage.set(GEMINI_CONFIG.modelStorageKey, _model);
}

function loadModel() {
  const saved = storage.get(GEMINI_CONFIG.modelStorageKey);
  if (saved) _model = saved;
  return _model;
}

function getModel() { return _model; }

// ─── Requête Gemini ───────────────────────────────────────────────────────────

function _endpoint() {
  return `${GEMINI_CONFIG.baseUrl}/${encodeURIComponent(_model)}:generateContent`;
}

/** Traduit les erreurs HTTP de l'API en messages actionnables. */
function _httpError(status, apiMsg) {
  if (status === 404) return `Modèle « ${_model} » introuvable ou non disponible pour cette clé. Choisissez un autre modèle dans l'onglet IA. ${apiMsg}`;
  if (status === 400 && /api key/i.test(apiMsg)) return "Clé API invalide. Vérifiez-la sur aistudio.google.com.";
  if (status === 403) return `Accès refusé (403) — clé restreinte ou API non activée. ${apiMsg}`;
  if (status === 429) return "Quota ou limite de débit atteint (429). Patientez puis réessayez.";
  if (status >= 500)  return `Service Gemini indisponible ou surchargé (${status}). Réessayez dans un instant.`;
  return apiMsg || `Erreur API ${status}`;
}

/**
 * @param {string} systemPrompt
 * @param {string|Array} userContent  texte, ou tableau `contents` multi-tours
 * @param {boolean} jsonMode          réponse JSON native (responseMimeType)
 */
async function _callGemini(systemPrompt, userContent, jsonMode = false) {
  if (!_apiKey) throw new Error("Clé API Gemini non configurée. Renseignez-la dans l'onglet IA.");

  const contents = Array.isArray(userContent)
    ? userContent
    : [{ role: "user", parts: [{ text: userContent }] }];

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      maxOutputTokens: GEMINI_CONFIG.maxTokens,
      ...(jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_CONFIG.timeoutMs);
  let resp;
  try {
    resp = await fetch(_endpoint(), {
      method:  "POST",
      // Clé dans l'en-tête plutôt que dans l'URL (évite qu'elle apparaisse dans les logs)
      headers: { "Content-Type": "application/json", "x-goog-api-key": _apiKey },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });
  } catch (e) {
    throw new Error(e.name === "AbortError"
      ? `Délai dépassé (${GEMINI_CONFIG.timeoutMs / 1000} s) — réessayez.`
      : `Impossible de joindre l'API Gemini (réseau/pare-feu ?) : ${e.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(_httpError(resp.status, err?.error?.message || ""));
  }

  const data = await resp.json();
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Requête bloquée par Gemini (${data.promptFeedback.blockReason}).`);
  }
  const cand = data.candidates?.[0];
  // Concaténer toutes les parties texte (hors "pensées" éventuelles)
  const text = (cand?.content?.parts || [])
    .filter(p => typeof p.text === "string" && !p.thought)
    .map(p => p.text).join("");

  if (!text) throw new Error(`Réponse vide de Gemini (finishReason : ${cand?.finishReason || "inconnu"}).`);

  if (jsonMode) {
    const clean = text.replace(/```json|```/g, "").trim();
    const m = clean.match(/\{[\s\S]*\}/);
    try { return JSON.parse(m ? m[0] : clean); }
    catch { throw new Error("Gemini n'a pas renvoyé un JSON valide. Réessayez."); }
  }
  return cand.finishReason === "MAX_TOKENS"
    ? text + "\n\n⚠ Réponse tronquée (limite de longueur atteinte)."
    : text;
}

/** Test rapide clé + modèle (ne vérifie que le statut HTTP). */
async function testConnection() {
  await _callGemini("Réponds uniquement : OK", "ping").catch(e => {
    // Une réponse vide n'est pas un échec de connexion
    if (/Réponse vide/.test(e.message)) return "OK";
    throw e;
  });
  return true;
}

// ─── Analyses spécialisées ────────────────────────────────────────────────────

const SYSTEM_QHSE = `Tu es un expert en contrôle de qualité industrielle et statistiques SPC (Statistical Process Control). 
Tu maîtrises ISO 9001, Six Sigma, les règles de Nelson, les indices de capabilité Cp/Cpk, le GHG Protocol industriel et les normes IATF 16949.
Tu réponds en français, de façon précise, structurée et actionnable. 
Tu utilises des émojis sparingly pour la lisibilité.`;

/**
 * Analyse les résultats d'une carte de contrôle.
 */
async function analyzeSPC(stats, violations, chartType) {
  // Regrouper par règle (une longue série peut générer des centaines de lignes)
  const byRule = {};
  violations.forEach(v => { (byRule[v.rule] = byRule[v.rule] || []).push(v.point); });
  const violText = violations.length === 0
    ? "Aucune violation des règles de Nelson détectée."
    : Object.entries(byRule).map(([r, pts]) =>
        `- Règle ${r} : ${pts.length} occurrence(s), points ${pts.slice(0, 15).join(", ")}${pts.length > 15 ? "…" : ""}`
      ).join("\n");
  const fmt4 = v => (typeof v === "number" && isFinite(v)) ? v.toFixed(4) : "n/a";

  const prompt = `
Analyse cette carte de contrôle ${chartType} :

STATISTIQUES DU PROCÉDÉ :
- N points : ${stats.n}
- Moyenne (ligne centrale) : ${fmt4(stats.mean)}
- Écart-type estimé (σ) : ${fmt4(stats.sigma)}
- UCL : ${fmt4(stats.uclX ?? stats.uclI ?? stats.ucl)}${chartType === "p" ? " (moyenne — limites variables selon la taille de lot)" : ""}
- LCL : ${fmt4(stats.lclX ?? stats.lclI ?? stats.lcl)}
${stats.subgroupSize ? `- Taille des sous-groupes : ${stats.subgroupSize}\n` : ""}- Points hors contrôle (R1) : ${violations.filter(v => v.rule === 1).length}

VIOLATIONS DÉTECTÉES (règles de Nelson) :
${violText}

Fournir :
1. 🎯 **Statut du procédé** : sous contrôle / hors contrôle / instable
2. 📊 **Interprétation** des violations détectées
3. 🔍 **Causes probables** de dérive (causes spéciales vs communes)
4. ✅ **Actions correctives** prioritaires (max 4, concrètes et chiffrées)
5. 📋 **Recommandations** pour améliorer la capabilité`;

  return _callGemini(SYSTEM_QHSE, prompt);
}

/**
 * Analyse un diagramme de Pareto.
 */
async function analyzePareto(paretoRows, totalDefects) {
  const top5 = paretoRows.slice(0, 5).map(r =>
    `${r.cause} : ${r.freq} occurrences (${r.pct.toFixed(1)}%, cumul ${r.cumul.toFixed(1)}%)`
  ).join("\n");

  const prompt = `
Analyse ce diagramme de Pareto (${totalDefects} défauts au total) :

TOP 5 CAUSES :
${top5}

Classe A (≤80%) : ${paretoRows.filter(r => r.classe === "A").length} causes
Classe B (80-95%) : ${paretoRows.filter(r => r.classe === "B").length} causes
Classe C (>95%) : ${paretoRows.filter(r => r.classe === "C").length} causes

Fournir :
1. 🎯 **Synthèse Pareto** : quelles sont les causes vitales ?
2. 🔍 **Analyse des causes racines** probables pour les 3 premières causes
3. ✅ **Plan d'action** : 3 actions prioritaires avec potentiel de réduction estimé
4. 📋 **Indicateurs** à suivre pour mesurer l'efficacité des actions`;

  return _callGemini(SYSTEM_QHSE, prompt);
}

/**
 * Évalue les risques AMDEC.
 */
async function analyzeAMDEC(rows) {
  const critical = rows.filter(r => r.rpn >= 100).slice(0, 5);
  const critText = critical.map(r =>
    `- ${r.mode} (${r.fonction}) : RPN=${r.rpn} [G=${r.g}, O=${r.o}, D=${r.d}] — ${r.cause}`
  ).join("\n");

  const prompt = `
Évalue cette analyse AMDEC (${rows.length} modes de défaillance analysés) :

RPN MOYEN : ${(rows.reduce((a, r) => a + r.rpn, 0) / rows.length).toFixed(0)}
MODES CRITIQUES (RPN ≥ 100) : ${critical.length}

DÉTAIL DES MODES CRITIQUES :
${critText || "Aucun mode critique"}

Pour chaque mode critique :
1. ⚠️ **Évaluation du risque** et contexte industriel probable
2. 🔧 **Actions préventives** pour réduire O (occurrence)  
3. 🔍 **Renforcement de la détection** pour améliorer D
4. 📉 **RPN cible** réaliste après actions
5. ✅ **Priorité et délai** de mise en œuvre recommandés`;

  return _callGemini(SYSTEM_QHSE, prompt);
}

/**
 * Diagnostic global de la qualité.
 */
async function globalDiagnosis(kpis, spcStats = null, paretoRows = null) {
  const prompt = `
Effectue un diagnostic qualité global du procédé :

KPIs QUALITÉ :
- Taux de non-conformité : ${kpis.tauxNC?.toFixed(2) ?? "—"}%
- Nb total défauts : ${kpis.nbDefauts ?? "—"}
- Cp : ${kpis.cp?.toFixed(3) ?? "—"} | Cpk : ${kpis.cpk?.toFixed(3) ?? "—"} (σ intra)
- Pp : ${kpis.pp?.toFixed(3) ?? "—"} | Ppk : ${kpis.ppk?.toFixed(3) ?? "—"} (σ global)
- Points hors contrôle : ${kpis.pointsHC ?? "—"}

${spcStats ? `CONTRÔLE STATISTIQUE :
- Moyenne : ${spcStats.mean?.toFixed(4)}
- Sigma : ${spcStats.sigma?.toFixed(4)}
- Violations Nelson : ${spcStats.nbViolations ?? 0}` : ""}

${paretoRows ? `TOP 3 DÉFAUTS : ${paretoRows.slice(0,3).map(r => r.cause).join(", ")}` : ""}

Fournir un rapport structuré :
1. 🏭 **Statut global du procédé** (conforme / non conforme / critique)
2. 📊 **Performance vs benchmarks** sectoriels (Cp cible 1.33, taux NC < 1%)
3. 🎯 **Zone de risque principale** identifiée
4. 🔝 **3 actions prioritaires** avec impact attendu et référentiel (ISO 9001, Six Sigma)
5. 📅 **Feuille de route** suggérée sur 3 mois
6. 📋 **Indicateurs de suivi** recommandés`;

  return _callGemini(SYSTEM_QHSE, prompt);
}

/**
 * Suggestions de causes Ishikawa basées sur l'IA.
 */
async function suggestIshikawaCauses(effect, existingCauses = {}) {
  const prompt = `
Pour le problème qualité suivant : "${effect}"
Causes déjà identifiées : ${JSON.stringify(existingCauses)}

Génère des suggestions de causes supplémentaires pour chaque catégorie 5M.
Réponds UNIQUEMENT en JSON avec ce format exact :
{
  "methode": ["cause1", "cause2"],
  "machine": ["cause1", "cause2"],
  "matiere": ["cause1", "cause2"],
  "main-oeuvre": ["cause1", "cause2"],
  "milieu": ["cause1", "cause2"],
  "mesure": ["cause1", "cause2"]
}
Maximum 3 causes par catégorie. Causes concrètes et spécifiques à l'industrie.`;

  const raw = await _callGemini(SYSTEM_QHSE, prompt, true);
  // Normaliser les clés et ne garder que des listes de chaînes
  const alias = { "maindoeuvre": "main-oeuvre", "main_oeuvre": "main-oeuvre", "main-d-oeuvre": "main-oeuvre",
                  "méthode": "methode", "matière": "matiere" };
  const out = {};
  Object.entries(raw || {}).forEach(([k, v]) => {
    const key = alias[k.toLowerCase()] || k.toLowerCase();
    if (Array.isArray(v)) out[key] = v.filter(c => typeof c === "string" && c.trim()).slice(0, 3);
  });
  return out;
}

// ─── Chat interactif ──────────────────────────────────────────────────────────

function resetChat() { _chatHistory = []; }
function getChatLength() { return _chatHistory.length; }

async function sendChatMessage(message, context = {}) {
  const contextText = Object.keys(context).length > 0
    ? `\nContexte des données actuelles : ${JSON.stringify(context, null, 2)}\n`
    : "";

  const systemWithContext = SYSTEM_QHSE + contextText;

  // Historique multi-tours natif (rôles user / model), 10 derniers messages
  const history = _chatHistory.slice(-10).map(m => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));
  history.push({ role: "user", parts: [{ text: message }] });

  const response = await _callGemini(systemWithContext, history);
  // N'enregistrer l'échange qu'en cas de succès (pas de message orphelin après une erreur)
  _chatHistory.push({ role: "user", text: message }, { role: "assistant", text: response });
  return response;
}

/**
 * Formate le texte Gemini en HTML lisible.
 */
function formatResponseHTML(text) {
  if (!text) return "";
  // 1) Échapper le HTML (la réponse du modèle n'est pas fiable)
  const esc = String(text).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inline = l => l
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, "$1<em>$2</em>");
  // 2) Markdown simple ligne par ligne (titres, puces, gras, italique)
  return esc.split(/\r?\n/).map(line => {
    const h = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (h) return `<div style="font-weight:700;color:var(--accent-cyan);margin:8px 0 4px">${inline(h[1])}</div>`;
    const b = line.match(/^\s*[-*•]\s+(.*)$/);
    if (b) return `<div style="margin-left:10px">• ${inline(b[1])}</div>`;
    if (/^\s*-{3,}\s*$/.test(line)) return "<hr>";
    return line.trim() ? `${inline(line)}<br>` : "<br>";
  }).join("");
}

window.GeminiAI = {
  setApiKey, loadApiKey, hasApiKey,
  setModel, loadModel, getModel, testConnection,
  analyzeSPC, analyzePareto, analyzeAMDEC, globalDiagnosis,
  suggestIshikawaCauses,
  sendChatMessage, resetChat, getChatLength,
  formatResponseHTML,
};
