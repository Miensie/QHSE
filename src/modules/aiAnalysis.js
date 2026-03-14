/**
 * ============================================================
 * aiAnalysis.js — Module IA multi-fournisseurs
 * Supporte : Claude (Anthropic), Gemini (Google), OpenAI
 * ============================================================
 */
"use strict";

const QualityAI = (() => {

  let _apiKey      = "";
  let _provider    = "claude";
  let _chatHistory = [];

  const ENDPOINTS = {
    claude: "https://api.anthropic.com/v1/messages",
    gemini: "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
    openai: "https://api.openai.com/v1/chat/completions",
  };

  const SYSTEM_PROMPT = `Tu es un expert en qualité industrielle certifié Six Sigma Black Belt et ISO 9001 Lead Auditor.
Tu analyses des données qualité issues d'un complément Excel QHSE.
Tu réponds toujours en français, avec précision technique et de manière concise.
Pour les analyses, tu fournis :
- Un diagnostic clair du procédé
- Les violations des règles de Nelson/Western Electric si présentes
- Les indices de capabilité (Cp, Cpk) interprétés
- Les causes probables de dérive
- Des recommandations d'actions correctives concrètes et chiffrées
- Les référentiels applicables (ISO 9001, IATF 16949, ISO 13485, etc.)
Tu structures tes réponses avec des sections claires.`;

  // ─── Configuration ────────────────────────────────────────────────

  function setConfig(apiKey, provider) {
    _apiKey   = apiKey;
    _provider = provider || "claude";
  }

  function hasApiKey() { return !!_apiKey?.trim(); }

  function resetChat() {
    _chatHistory = [];
  }

  function getChatLength() { return _chatHistory.length; }

  // ─── Analyse complète du procédé ─────────────────────────────────

  async function analyzeProcedure(spcResult, stats, options = {}) {
    if (!hasApiKey()) throw new Error("Clé API non configurée");

    const prompt = buildAnalysisPrompt(spcResult, stats, options);
    const raw    = await callAPI(prompt, false);
    return parseAnalysisResponse(raw);
  }

  function buildAnalysisPrompt(spcResult, stats, options) {
    const c1 = spcResult?.chart1 || {};
    const c2 = spcResult?.chart2 || {};

    return `## Analyse SPC — Procédé qualité

**Entreprise** : ${options.entreprise || "—"}
**Procédé**    : ${options.process || "—"}
**Type carte** : ${spcResult?.type || "imr"}
**N mesures**  : ${stats?.n || "—"}

### Statistiques descriptives
- Moyenne (x̄) : ${stats?.mean ?? "—"}
- Écart-type (σ) : ${stats?.std ?? "—"}
- Min / Max : ${stats?.min ?? "—"} / ${stats?.max ?? "—"}
- Asymétrie (skewness) : ${stats?.skew ?? "—"}
- Kurtosis : ${stats?.kurt ?? "—"}

### Carte de contrôle principale (${c1.title || "X"})
- Ligne centrale (CL) : ${c1.CL?.toFixed(4) ?? "—"}
- Limite supérieure (UCL) : ${c1.UCL?.toFixed(4) ?? "—"}
- Limite inférieure (LCL) : ${c1.LCL?.toFixed(4) ?? "—"}
- Points hors contrôle (OOC) : ${c1.ooc?.count ?? 0}
- Violations Nelson : ${c1.ooc?.violations?.map(v => `Règle ${v.rule} (${v.desc})`).join("; ") || "Aucune"}

${c2.title ? `### Carte secondaire (${c2.title})
- CL: ${c2.CL?.toFixed(4) ?? "—"} | UCL: ${c2.UCL?.toFixed(4) ?? "—"} | OOC: ${c2.ooc?.count ?? 0}` : ""}

${options.usl && options.lsl ? `### Limites de spécification
- USL : ${options.usl} | LSL : ${options.lsl}
- Cp  : ${options.capability?.cp ?? "—"} | Cpk : ${options.capability?.cpk ?? "—"}
- Niveau sigma : ${options.capability?.sigmaLevel ?? "—"}` : ""}

### Question
Effectue une analyse complète de ce procédé. Réponds en JSON avec la structure suivante :
{
  "statut": "sous_controle" | "hors_controle" | "derive",
  "synthese": "texte résumé",
  "diagnostic": ["point 1", "point 2", ...],
  "causes_probables": ["cause 1", "cause 2", ...],
  "actions": [
    { "priorite": "haute"|"moyenne"|"faible", "action": "...", "delai": "...", "indicateur": "..." }
  ],
  "conclusion": "texte final"
}`;
  }

  function parseAnalysisResponse(raw) {
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch {}
    // Fallback texte brut
    return { synthese: raw, diagnostic: [], causes_probables: [], actions: [], statut: "inconnu" };
  }

  // ─── Chat interactif ─────────────────────────────────────────────

  async function sendChatMessage(userMessage, context = {}) {
    if (!hasApiKey()) throw new Error("Clé API non configurée");

    const contextMsg = _chatHistory.length === 0
      ? buildContextPrefix(context)
      : "";

    const fullMessage = contextMsg
      ? `${contextMsg}\n\nQuestion : ${userMessage}`
      : userMessage;

    _chatHistory.push({ role: "user", content: fullMessage });

    const response = await callAPI(fullMessage, true);
    _chatHistory.push({ role: "assistant", content: response });

    return response;
  }

  function buildContextPrefix(ctx) {
    if (!ctx || Object.keys(ctx).length === 0) return "";
    return `[Contexte procédé actuel]
- N mesures : ${ctx.n || "—"}
- Moyenne : ${ctx.mean || "—"} | Sigma : ${ctx.std || "—"}
- Points OOC : ${ctx.ooc || 0}
- Cp : ${ctx.cp || "—"} | Cpk : ${ctx.cpk || "—"}`;
  }

  // ─── Génération de suggestions Ishikawa ──────────────────────────

  async function suggestIshikawaCauses(effet, context = "") {
    if (!hasApiKey()) throw new Error("Clé API non configurée");

    const prompt = `Tu es expert qualité Six Sigma. 
Génère un diagramme Ishikawa (5M) pour le problème suivant :
**Effet/Problème** : ${effet}
${context ? `**Contexte** : ${context}` : ""}

Réponds UNIQUEMENT en JSON (sans markdown) avec cette structure :
{
  "methode":     ["cause 1", "cause 2", "cause 3"],
  "machine":     ["cause 1", "cause 2", "cause 3"],
  "matiere":     ["cause 1", "cause 2", "cause 3"],
  "maindoeuvre": ["cause 1", "cause 2", "cause 3"],
  "milieu":      ["cause 1", "cause 2", "cause 3"],
  "mesure":      ["cause 1", "cause 2", "cause 3"]
}`;

    const raw = await callAPI(prompt, false);
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch {}
    return null;
  }

  // ─── Génération rapport qualité ──────────────────────────────────

  async function generateQualityReport(allData) {
    if (!hasApiKey()) throw new Error("Clé API non configurée");

    const prompt = `Génère un rapport qualité professionnel complet en HTML pour les données suivantes :

${JSON.stringify(allData, null, 2)}

Le rapport doit inclure :
1. Résumé exécutif
2. Analyse du procédé
3. Points critiques identifiés
4. Plan d'actions correctives
5. Recommandations ISO 9001

Réponds en HTML propre, prêt à être inséré dans un document.`;

    return callAPI(prompt, false);
  }

  // ─── Appels API multi-fournisseurs ───────────────────────────────

  async function callAPI(prompt, withHistory = false) {
    switch (_provider) {
      case "claude":  return _callClaude(prompt, withHistory);
      case "gemini":  return _callGemini(prompt);
      case "openai":  return _callOpenAI(prompt, withHistory);
      default: throw new Error(`Fournisseur IA inconnu : ${_provider}`);
    }
  }

  async function _callClaude(prompt, withHistory) {
    const messages = withHistory && _chatHistory.length > 1
      ? _chatHistory.slice(-10)   // 10 derniers échanges max
      : [{ role: "user", content: prompt }];

    const resp = await fetch(ENDPOINTS.claude, {
      method: "POST",
      headers: {
        "Content-Type":         "application/json",
        "x-api-key":            _apiKey,
        "anthropic-version":    "2023-06-01",
        "anthropic-dangerous-direct-browser-ipc-access": "true",
      },
      body: JSON.stringify({
        model:      "claude-opus-4-6",
        max_tokens: 1500,
        system:     SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Claude API ${resp.status}`);
    }
    const data = await resp.json();
    return data.content?.[0]?.text || "";
  }

  async function _callGemini(prompt) {
    const url  = `${ENDPOINTS.gemini}?key=${_apiKey}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${prompt}` }] }],
        generationConfig: { maxOutputTokens: 1500, temperature: 0.3 },
      }),
    });

    if (!resp.ok) throw new Error(`Gemini API ${resp.status}`);
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  async function _callOpenAI(prompt, withHistory) {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(withHistory && _chatHistory.length > 1 ? _chatHistory.slice(-8) : []),
      { role: "user", content: prompt },
    ];

    const resp = await fetch(ENDPOINTS.openai, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${_apiKey}`,
      },
      body: JSON.stringify({
        model:      "gpt-4o-mini",
        messages,
        max_tokens: 1500,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) throw new Error(`OpenAI API ${resp.status}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || "";
  }

  // ─── Formatage HTML pour l'UI ─────────────────────────────────────

  function formatResponseHTML(text) {
    if (!text) return "";
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/^#{1,3}\s+(.*)/gm, '<div style="font-weight:700;color:var(--accent-cyan);margin:8px 0 4px">$1</div>')
      .replace(/^[-•]\s+(.*)/gm, '<li style="margin-left:12px">$1</li>')
      .replace(/\n{2,}/g, "<br><br>")
      .replace(/\n/g, "<br>");
  }

  // ─── Export ──────────────────────────────────────────────────────

  return {
    setConfig, hasApiKey, resetChat, getChatLength,
    analyzeProcedure, sendChatMessage,
    suggestIshikawaCauses, generateQualityReport,
    formatResponseHTML,
  };

})();

window.QualityAI = QualityAI;
