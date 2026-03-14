/**
 * excelBridge.js — Interface avec Office.js / Excel
 * Lecture, écriture et création de feuilles
 */
"use strict";

// ─── Lecture des données ───────────────────────────────────────────────────────

/**
 * Détecte automatiquement la plage utilisée dans la feuille active.
 */
async function detectUsedRange() {
  return Excel.run(async (ctx) => {
    const sheet = ctx.workbook.worksheets.getActiveWorksheet();
    const range = sheet.getUsedRange();
    range.load("address");
    await ctx.sync();
    return range.address.split("!").pop();
  });
}

/**
 * Lit les données d'une plage et retourne { headers, rows, numericCols, textCols }
 */
async function readRange(rangeAddress, hasHeaders = true) {
  return Excel.run(async (ctx) => {
    const sheet  = ctx.workbook.worksheets.getActiveWorksheet();
    const range  = sheet.getRange(rangeAddress);
    range.load("values, rowCount, columnCount");
    await ctx.sync();

    const values = range.values;
    if (!values || values.length === 0) throw new Error("Plage vide");

    let headers = [];
    let rows    = [];

    if (hasHeaders) {
      headers = values[0].map((h, i) => String(h || `Col${i + 1}`).trim());
      rows    = values.slice(1);
    } else {
      headers = values[0].map((_, i) => `Col${i + 1}`);
      rows    = values;
    }

    // Détecter les types de colonnes
    const numericCols = [];
    const textCols    = [];

    headers.forEach((h, colIdx) => {
      const sampleValues = rows
        .slice(0, 20)
        .map(r => r[colIdx])
        .filter(v => v !== null && v !== "");

      const numericCount = sampleValues.filter(v => !isNaN(parseFloat(v))).length;
      if (sampleValues.length > 0 && numericCount / sampleValues.length >= 0.7) {
        numericCols.push({ index: colIdx, name: h });
      } else {
        textCols.push({ index: colIdx, name: h });
      }
    });

    return { headers, rows, numericCols, textCols, totalRows: rows.length };
  });
}

/**
 * Extrait une colonne numérique sous forme de nombre[].
 */
function extractNumericColumn(rows, colIndex) {
  return rows
    .map(r => parseFloat(r[colIndex]))
    .filter(v => !isNaN(v));
}

/**
 * Extrait une colonne texte sous forme de string[].
 */
function extractTextColumn(rows, colIndex) {
  return rows
    .map(r => String(r[colIndex] || "").trim())
    .filter(v => v !== "");
}

// ─── Écriture des résultats ────────────────────────────────────────────────────

/**
 * Écrit un tableau 2D dans une feuille cible (la crée si absente).
 */
async function writeTable(sheetName, startCell, data, title = null) {
  return Excel.run(async (ctx) => {
    const wb = ctx.workbook;

    // Obtenir ou créer la feuille
    let sheet;
    try {
      sheet = wb.worksheets.getItem(sheetName);
      await ctx.sync();
    } catch {
      sheet = wb.worksheets.add(sheetName);
      await ctx.sync();
    }

    let row = parseInt(startCell.replace(/[A-Z]/g, "")) || 1;
    const col = startCell.replace(/[0-9]/g, "") || "A";

    // Titre optionnel
    if (title) {
      const titleCell = sheet.getRange(`${col}${row}`);
      titleCell.values = [[title]];
      titleCell.format.font.bold  = true;
      titleCell.format.font.size  = 12;
      titleCell.format.font.color = "#39D0D8";
      row++;
    }

    // Données
    if (data.length > 0) {
      const endCol = String.fromCharCode(col.charCodeAt(0) + data[0].length - 1);
      const range  = sheet.getRange(`${col}${row}:${endCol}${row + data.length - 1}`);
      range.values = data;

      // Style en-tête (première ligne = en-tête)
      const headerRange = sheet.getRange(`${col}${row}:${endCol}${row}`);
      headerRange.format.fill.color    = "#161B22";
      headerRange.format.font.bold     = true;
      headerRange.format.font.color    = "#8B949E";
      headerRange.format.font.name     = "Courier New";
      headerRange.format.font.size     = 9;

      // Adapter les largeurs
      const fullRange = sheet.getRange(`${col}${row}:${endCol}${row + data.length - 1}`);
      fullRange.format.autofitColumns();
    }

    sheet.activate();
    await ctx.sync();
  });
}

