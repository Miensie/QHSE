/**
 * ============================================================
 * hypothesis.js — Tests statistiques qualité
 * Tests : t de Student, F de Fisher, Chi², Mann-Whitney
 * Utilisés pour : comparaison de moyennes, variances, lots…
 * ============================================================
 */
"use strict";

const HypothesisTests = (() => {

  // ─── Test t de Student (1 ou 2 échantillons) ─────────────────────

  /**
   * Test t à 1 échantillon (vs valeur cible μ₀)
   * H₀ : μ = μ₀
   */
  function tTest1Sample(data, mu0, alpha = 0.05) {
    const n    = data.length;
    const xbar = Statistics.mean(data);
    const s    = Statistics.stdDev(data);
    const se   = s / Math.sqrt(n);
    const t    = (xbar - mu0) / se;
    const df   = n - 1;
    const pval = 2 * (1 - tCDF(Math.abs(t), df));  // bilatéral

    return {
      test:    "t 1 échantillon",
      H0:      `μ = ${mu0}`,
      t:       +t.toFixed(4),
      df,
      pValue:  +pval.toFixed(4),
      alpha,
      reject:  pval < alpha,
      conclusion: pval < alpha
        ? `Rejet H₀ (p=${pval.toFixed(4)} < α=${alpha}) — La moyenne differ significativement de ${mu0}`
        : `Non-rejet H₀ (p=${pval.toFixed(4)} ≥ α=${alpha}) — Pas de différence significative`,
      stats: { n, mean: +xbar.toFixed(4), std: +s.toFixed(4) },
    };
  }

  /**
   * Test t à 2 échantillons indépendants (Welch)
   * H₀ : μ₁ = μ₂
   */
  function tTest2Samples(data1, data2, alpha = 0.05) {
    const n1  = data1.length, n2  = data2.length;
    const x1  = Statistics.mean(data1), x2  = Statistics.mean(data2);
    const s1  = Statistics.stdDev(data1), s2  = Statistics.stdDev(data2);
    const se  = Math.sqrt(s1 ** 2 / n1 + s2 ** 2 / n2);
    const t   = (x1 - x2) / se;

    // Degrés de liberté Welch–Satterthwaite
    const df  = (s1**2/n1 + s2**2/n2)**2 /
                ((s1**2/n1)**2/(n1-1) + (s2**2/n2)**2/(n2-1));
    const pval = 2 * (1 - tCDF(Math.abs(t), Math.floor(df)));

    return {
      test:   "t de Welch (2 échantillons)",
      H0:     "μ₁ = μ₂",
      t:      +t.toFixed(4),
      df:     +df.toFixed(1),
      pValue: +pval.toFixed(4),
      alpha,
      reject: pval < alpha,
      diff:   +(x1 - x2).toFixed(4),
      conclusion: pval < alpha
        ? `Rejet H₀ — Différence significative (Δ = ${(x1-x2).toFixed(4)}, p = ${pval.toFixed(4)})`
        : `Non-rejet H₀ — Pas de différence significative (p = ${pval.toFixed(4)})`,
      stats: {
        n1, n2,
        mean1: +x1.toFixed(4), mean2: +x2.toFixed(4),
        std1:  +s1.toFixed(4), std2:  +s2.toFixed(4),
      },
    };
  }

  // ─── Test F de Fisher (comparaison de variances) ──────────────────

  /**
   * H₀ : σ₁² = σ₂²
   */
  function fTest(data1, data2, alpha = 0.05) {
    const s1 = Statistics.stdDev(data1), s2 = Statistics.stdDev(data2);
    const F  = s1 ** 2 / s2 ** 2;
    const d1 = data1.length - 1, d2 = data2.length - 1;
    const Fcrit = fCritical(alpha / 2, d1, d2);

    return {
      test:      "Test F (variances)",
      H0:        "σ₁² = σ₂²",
      F:         +F.toFixed(4),
      Fcrit:     +Fcrit.toFixed(4),
      df1:       d1, df2: d2,
      reject:    F > Fcrit || F < 1 / Fcrit,
      conclusion: (F > Fcrit || F < 1/Fcrit)
        ? `Rejet H₀ — Les variances sont significativement différentes (F = ${F.toFixed(3)})`
        : `Non-rejet H₀ — Pas de différence significative de variance (F = ${F.toFixed(3)})`,
      stats: {
        var1: +(s1**2).toFixed(6), var2: +(s2**2).toFixed(6),
        std1: +s1.toFixed(4),      std2: +s2.toFixed(4),
        ratio: +F.toFixed(4),
      },
    };
  }

  // ─── Test du Chi² (conformité distribution / tableau de contingence) ──

  /**
   * Test Chi² d'adéquation (valeurs observées vs attendues)
   */
  function chiSquareGoodness(observed, expected, alpha = 0.05) {
    if (observed.length !== expected.length) throw new Error("Tableaux de tailles différentes");
    const chi2 = observed.reduce((s, o, i) => s + (o - expected[i]) ** 2 / expected[i], 0);
    const df   = observed.length - 1;
    const pval = 1 - chi2CDF(chi2, df);

    return {
      test:      "Chi² d'adéquation",
      H0:        "La distribution observée suit la distribution théorique",
      chi2:      +chi2.toFixed(4),
      df,
      pValue:    +pval.toFixed(4),
      alpha,
      reject:    pval < alpha,
      conclusion: pval < alpha
        ? `Rejet H₀ (p = ${pval.toFixed(4)}) — Distribution non conforme`
        : `Non-rejet H₀ (p = ${pval.toFixed(4)}) — Distribution conforme`,
    };
  }

  // ─── ANOVA à 1 facteur ────────────────────────────────────────────

  /**
   * H₀ : toutes les moyennes de groupes sont égales
   * @param {number[][]} groups - Tableau de groupes [[g1_v1,...], [g2_v1,...], ...]
   */
  function anova1way(groups, alpha = 0.05) {
    const k     = groups.length;                   // nb de groupes
    const nTot  = groups.reduce((s, g) => s + g.length, 0);
    const allVals = groups.flat();
    const grandMean = Statistics.mean(allVals);

    // SS entre groupes
    const SSb = groups.reduce((s, g) => {
      const gm = Statistics.mean(g);
      return s + g.length * (gm - grandMean) ** 2;
    }, 0);

    // SS intra-groupes
    const SSw = groups.reduce((s, g) => {
      const gm = Statistics.mean(g);
      return s + g.reduce((ss, v) => ss + (v - gm) ** 2, 0);
    }, 0);

    const dfb = k - 1, dfw = nTot - k;
    const MSb = SSb / dfb, MSw = SSw / dfw;
    const F   = MSb / MSw;
    const Fcrit = fCritical(alpha, dfb, dfw);

    return {
      test:   "ANOVA à 1 facteur",
      H0:     "Toutes les moyennes de groupes sont égales",
      F:      +F.toFixed(4), Fcrit: +Fcrit.toFixed(4),
      dfb, dfw,
      SSb: +SSb.toFixed(4), SSw: +SSw.toFixed(4),
      MSb: +MSb.toFixed(4), MSw: +MSw.toFixed(4),
      etaSq: +(SSb / (SSb + SSw)).toFixed(4),    // Taille d'effet η²
      reject: F > Fcrit,
      conclusion: F > Fcrit
        ? `Rejet H₀ (F = ${F.toFixed(3)} > F_crit = ${Fcrit.toFixed(3)}) — Différences significatives entre groupes`
        : `Non-rejet H₀ — Pas de différence significative entre groupes`,
      groupStats: groups.map((g, i) => ({
        group: `G${i+1}`, n: g.length,
        mean:  +Statistics.mean(g).toFixed(4),
        std:   +Statistics.stdDev(g).toFixed(4),
      })),
    };
  }

  // ─── Fonctions CDF approximées ───────────────────────────────────

  // CDF t-Student (approximation)
  function tCDF(t, df) {
    const x = df / (df + t * t);
    return 1 - 0.5 * incompleteBeta(x, df / 2, 0.5);
  }

  // CDF Chi² (approximation)
  function chi2CDF(x, df) {
    return incompleteGamma(df / 2, x / 2);
  }

  // F critique (approximation table)
  function fCritical(alpha, d1, d2) {
    // Approximation simplifiée (pour d2 > 30)
    return Math.exp(
      (Math.log(d2) - Math.log(d1)) * 0.5
      + 1.96 * Math.sqrt(2 / d1 + 2 / d2)
    );
  }

  // Fonction Bêta incomplète (approximation Lentz)
  function incompleteBeta(x, a, b) {
    if (x === 0) return 0;
    if (x === 1) return 1;
    const lbeta = lgamma(a) + lgamma(b) - lgamma(a + b);
    const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;
    return front * betaCF(x, a, b);
  }

  function betaCF(x, a, b) {
    const maxIter = 100, eps = 3e-7;
    let c = 1, d = 1 - (a + b) * x / (a + 1);
    d = Math.abs(d) < 1e-30 ? 1e-30 : d;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= maxIter; m++) {
      let aa = m * (b - m) * x / ((a + 2*m - 1) * (a + 2*m));
      d = 1 + aa * d;
      c = 1 + aa / c;
      d = Math.abs(d) < 1e-30 ? 1e-30 : d;
      c = Math.abs(c) < 1e-30 ? 1e-30 : c;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (a + b + m) * x / ((a + 2*m) * (a + 2*m + 1));
      d = 1 + aa * d; c = 1 + aa / c;
      d = Math.abs(d) < 1e-30 ? 1e-30 : d;
      c = Math.abs(c) < 1e-30 ? 1e-30 : c;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < eps) break;
    }
    return h;
  }

  function lgamma(z) {
    const c = [76.18009172947146,-86.50532032941677,24.01409824083091,
                -1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];
    let x = z, y = z, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    c.forEach((ci, i) => { y += 1; ser += ci / y; });
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  function incompleteGamma(a, x) {
    if (x < 0) return 0;
    if (x === 0) return 0;
    let sum = 1 / a, term = 1 / a;
    for (let n = 1; n < 100; n++) {
      term *= x / (a + n);
      sum  += term;
      if (Math.abs(term) < 1e-8 * Math.abs(sum)) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }

  return { tTest1Sample, tTest2Samples, fTest, chiSquareGoodness, anova1way };

})();

window.HypothesisTests = HypothesisTests;
