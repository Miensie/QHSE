# QHSE Analyzer Pro — Complément Excel

Complément Office Add-in pour l'analyse intelligente de la qualité industrielle.

## Fonctionnalités
- **Pareto** : Analyse 80/20 avec classement ABC
- **Ishikawa** : Diagramme causes-effets 6M + suggestions IA
- **AMDEC** : Calcul RPN avec priorisation des risques
- **Cartes SPC** : X̄-R, I-MR, p, c + 8 règles de Nelson
- **Dashboard** : Cp, Cpk, taux NC, KPIs en temps réel
- **IA Gemini** : Analyse, diagnostic et recommandations
- **Rapport** : Export automatique dans Excel

## Installation

### Prérequis
- Node.js >= 18
- Microsoft Excel (Desktop ou Online)

### 1. Installer les dépendances
```bash
npm install
```

### 2. Installer les certificats HTTPS (une fois)
```bash
npx office-addin-dev-certs install --machine
```

### 3. Démarrer le serveur de développement
```bash
npm start
```

### 4. Charger le complément dans Excel
1. Ouvrir Excel
2. **Fichier → Options → Centre de gestion de la confidentialité → Paramètres → Catalogues de compléments approuvés**
3. Ajouter : `https://localhost:3000/manifest.xml`
4. Redémarrer Excel
5. **Insertion → Mes compléments → QHSE Analyzer Pro**

## Configuration Gemini AI
1. Aller sur [aistudio.google.com](https://aistudio.google.com)
2. Créer une clé API gratuite
3. Dans l'onglet **IA** du complément, coller la clé et cliquer 💾

## Déploiement GitHub Pages

```bash
# Build production
npm run build

# Initialiser git
git init
git add .
git commit -m "QHSE Analyzer Pro v2.0"
git branch -M main
git remote add origin https://github.com/miensie/QHSE.git
git push -u origin main
```

Activer GitHub Pages sur le dossier `/dist` dans les paramètres du dépôt.
Puis mettre à jour `manifest.xml` avec votre URL GitHub Pages.

## Structure du projet
```
qhse-addin/
├── manifest.xml              # Manifeste Office Add-in
├── package.json
├── webpack.config.js
├── src/
│   ├── taskpane/
│   │   ├── taskpane.html     # Interface utilisateur
│   │   ├── taskpane.css      # Styles (thème salle de contrôle)
│   │   └── taskpane.js       # Orchestrateur principal
│   ├── modules/
│   │   ├── excelBridge.js    # Interface Office.js / Excel
│   │   ├── statistics.js     # Fonctions statistiques qualité
│   │   ├── controlCharts.js  # Cartes SPC + règles de Nelson
│   │   └── geminiAI.js       # Intégration API Gemini
│   └── assets/
└── README.md
```