/**
 * Crée le rapport SPC dans Excel avec un onglet dédié.
 */
async function writeSPCResults(chartType, stats, points) {
  const sheetName = `SPC_${chartType}_${new Date().toISOString().slice(0,10)}`;
  // UCL/LCL ont des noms différents selon le type de carte
  const ucl = stats.uclX ?? stats.uclI ?? stats.ucl ?? 0;
  const lcl = stats.lclX ?? stats.lclI ?? stats.lcl ?? 0;
  const headers = ["N°", "Valeur", "Moyenne", "UCL", "LCL", "Statut"];
  const data    = [headers, ...points.map((p, i) => [
    i + 1,
    parseFloat(p.value).toFixed(4),
    parseFloat(stats.mean).toFixed(4),
    parseFloat(ucl).toFixed(4),
    parseFloat(lcl).toFixed(4),
    p.outOfControl ? "HORS CONTRÔLE" : "OK",
  ])];
  await writeTable(sheetName, "A1", data, `Carte ${chartType} — ${new Date().toLocaleString("fr-FR")}`);
}

/**
 * Crée l'onglet AMDEC dans Excel.
 */
async function writeAMDEC(rows) {
  const headers = ["Fonction", "Mode défaillance", "Effet", "Cause", "G", "O", "D", "RPN", "Criticité", "Action corrective"];
  const data    = [headers, ...rows.map(r => [
    r.fonction, r.mode, r.effet, r.cause,
    r.g, r.o, r.d, r.rpn,
    r.rpn >= 100 ? "CRITIQUE" : r.rpn >= 50 ? "MAJEUR" : "MINEUR",
    r.action
  ])];
  await writeTable("AMDEC", "A1", data, "Tableau AMDEC — QHSE Analyzer Pro");
}

/**
 * Crée l'onglet Pareto dans Excel.
 */
async function writePareto(rows) {
  const headers = ["Cause", "Fréquence", "% Fréquence", "% Cumulé", "Classe"];
  const data    = [headers, ...rows.map(r => [
    r.cause, r.freq, r.pct.toFixed(1) + "%", r.cumul.toFixed(1) + "%", r.classe
  ])];
  await writeTable("Pareto", "A1", data, "Analyse de Pareto — QHSE Analyzer Pro");
}

/**
 * Crée un onglet Dashboard avec les KPIs.
 */
async function writeDashboard(kpis) {
  const data = [
    ["Indicateur", "Valeur", "Unité", "Statut"],
    ["Taux de NC", kpis.tauxNC.toFixed(2), "%", kpis.tauxNC < 5 ? "✅ OK" : "⚠ Attention"],
    ["Nb total défauts", kpis.nbDefauts, "—", "—"],
    ["Cp", kpis.cp?.toFixed(3) ?? "—", "—", kpis.cp >= 1.33 ? "✅ Capable" : "⚠ Non capable"],
    ["Cpk", kpis.cpk?.toFixed(3) ?? "—", "—", kpis.cpk >= 1.33 ? "✅ Capable" : "⚠ Non capable"],
    ["Points hors contrôle", kpis.pointsHC, "—", kpis.pointsHC === 0 ? "✅ Sous contrôle" : "⚠ Dérives"],
    ["Moyenne", kpis.mean?.toFixed(4) ?? "—", "", ""],
    ["Écart-type", kpis.sigma?.toFixed(4) ?? "—", "", ""],
  ];
  await writeTable("Dashboard_QHSE", "A1", data, `Dashboard Qualité — ${new Date().toLocaleDateString("fr-FR")}`);
}

window.ExcelBridge = {
  detectUsedRange,
  readRange,
  extractNumericColumn,
  extractTextColumn,
  writeTable,
  writeSPCResults,
  writeAMDEC,
  writePareto,
  writeDashboard,
};
