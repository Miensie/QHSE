/**
 * geminiAI.js — Intégration Google Gemini API (AI Studio)
 * Analyse SPC, Pareto, AMDEC + Chat QHSE interactif
 */
"use strict";

const GEMINI_CONFIG = {
  endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
  model:    "gemini-1.5-flash",
  maxTokens: 2048,
  storageKey: "qhse_gemini_key",
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

// ─── Requête Gemini ───────────────────────────────────────────────────────────

async function _callGemini(systemPrompt, userContent, jsonMode = false) {
  if (!_apiKey) throw new Error("Clé API Gemini non configurée. Renseignez-la dans l'onglet IA.");

  const body = {
    contents: [
      { role: "user", parts: [{ text: systemPrompt + "\n\n" + userContent }] }
    ],
    generationConfig: {
      maxOutputTokens: GEMINI_CONFIG.maxTokens,
      temperature: jsonMode ? 0.1 : 0.4,
    },
  };

  const resp = await fetch(`${GEMINI_CONFIG.endpoint}?key=${_apiKey}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Erreur API ${resp.status}`);
  }

  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  if (jsonMode) {
    const clean = text.replace(/```json|```/g, "").trim();
    try { return JSON.parse(clean); } catch { return { raw: text }; }
  }
  return text;
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
  const violText = violations.length === 0
    ? "Aucune violation des règles de Nelson détectée."
    : violations.map(v => `- ${v.label}`).join("\n");

  const prompt = `
Analyse cette carte de contrôle ${chartType} :

STATISTIQUES DU PROCÉDÉ :
- N points : ${stats.n}
- Moyenne (X̄) : ${stats.mean?.toFixed(4)}
- Écart-type estimé (σ) : ${stats.sigma?.toFixed(4) ?? "n/a"}
- UCL : ${stats.uclX?.toFixed(4) ?? stats.ucl?.toFixed(4)}
- LCL : ${stats.lclX?.toFixed(4) ?? stats.lcl?.toFixed(4)}
- Points hors contrôle : ${violations.filter(v => v.rule === 1).length}

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
- Cp : ${kpis.cp?.toFixed(3) ?? "—"} | Cpk : ${kpis.cpk?.toFixed(3) ?? "—"}
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

  return _callGemini(SYSTEM_QHSE, prompt, true);
}

// ─── Chat interactif ──────────────────────────────────────────────────────────

function resetChat() { _chatHistory = []; }
function getChatLength() { return _chatHistory.length; }

async function sendChatMessage(message, context = {}) {
  const contextText = Object.keys(context).length > 0
    ? `\nContexte des données actuelles : ${JSON.stringify(context, null, 2)}\n`
    : "";

  const systemWithContext = SYSTEM_QHSE + contextText;

  // Construire l'historique
  _chatHistory.push({ role: "user", text: message });
  const histText = _chatHistory
    .slice(-6) // 6 derniers échanges max
    .map(m => `${m.role === "user" ? "Utilisateur" : "Assistant"}: ${m.text}`)
    .join("\n");

  const response = await _callGemini(systemWithContext, histText);
  _chatHistory.push({ role: "assistant", text: response });
  return response;
}

/**
 * Formate le texte Gemini en HTML lisible.
 */
function formatResponseHTML(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>")
    .replace(/^\d+\.\s+/gm, "<br>• ")
    .replace(/^[-•]\s+/gm, "• ");
}

window.GeminiAI = {
  setApiKey, loadApiKey, hasApiKey,
  analyzeSPC, analyzePareto, analyzeAMDEC, globalDiagnosis,
  suggestIshikawaCauses,
  sendChatMessage, resetChat, getChatLength,
  formatResponseHTML,
};
