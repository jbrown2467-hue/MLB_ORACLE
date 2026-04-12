# ⚾ MLB Oracle — Advanced AI Prediction Model

A browser-based MLB win probability engine powered by a multi-factor statistical model and Claude AI analysis. No build tools, no dependencies — just open `index.html`.

![MLB Oracle Screenshot](https://img.shields.io/badge/season-2026-blue?style=flat-square) ![JS](https://img.shields.io/badge/vanilla-JS-yellow?style=flat-square) ![Claude](https://img.shields.io/badge/AI-Claude%20Sonnet-blueviolet?style=flat-square)

---

## Features

| Tab | What it does |
|-----|-------------|
| 🎯 **Predictions** | Pre-game win probabilities for every scheduled game (today + 2 days) |
| 🔴 **Live Games** | In-game WPA-style probability that updates with score & inning |
| 🧠 **Model Engine** | AL/NL power rankings + live deep-dive stats for in-progress games |
| 🏆 **Standings** | Full 30-team table, sortable by any column |
| 📊 **Accuracy Log** | Model vs reality tracker across recent games |

**Other features:**
- 60-second auto-refresh with visual countdown progress bar
- Claude-powered AI analysis on every game card (click **AI Analysis**)
- Moneyline odds derived from model probability
- Model signal chips (recent form, run diff, home field)
- Confidence ratings: STRONG / LIKELY / TOSS-UP

---

## Model Architecture

### Pre-game probability (`advancedProb`)

```
P(home wins) =
  Log5(pH, pA)        × 0.58   ← Bill James Log5 base rate
+ (formH − formA)     × 0.12   ← recency-weighted last-5 form
+ (rdiffH − rdiffA)   × 0.08   ← run differential gap
+ 0.022                         ← home field advantage (~54 % baseline)

clamped to [0.12, 0.90]
```

### Live in-game probability (`liveGameProb`)

```
P(home wins, live) =
  advancedProb(home, away)
+ scoreDiff × 0.11 × leverage   ← WPA-style score adjustment
+ (awayERA − homeERA) × 0.015   ← live pitching edge

leverage = 1 − remainingFraction × 0.6
clamped to [0.03, 0.97]
```

### Power Rating (`powerRating`) — 0 to 100 scale

```
Power = W%       × 0.30
      + formScore × 0.35   ← recency-weighted (weights: 5,4,3,2,1)
      + rdiffScore × 0.35   ← normalized run diff
```

---

## File Structure

```
mlb-oracle/
├── index.html        ← App shell + all HTML markup
├── css/
│   └── style.css     ← All styles (design tokens, components, responsive)
├── js/
│   └── model.js      ← All data + model logic + renderers (12 sections, JSDoc)
└── README.md
```

---

## Quick Start

### Option A — Open locally
```bash
git clone https://github.com/YOUR_USERNAME/mlb-oracle.git
cd mlb-oracle
open index.html   # macOS
# or: start index.html  (Windows)
# or: xdg-open index.html  (Linux)
```

### Option B — GitHub Pages
1. Push to GitHub
2. Go to **Settings → Pages**
3. Set source to **main / root**
4. Visit `https://YOUR_USERNAME.github.io/mlb-oracle`

> **Note:** The AI Analysis feature calls the Anthropic API directly from the browser. See the API Key section below.

---

## AI Analysis Setup

The Claude-powered game analysis calls `https://api.anthropic.com/v1/messages` directly.

In the current build this works because the Claude.ai environment injects the API key. **For your own deployment:**

### Option 1 — Environment variable (recommended for private repos)
Add a simple proxy server (e.g. a Cloudflare Worker or Vercel Edge Function) that reads `ANTHROPIC_API_KEY` from env and forwards requests. Update the fetch URL in `model.js §4`:

```js
// Replace this:
const res = await fetch('https://api.anthropic.com/v1/messages', { ... });

// With your proxy:
const res = await fetch('https://your-worker.workers.dev/analyze', { ... });
```

### Option 2 — User-supplied key (public repos)
Add an input field to `index.html` and read the key at runtime:
```js
const API_KEY = localStorage.getItem('anthropic_key') || prompt('Enter Anthropic API key:');
headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' }
```

---

## Keeping Data Current

All game data lives in `js/model.js`. Three objects need updating daily:

| Object | Update frequency | Where to get it |
|--------|-----------------|-----------------|
| `STANDINGS_RAW` | Daily (after games) | MLB.com standings |
| `RECENT_FORM` | Daily | Last 5 game results per team |
| `RUN_DIFF` | Weekly | Season run differential |
| `LIVE_GAMES` | Game day | Live scores API / manual |
| `SCHEDULED` | Game day | MLB schedule |
| `RECENT_RESULTS` | Daily | Completed game scores |

### Connecting a real scores API
Replace the static `LIVE_GAMES` array with a fetch call at the top of `renderAll()`:

```js
async function fetchLiveScores() {
  const res  = await fetch('https://your-scores-api.com/mlb/live');
  const data = await res.json();
  // Map to { id, home, away, hs, as, inning, status, stats } shape
  return data.games.map(mapGame);
}

async function renderAll() {
  const liveFeed = await fetchLiveScores();
  // replace LIVE_GAMES contents:
  LIVE_GAMES.splice(0, LIVE_GAMES.length, ...liveFeed);
  // ... rest of renderAll
}
```

---

## Tech Stack

- **Vanilla JS** — zero runtime dependencies, no bundler
- **CSS custom properties** — full design token system
- **Google Fonts** — Space Grotesk, Syne, Syne Mono
- **Anthropic API** — `claude-sonnet-4-20250514` for game analysis

---

## License

MIT — free to use, modify, and deploy.
