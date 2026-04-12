/**
 * ============================================================
 *  MLB Oracle — Advanced AI Prediction Model
 *  model.js · v1.1.0  —  Updated Sun Apr 12, 2026
 *
 *  Sections
 *  ────────
 *  §1   DATA           – standings, colors, form, run-diff, games
 *  §2   MODEL ENGINE   – Log5, power rating, advancedProb, liveGameProb
 *  §3   SIGNALS        – per-game contextual signal generator
 *  §4   AI ANALYSIS    – Anthropic API (Claude Sonnet)
 *  §5   RENDERERS      – card, deep-dive, power rankings
 *  §6   STANDINGS      – sortable standings table
 *  §7   ACCURACY LOG
 *  §8   KPI STATS
 *  §9   TAB NAVIGATION
 *  §10  FULL RENDER
 *  §11  AUTO-REFRESH ENGINE
 *  §12  BOOT
 * ============================================================
 */

'use strict';

// ============================================================
// §1  DATA  —  as of Sun Apr 12, 2026 (all Sat games final)
// ============================================================

/**
 * Live 2026 standings. Update w/l daily to keep probabilities current.
 * @type {Object.<string,{w:number,l:number,conf:string,div:string,name:string}>}
 */
const STANDINGS_RAW = {
  // AL East
  NYY: { w:8,  l:6,  conf:'AL', div:'East',    name:'New York Yankees'      },
  BAL: { w:7,  l:7,  conf:'AL', div:'East',    name:'Baltimore Orioles'     },
  TB:  { w:7,  l:7,  conf:'AL', div:'East',    name:'Tampa Bay Rays'        },
  TOR: { w:6,  l:8,  conf:'AL', div:'East',    name:'Toronto Blue Jays'     },
  BOS: { w:5,  l:9,  conf:'AL', div:'East',    name:'Boston Red Sox'        },
  // AL Central
  CLE: { w:9,  l:6,  conf:'AL', div:'Central', name:'Cleveland Guardians'   },
  MIN: { w:8,  l:7,  conf:'AL', div:'Central', name:'Minnesota Twins'       },
  KC:  { w:7,  l:8,  conf:'AL', div:'Central', name:'Kansas City Royals'    },
  DET: { w:6,  l:9,  conf:'AL', div:'Central', name:'Detroit Tigers'        },
  CWS: { w:5,  l:10, conf:'AL', div:'Central', name:'Chicago White Sox'     },
  // AL West
  ATH: { w:7,  l:7,  conf:'AL', div:'West',    name:'Athletics'             },
  TEX: { w:7,  l:7,  conf:'AL', div:'West',    name:'Texas Rangers'         },
  LAA: { w:7,  l:8,  conf:'AL', div:'West',    name:'Los Angeles Angels'    },
  HOU: { w:6,  l:9,  conf:'AL', div:'West',    name:'Houston Astros'        },
  SEA: { w:6,  l:9,  conf:'AL', div:'West',    name:'Seattle Mariners'      },
  // NL Central
  PIT: { w:9,  l:5,  conf:'NL', div:'Central', name:'Pittsburgh Pirates'    },
  CIN: { w:9,  l:6,  conf:'NL', div:'Central', name:'Cincinnati Reds'       },
  MIL: { w:8,  l:6,  conf:'NL', div:'Central', name:'Milwaukee Brewers'     },
  STL: { w:8,  l:6,  conf:'NL', div:'Central', name:'St. Louis Cardinals'   },
  CHC: { w:6,  l:8,  conf:'NL', div:'Central', name:'Chicago Cubs'          },
  // NL East
  ATL: { w:9,  l:6,  conf:'NL', div:'East',    name:'Atlanta Braves'        },
  MIA: { w:8,  l:7,  conf:'NL', div:'East',    name:'Miami Marlins'         },
  PHI: { w:7,  l:7,  conf:'NL', div:'East',    name:'Philadelphia Phillies' },
  NYM: { w:7,  l:8,  conf:'NL', div:'East',    name:'New York Mets'         },
  WSH: { w:6,  l:8,  conf:'NL', div:'East',    name:'Washington Nationals'  },
  // NL West
  LAD: { w:11, l:3,  conf:'NL', div:'West',    name:'Los Angeles Dodgers'   },
  SD:  { w:9,  l:6,  conf:'NL', div:'West',    name:'San Diego Padres'      },
  AZ:  { w:8,  l:7,  conf:'NL', div:'West',    name:'Arizona Diamondbacks'  },
  COL: { w:6,  l:9,  conf:'NL', div:'West',    name:'Colorado Rockies'      },
  SF:  { w:6,  l:9,  conf:'NL', div:'West',    name:'San Francisco Giants'  },
};

/** Official primary team colors (hex). */
const COLORS = {
  NYY:'#003087', BAL:'#DF4601', TB:'#092C5C',  TOR:'#134A8E', BOS:'#BD3039',
  CLE:'#E31937', MIN:'#002B5C', CWS:'#27251F', KC:'#004687',  DET:'#0C2340',
  TEX:'#003278', HOU:'#002D62', LAA:'#BA0021', ATH:'#003831', SEA:'#0C2C56',
  MIL:'#12284B', CIN:'#C6011F', PIT:'#FDB827', STL:'#C41E3A', CHC:'#0E3386',
  ATL:'#CE1141', MIA:'#00A3E0', NYM:'#002D72', PHI:'#E81828', WSH:'#AB0003',
  LAD:'#005A9C', AZ:'#A71930',  SD:'#2F241D',  COL:'#33006F', SF:'#FD5A1E',
};

/**
 * Season run-differential proxy — updated through Sat Apr 11.
 * Positive = scoring more than allowing.
 * @type {Object.<string,number>}
 */
const RUN_DIFF = {
  LAD:+25, CLE:+18, ATL:+16, PIT:+14, CIN:+12, SD:+11, MIL:+9,  STL:+8,
  NYY:+7,  MIN:+5,  ATH:+4,  MIA:+3,  PHI:+2,  KC:+1,  AZ:+1,
  SF:0,    LAA:-2,  NYM:-3,  TOR:-3,  TB:-4,   BAL:-4,
  HOU:-7,  DET:-8,  COL:-9,  CHC:-10, BOS:-11, SEA:-11, WSH:-13, CWS:-16,
};

/**
 * Last-5 game results (1=win, 0=loss), most recent first.
 * Updated through Sat Apr 11 results.
 * @type {Object.<string,number[]>}
 */
const RECENT_FORM = {
  LAD:[1,1,1,1,0], CLE:[1,1,0,1,1], ATL:[0,1,1,0,1], PIT:[1,0,1,1,1],
  CIN:[1,0,1,1,0], SD: [1,1,0,0,1], MIL:[0,1,1,0,1], STL:[0,1,1,1,0],
  NYY:[0,1,0,1,1], MIN:[1,0,1,1,0], ATH:[1,0,1,0,1], AZ: [0,1,0,1,1],
  PHI:[1,0,1,0,1], KC: [1,0,1,0,0], MIA:[0,1,1,0,1], SF: [0,1,0,1,0],
  LAA:[1,0,1,0,0], WSH:[1,1,0,0,0], NYM:[0,1,0,0,1], TOR:[0,1,0,0,1],
  TB: [1,0,1,0,0], BAL:[1,0,0,1,0], HOU:[0,0,1,0,0], DET:[0,1,0,0,0],
  COL:[0,1,0,0,0], CHC:[0,0,0,1,0], BOS:[1,0,0,0,0], SEA:[1,0,0,1,0],
  TEX:[0,0,0,1,0], CWS:[0,1,0,0,0],
};

/**
 * No live games currently in progress (Sun Apr 12, games start 1:35 PM EDT).
 * Populate this array with real-time data once games begin.
 * @type {Object[]}
 */
const LIVE_GAMES = [];

/**
 * Full Sunday + Monday + Tuesday schedule from live API feed.
 * day: 'sun' | 'mon' | 'tue'
 */
const SCHEDULED = [
  // ── Sunday Apr 12 ──────────────────────────────────────────
  { id:'sun_bal_sf',  home:'BAL', away:'SF',  time:'Sun 1:35 PM EDT', day:'sun' },
  { id:'sun_phi_az',  home:'PHI', away:'AZ',  time:'Sun 1:35 PM EDT', day:'sun' },
  { id:'sun_tor_min', home:'TOR', away:'MIN', time:'Sun 1:37 PM EDT', day:'sun' },
  { id:'sun_cin_laa', home:'CIN', away:'LAA', time:'Sun 1:40 PM EDT', day:'sun' },
  { id:'sun_det_mia', home:'DET', away:'MIA', time:'Sun 1:40 PM EDT', day:'sun' },
  { id:'sun_tb_nyy',  home:'TB',  away:'NYY', time:'Sun 1:40 PM EDT', day:'sun' },
  { id:'sun_nym_ath', home:'NYM', away:'ATH', time:'Sun 1:40 PM EDT', day:'sun' },
  { id:'sun_kc_cws',  home:'KC',  away:'CWS', time:'Sun 2:10 PM EDT', day:'sun' },
  { id:'sun_mil_wsh', home:'MIL', away:'WSH', time:'Sun 2:10 PM EDT', day:'sun' },
  { id:'sun_stl_bos', home:'STL', away:'BOS', time:'Sun 2:15 PM EDT', day:'sun' },
  { id:'sun_chc_pit', home:'CHC', away:'PIT', time:'Sun 2:20 PM EDT', day:'sun' },
  { id:'sun_sea_hou', home:'SEA', away:'HOU', time:'Sun 4:10 PM EDT', day:'sun' },
  { id:'sun_lad_tex', home:'LAD', away:'TEX', time:'Sun 4:10 PM EDT', day:'sun' },
  { id:'sun_sd_col',  home:'SD',  away:'COL', time:'Sun 4:10 PM EDT', day:'sun' },
  { id:'sun_atl_cle', home:'ATL', away:'CLE', time:'Sun 7:20 PM EDT', day:'sun' },
  // ── Monday Apr 13 ──────────────────────────────────────────
  { id:'mon_sea_hou', home:'SEA', away:'HOU', time:'Mon 4:10 PM EDT', day:'mon' },
  { id:'mon_bal_az',  home:'BAL', away:'AZ',  time:'Mon 6:35 PM EDT', day:'mon' },
  { id:'mon_pit_wsh', home:'PIT', away:'WSH', time:'Mon 6:40 PM EDT', day:'mon' },
  { id:'mon_phi_chc', home:'PHI', away:'CHC', time:'Mon 6:40 PM EDT', day:'mon' },
  { id:'mon_nyy_laa', home:'NYY', away:'LAA', time:'Mon 7:05 PM EDT', day:'mon' },
  { id:'mon_atl_mia', home:'ATL', away:'MIA', time:'Mon 7:15 PM EDT', day:'mon' },
  { id:'mon_min_bos', home:'MIN', away:'BOS', time:'Mon 7:40 PM EDT', day:'mon' },
  { id:'mon_stl_cle', home:'STL', away:'CLE', time:'Mon 7:45 PM EDT', day:'mon' },
  { id:'mon_ath_tex', home:'ATH', away:'TEX', time:'Mon 9:40 PM EDT', day:'mon' },
  { id:'mon_lad_nym', home:'LAD', away:'NYM', time:'Mon 10:10 PM EDT', day:'mon' },
  // ── Tuesday Apr 14 ─────────────────────────────────────────
  { id:'tue_bal_az',  home:'BAL', away:'AZ',  time:'Tue 6:35 PM EDT', day:'tue' },
  { id:'tue_phi_chc', home:'PHI', away:'CHC', time:'Tue 6:40 PM EDT', day:'tue' },
  { id:'tue_det_kc',  home:'DET', away:'KC',  time:'Tue 6:40 PM EDT', day:'tue' },
  { id:'tue_cin_sf',  home:'CIN', away:'SF',  time:'Tue 6:40 PM EDT', day:'tue' },
  { id:'tue_pit_wsh', home:'PIT', away:'WSH', time:'Tue 6:40 PM EDT', day:'tue' },
];

/**
 * Recent completed games for the accuracy log.
 * Updated through all Sat Apr 11 final scores.
 */
const RECENT_RESULTS = [
  // Saturday Apr 11
  { date:'Sat Apr 11', away:'SF',  home:'BAL', modelPick:'BAL', prob:56, conf:'LIKELY',  actual:'BAL', correct:true,  awayS:2,  homeS:6  },
  { date:'Sat Apr 11', away:'BOS', home:'STL', modelPick:'STL', prob:61, conf:'LIKELY',  actual:'BOS', correct:false, awayS:7,  homeS:1  },
  { date:'Sat Apr 11', away:'CLE', home:'ATL', modelPick:'ATL', prob:58, conf:'LIKELY',  actual:'CLE', correct:false, awayS:6,  homeS:0  },
  { date:'Sat Apr 11', away:'WSH', home:'MIL', modelPick:'MIL', prob:65, conf:'LIKELY',  actual:'WSH', correct:false, awayS:3,  homeS:1  },
  { date:'Sat Apr 11', away:'COL', home:'SD',  modelPick:'SD',  prob:66, conf:'LIKELY',  actual:'SD',  correct:true,  awayS:5,  homeS:9  },
  { date:'Sat Apr 11', away:'TEX', home:'LAD', modelPick:'LAD', prob:76, conf:'STRONG',  actual:'LAD', correct:true,  awayS:3,  homeS:6  },
  { date:'Sat Apr 11', away:'HOU', home:'SEA', modelPick:'SEA', prob:53, conf:'TOSS-UP', actual:'SEA', correct:true,  awayS:7,  homeS:8  },
  { date:'Sat Apr 11', away:'MIA', home:'DET', modelPick:'DET', prob:55, conf:'TOSS-UP', actual:'DET', correct:true,  awayS:1,  homeS:6  },
  { date:'Sat Apr 11', away:'PIT', home:'CHC', modelPick:'PIT', prob:57, conf:'LIKELY',  actual:'PIT', correct:true,  awayS:4,  homeS:3  },
  { date:'Sat Apr 11', away:'MIN', home:'TOR', modelPick:'MIN', prob:53, conf:'TOSS-UP', actual:'MIN', correct:true,  awayS:7,  homeS:4  },
  { date:'Sat Apr 11', away:'CWS', home:'KC',  modelPick:'KC',  prob:54, conf:'TOSS-UP', actual:'KC',  correct:true,  awayS:0,  homeS:2  },
  { date:'Sat Apr 11', away:'LAA', home:'CIN', modelPick:'CIN', prob:61, conf:'LIKELY',  actual:'CIN', correct:true,  awayS:3,  homeS:7  },
  { date:'Sat Apr 11', away:'ATH', home:'NYM', modelPick:'ATH', prob:52, conf:'TOSS-UP', actual:'ATH', correct:true,  awayS:11, homeS:6  },
  { date:'Sat Apr 11', away:'NYY', home:'TB',  modelPick:'NYY', prob:58, conf:'LIKELY',  actual:'TB',  correct:false, awayS:4,  homeS:5  },
  // Friday Apr 10
  { date:'Fri Apr 10', away:'TEX', home:'LAD', modelPick:'LAD', prob:77, conf:'STRONG',  actual:'LAD', correct:true,  awayS:7,  homeS:8  },
  { date:'Fri Apr 10', away:'HOU', home:'SEA', modelPick:'SEA', prob:54, conf:'TOSS-UP', actual:'SEA', correct:true,  awayS:6,  homeS:9  },
  { date:'Fri Apr 10', away:'CLE', home:'ATL', modelPick:'ATL', prob:62, conf:'LIKELY',  actual:'ATL', correct:true,  awayS:5,  homeS:11 },
  { date:'Fri Apr 10', away:'SF',  home:'BAL', modelPick:'BAL', prob:55, conf:'LIKELY',  actual:'SF',  correct:false, awayS:6,  homeS:3  },
  { date:'Fri Apr 10', away:'WSH', home:'MIL', modelPick:'MIL', prob:68, conf:'LIKELY',  actual:'WSH', correct:false, awayS:7,  homeS:3  },
  { date:'Fri Apr 10', away:'BOS', home:'STL', modelPick:'STL', prob:60, conf:'LIKELY',  actual:'STL', correct:true,  awayS:2,  homeS:3  },
  { date:'Fri Apr 10', away:'COL', home:'SD',  modelPick:'SD',  prob:65, conf:'LIKELY',  actual:'SD',  correct:true,  awayS:2,  homeS:5  },
  { date:'Fri Apr 10', away:'NYY', home:'TB',  modelPick:'NYY', prob:58, conf:'LIKELY',  actual:'TB',  correct:false, awayS:3,  homeS:5  },
  { date:'Fri Apr 10', away:'LAA', home:'CIN', modelPick:'CIN', prob:61, conf:'LIKELY',  actual:'LAA', correct:false, awayS:10, homeS:2  },
  { date:'Fri Apr 10', away:'AZ',  home:'PHI', modelPick:'PHI', prob:54, conf:'TOSS-UP', actual:'AZ',  correct:false, awayS:5,  homeS:4  },
];


// ============================================================
// §2  MODEL ENGINE
// ============================================================

/** Season win % for a team (0–1). */
function wpct(abbr) {
  const s = STANDINGS_RAW[abbr];
  if (!s) return 0.5;
  const g = s.w + s.l;
  return g ? s.w / g : 0.5;
}

/**
 * Recency-weighted form score from last-5 results.
 * Weights: most-recent = 5, oldest = 1. Normalised to 0–1.
 */
function recentFormScore(abbr) {
  const f = RECENT_FORM[abbr] || [0,0,0,0,0];
  return f.reduce((acc, v, i) => acc + v * (5 - i), 0) / 15;
}

/** Run-differential score normalised to 0–1 (range −30 to +30). */
function runDiffScore(abbr) {
  return Math.min(1, Math.max(0, ((RUN_DIFF[abbr] || 0) + 30) / 60));
}

/**
 * Composite power rating 0–100.
 * Weights: W% 30%, form 35%, run-diff 35%.
 */
function powerRating(abbr) {
  return Math.round(
    (wpct(abbr) * 0.30 + recentFormScore(abbr) * 0.35 + runDiffScore(abbr) * 0.35) * 100
  );
}

/** Bill James Log5 — P(A beats B) given their win percentages. */
function log5(pA, pB) {
  const n = pA - pA * pB;
  const d = pA + pB - 2 * pA * pB;
  return d ? n / d : 0.5;
}

/**
 * Advanced pre-game win probability for the HOME team.
 *
 *   P = Log5(pH,pA)×0.58  +  formAdj×0.12  +  rdAdj×0.08  +  0.022 (HFA)
 *   clamped to [0.12, 0.90]
 */
function advancedProb(home, away) {
  const base    = log5(wpct(home), wpct(away));
  const formAdj = (recentFormScore(home) - recentFormScore(away)) * 0.12;
  const rdAdj   = (runDiffScore(home)    - runDiffScore(away))    * 0.08;
  return Math.min(0.90, Math.max(0.12, base * 0.58 + formAdj + rdAdj + 0.022));
}

/**
 * Live in-game win probability (WPA-style).
 * Adjusts for score, innings remaining, and live pitching ERA.
 * Clamped to [0.03, 0.97].
 */
function liveGameProb(home, away, hs, as_, inningStr, stats) {
  const base         = advancedProb(home, away);
  const diff         = (hs || 0) - (as_ || 0);
  const inn          = parseInt(inningStr) || 5;
  const isBot        = inningStr && inningStr.toLowerCase().includes('bot');
  const effInn       = isBot ? inn - 0.5 : inn;
  const remainFactor = Math.max(0, (9 - effInn) / 9);
  const leverage     = 1 - remainFactor * 0.6;
  const scoreShift   = diff * 0.11 * leverage;
  const pitchAdj     = stats
    ? ((parseFloat(stats.away?.era) || 4) - (parseFloat(stats.home?.era) || 4)) * 0.015
    : 0;
  return Math.min(0.97, Math.max(0.03, base + scoreShift + pitchAdj));
}


// ============================================================
// §3  SIGNALS
// ============================================================

/** Generate up to 4 model signals for a matchup. */
function getSignals(home, away) {
  const signals = [];
  const fH = recentFormScore(home), fA = recentFormScore(away);
  const rdH = RUN_DIFF[home] || 0,  rdA = RUN_DIFF[away] || 0;
  const formH = RECENT_FORM[home] || [], formA = RECENT_FORM[away] || [];
  const hW = formH.filter(Boolean).length, aW = formA.filter(Boolean).length;

  if (fH > fA + 0.1)       signals.push({ label:`${home} hot (${hW}-${5-hW} L5)`,    type:'pos' });
  else if (fA > fH + 0.1)  signals.push({ label:`${away} hot (${aW}-${5-aW} L5)`,    type:'neg' });
  if (rdH > rdA + 5)        signals.push({ label:`${home} +${rdH} run diff edge`,      type:'pos' });
  else if (rdA > rdH + 5)   signals.push({ label:`${away} +${rdA} run diff edge`,      type:'neg' });
  signals.push({ label:'Home field +2.2%', type:'pos' });
  if (Math.abs(wpct(home) - wpct(away)) < 0.05) signals.push({ label:'Even W-L records', type:'neu' });
  if (wpct(home) > 0.60) signals.push({ label:`${home} .${Math.round(wpct(home)*1000)} season`, type:'pos' });
  if (wpct(away) > 0.60) signals.push({ label:`${away} .${Math.round(wpct(away)*1000)} away W%`, type:'neg' });

  return signals.slice(0, 4);
}

/** Probability → American moneyline string. */
function probToML(p) {
  return p >= 0.5
    ? '−' + Math.round((p / (1 - p)) * 100)
    : '+' + Math.round(((1 - p) / p) * 100);
}

function confClass(p) {
  const q = Math.max(p, 1 - p);
  return q > 0.70 ? 'cp-s' : q > 0.60 ? 'cp-l' : 'cp-t';
}
function confLabel(p) {
  const q = Math.max(p, 1 - p);
  return q > 0.70 ? 'STRONG' : q > 0.60 ? 'LIKELY' : 'TOSS-UP';
}


// ============================================================
// §4  AI ANALYSIS  (Anthropic API)
// ============================================================

const aiCache = {};

/**
 * Fetch a Claude-powered game analysis.
 *
 * ⚠️  Security note: In production, proxy this through your own
 * backend so the API key is never exposed client-side.
 * See README.md for guidance.
 */
async function getAI(id, home, away, prob, context) {
  if (aiCache[id]) return aiCache[id];

  const hS = STANDINGS_RAW[home], aS = STANDINGS_RAW[away];
  const prompt = `You are an elite MLB analyst. Analyze this matchup with sharp, data-driven insight.

GAME: ${aS?.name||away} (${aS?.w}-${aS?.l}) @ ${hS?.name||home} (${hS?.w}-${hS?.l})
DATE: Sun Apr 12, 2026
MODEL WIN PROBABILITY: ${hS?.name||home} ${Math.round(prob*100)}% / ${aS?.name||away} ${Math.round((1-prob)*100)}%
POWER RATINGS: ${home} ${powerRating(home)}/100 · ${away} ${powerRating(away)}/100
RECENT FORM: ${home} ${(RECENT_FORM[home]||[]).map(v=>v?'W':'L').join('-')} · ${away} ${(RECENT_FORM[away]||[]).map(v=>v?'W':'L').join('-')}
RUN DIFF: ${home} ${RUN_DIFF[home]>=0?'+':''}${RUN_DIFF[home]||0} · ${away} ${RUN_DIFF[away]>=0?'+':''}${RUN_DIFF[away]||0}
${context||''}

Write a 3-sentence sharp analysis: (1) which team has the edge and why, (2) one key factor that could swing this game, (3) whether you trust this model edge or would fade it. Be direct, analytical, specific. No fluff.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role:'user', content:prompt }],
      }),
    });
    const data = await res.json();
    const text = data.content?.map(c => c.text||'').join('') || 'Analysis unavailable.';
    aiCache[id] = text;
    return text;
  } catch {
    return 'Unable to fetch analysis. Check your network connection or API key.';
  }
}

async function toggleAI(id, home, away, prob, context) {
  const box = document.getElementById('ai-' + id);
  const btn = document.getElementById('aib-' + id);
  if (!box || !btn) return;
  if (box.style.display !== 'none') {
    box.style.display = 'none';
    btn.innerHTML = '<span>✦</span> AI Analysis';
    return;
  }
  btn.innerHTML = '<span style="animation:spin .6s linear infinite;display:inline-block">↻</span> Analyzing with Claude…';
  btn.classList.add('loading'); btn.disabled = true;
  const text = await getAI(id, home, away, prob, context);
  box.innerHTML = `<div class="ai-out"><div class="ai-head">Claude Analysis</div>${text}</div>`;
  box.style.display = 'block';
  btn.innerHTML = '<span>✦</span> Hide Analysis';
  btn.classList.remove('loading'); btn.disabled = false;
}


// ============================================================
// §5  RENDERERS
// ============================================================

/** Build and append a prediction card to a container element. */
function renderCard(g, container) {
  const isLive  = g.status === 'live';
  const isFinal = g.status === 'closed';
  const prob    = isLive
    ? liveGameProb(g.home, g.away, g.hs, g.as, g.inning, g.stats)
    : advancedProb(g.home, g.away);
  const awayProb = 1 - prob;
  const hC  = COLORS[g.home] || '#334155';
  const aC  = COLORS[g.away] || '#64748b';
  const hS  = STANDINGS_RAW[g.home] || { w:0, l:0, name:g.home };
  const aS  = STANDINGS_RAW[g.away] || { w:0, l:0, name:g.away };
  const signals = getSignals(g.home, g.away);
  const context = isLive
    ? `LIVE SCORE: ${g.away} ${g.as} - ${g.home} ${g.hs}, ${g.inning}. Home ERA: ${g.stats?.home?.era||'N/A'}, Away ERA: ${g.stats?.away?.era||'N/A'}`
    : '';

  const statusHTML = isLive
    ? `<span class="status-tag st-live">⬤ LIVE · ${g.inning||''}</span>`
    : isFinal
      ? `<span class="status-tag st-final">FINAL</span>`
      : `<span class="status-tag st-sched">SCHEDULED</span>`;

  const scoreHTML = (isLive || isFinal)
    ? `<div class="score-big"><span style="color:${aC}">${g.as}</span><span class="score-sep">–</span><span style="color:${hC}">${g.hs}</span></div>`
    : `<div class="vs-at">@</div>
       <div class="ml-row">
         <span class="ml-val"><b>${probToML(awayProb)}</b></span>
         <span class="ml-val" style="color:var(--dim)">ML</span>
         <span class="ml-val"><b>${probToML(prob)}</b></span>
       </div>`;

  const card = document.createElement('div');
  card.className = 'pcard' + (isLive ? ' live' : isFinal ? ' final' : '');
  card.style.animationDelay = (Math.random() * 0.15) + 's';
  card.innerHTML = `
    <div class="pcard-accent" style="--a1:${aC};--a2:${hC}"></div>
    <div class="pcard-head">
      <span class="pcard-time">${g.time}</span>
      ${statusHTML}
    </div>
    <div class="matchup-row">
      <div class="team-block">
        <div class="tbadge" style="background:${aC}18;border:2px solid ${aC}50;color:${aC}">${g.away}</div>
        <div class="tname">${(aS.name||g.away).split(' ').slice(-1)[0]}</div>
        <div class="trec">${aS.w}-${aS.l}</div>
      </div>
      <div class="mid-zone">
        ${scoreHTML}
        <div class="mid-sub">Power: ${powerRating(g.away)} vs ${powerRating(g.home)}</div>
      </div>
      <div class="team-block">
        <div class="tbadge" style="background:${hC}18;border:2px solid ${hC}50;color:${hC}">${g.home}</div>
        <div class="tname">${(hS.name||g.home).split(' ').slice(-1)[0]}</div>
        <div class="trec">${hS.w}-${hS.l}</div>
      </div>
    </div>
    <div class="prob-section">
      <div class="prob-bar-wrap">
        <div class="pb-a" style="width:${awayProb*100}%;background:${aC}"></div>
        <div class="pb-h" style="width:${prob*100}%;background:${hC}"></div>
      </div>
      <div class="prob-pcts">
        <span class="prob-num"><b>${Math.round(awayProb*100)}%</b> ${g.away}</span>
        <span class="prob-num">${g.home} <b>${Math.round(prob*100)}%</b></span>
      </div>
    </div>
    <div class="signals">
      <div class="signals-label">Model Signals</div>
      <div class="signal-chips">
        ${signals.map(s=>`<span class="sig sig-${s.type}">${s.label}</span>`).join('')}
      </div>
    </div>
    <div class="pcard-footer">
      <div class="fav-info">
        <strong>${prob>=0.5?g.home:g.away}</strong> ${Math.round(Math.max(prob,awayProb)*100)}%
        · <span style="font-family:var(--mono);font-size:9px">${probToML(awayProb)} / ${probToML(prob)}</span>
      </div>
      <span class="conf-pill ${confClass(prob)}">${confLabel(prob)}</span>
    </div>
    <div class="ai-zone">
      <button class="ai-btn" id="aib-${g.id}"
        onclick="toggleAI('${g.id}','${g.home}','${g.away}',${prob.toFixed(4)},'${context.replace(/'/g,'')}')">
        <span>✦</span> AI Analysis
      </button>
      <div id="ai-${g.id}" style="display:none"></div>
    </div>`;
  container.appendChild(card);
}

/** Render the live deep-dive panel for a game with full stats. */
function renderLiveDeepDive(g) {
  const container = document.getElementById('liveDeepDive');
  if (!container) return;
  const prob  = liveGameProb(g.home, g.away, g.hs, g.as, g.inning, g.stats);
  const hC    = COLORS[g.home] || '#334155';
  const aC    = COLORS[g.away] || '#64748b';
  const hStat = g.stats?.home, aStat = g.stats?.away;
  const el = document.createElement('div');
  el.style.cssText = 'background:var(--s1);border:1px solid var(--accent);border-radius:16px;overflow:hidden;margin-bottom:20px;box-shadow:0 0 30px #00e5ff10';
  el.innerHTML = `
    <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
      <span style="font-family:var(--mono);font-size:10px;color:var(--accent);letter-spacing:.1em">⬤ LIVE MODEL DEEP DIVE</span>
      <span style="font-family:var(--mono);font-size:10px;color:var(--muted)">${g.inning} · ${g.away} ${g.as} – ${g.home} ${g.hs}</span>
    </div>
    <div style="padding:20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px">
      <div>
        <div style="font-family:var(--mono);font-size:9px;color:var(--dim);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px">Live Win Probability</div>
        <div style="font-family:var(--head);font-size:42px;font-weight:800;color:${prob>=.5?hC:aC}">${Math.round(Math.max(prob,1-prob)*100)}%</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">${prob>=.5?g.home:g.away} to win</div>
        <div style="margin-top:14px">
          <div style="display:flex;height:12px;border-radius:6px;overflow:hidden;gap:2px">
            <div style="width:${(1-prob)*100}%;background:${aC};border-radius:6px 0 0 6px"></div>
            <div style="width:${prob*100}%;background:${hC};border-radius:0 6px 6px 0"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:5px;font-family:var(--mono);font-size:10px;color:var(--muted)">
            <span>${g.away} ${Math.round((1-prob)*100)}%</span><span>${Math.round(prob*100)}% ${g.home}</span>
          </div>
        </div>
      </div>
      <div>
        <div style="font-family:var(--mono);font-size:9px;color:var(--dim);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px">Pitching (Today)</div>
        ${hStat?`<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:600;color:${hC};margin-bottom:4px">${g.home}</div><div style="font-family:var(--mono);font-size:10px;color:var(--muted)">ERA ${hStat.era||'—'} · WHIP ${hStat.whip||'—'} · K/9 ${hStat.k9||'—'}</div></div><div><div style="font-size:11px;font-weight:600;color:${aC};margin-bottom:4px">${g.away}</div><div style="font-family:var(--mono);font-size:10px;color:var(--muted)">ERA ${aStat?.era||'—'} · WHIP ${aStat?.whip||'—'} · K/9 ${aStat?.k9||'—'}</div></div>`:'<div style="color:var(--dim);font-size:12px">No live stats available</div>'}
      </div>
      <div>
        <div style="font-family:var(--mono);font-size:9px;color:var(--dim);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px">Team Stats (Today)</div>
        ${[{label:'Hits',h:hStat?.hits,a:aStat?.hits},{label:'OPS',h:hStat?.ops,a:aStat?.ops},{label:'Errors',h:hStat?.errors,a:aStat?.errors}].map(r=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:10px"><span style="color:var(--dim)">${r.label}</span><span style="color:${hC}">${r.h??'—'}</span><span style="color:${aC}">${r.a??'—'}</span></div>`).join('')}
      </div>
    </div>`;
  container.appendChild(el);
}

/** Render AL and NL power-ranking bar charts. */
function renderPowerRankings() {
  const alEl = document.getElementById('alPower');
  const nlEl = document.getElementById('nlPower');
  if (!alEl || !nlEl) return;
  const all    = Object.entries(STANDINGS_RAW).map(([abbr,s]) => ({ abbr,...s, pwr:powerRating(abbr) }));
  const maxPwr = Math.max(...all.map(t=>t.pwr));
  const render = (teams, el) => {
    el.innerHTML = teams.sort((a,b)=>b.pwr-a.pwr).map((t,i) => {
      const clr = COLORS[t.abbr]||'#334155';
      const recentW = (RECENT_FORM[t.abbr]||[]).slice(0,3).filter(Boolean).length;
      const delta = recentW>=2?`<span style="color:var(--green)">↑${recentW}</span>`:recentW<=0?`<span style="color:var(--accent2)">↓</span>`:`<span style="color:var(--muted)">→</span>`;
      return `<div class="pr-row">
        <span class="pr-rank">${i+1}</span>
        <span class="pr-abbr" style="color:${clr}">${t.abbr}</span>
        <div class="pr-bar-wrap"><div class="pr-bar" style="width:${Math.round(t.pwr/maxPwr*100)}%;background:${clr}"></div></div>
        <span class="pr-score">${t.pwr}</span>
        <span class="pr-delta">${delta}</span>
      </div>`;
    }).join('');
  };
  render(all.filter(t=>t.conf==='AL'), alEl);
  render(all.filter(t=>t.conf==='NL'), nlEl);
}


// ============================================================
// §6  STANDINGS TABLE  (sortable)
// ============================================================

let sortCol = 'pct', sortDir = -1;

function sortStand(col) {
  if (sortCol === col) sortDir *= -1; else { sortCol = col; sortDir = -1; }
  document.querySelectorAll('.stand-table th').forEach(th => th.classList.remove('sorted'));
  document.getElementById('th-'+col)?.classList.add('sorted');
  renderStandingsTable();
}

function renderStandingsTable() {
  const body = document.getElementById('standBody');
  if (!body) return;
  const divOrder = ['AL-East','AL-Central','AL-West','NL-East','NL-Central','NL-West'];
  const divLeaders = {};
  const teams = Object.entries(STANDINGS_RAW).map(([abbr,s]) => {
    const g = s.w+s.l, pct = g?s.w/g:0;
    const form = RECENT_FORM[abbr]||[];
    let n=0; const v=form[0]; for(const x of form){if(x===v)n++;else break;}
    return { abbr,...s, pct, pwr:powerRating(abbr), rdiff:RUN_DIFF[abbr]||0,
             streak:(v?'W':'L')+n, form, winprob:pct, divKey:s.conf+'-'+s.div };
  });
  divOrder.forEach(dk => {
    const leader = [...teams.filter(t=>t.divKey===dk)].sort((a,b)=>b.pct-a.pct)[0];
    if (leader) divLeaders[leader.abbr] = true;
  });
  if (sortCol==='pct'||sortCol==='name') {
    body.innerHTML='';
    divOrder.forEach(dk => {
      const divTeams = teams.filter(t=>t.divKey===dk).sort((a,b)=>b.pct-a.pct);
      const [conf,div] = dk.split('-');
      const hrow = document.createElement('tr'); hrow.className='div-header';
      hrow.innerHTML=`<td colspan="9">${conf} ${div}</td>`; body.appendChild(hrow);
      divTeams.forEach(t => appendStandRow(t,body,!!divLeaders[t.abbr]));
    });
    return;
  }
  const sorted = [...teams].sort((a,b)=>(b[sortCol]-a[sortCol])*sortDir);
  body.innerHTML=''; sorted.forEach(t=>appendStandRow(t,body,!!divLeaders[t.abbr]));
}

function appendStandRow(t, body, isLeader) {
  const clr = COLORS[t.abbr]||'#334155';
  const pctStr = '.'+String(Math.round(t.pct*1000)).padStart(3,'0');
  const pwrClass = t.pwr>=60?'pwr-hi':t.pwr>=45?'pwr-md':'pwr-lo';
  const formHtml = (t.form||[]).map(v=>`<span style="font-family:var(--mono);font-size:10px;color:${v?'var(--green)':'var(--accent2)'}">${v?'W':'L'}</span>`).join(' ');
  const tr = document.createElement('tr'); if(isLeader) tr.className='div-leader';
  tr.innerHTML=`
    <td><span class="st-abbr" style="color:${clr}">${t.abbr}</span><span class="st-name">${(t.name||'').split(' ').slice(-1)[0]}</span></td>
    <td class="st-mono"><b>${t.w}</b></td><td class="st-mono">${t.l}</td>
    <td class="st-mono">${pctStr}<span class="pct-bar" style="width:${Math.round(t.pct*50)}px;background:${clr}"></span></td>
    <td><span class="pwr-score ${pwrClass}">${t.pwr}</span></td>
    <td class="st-mono">${Math.round(t.pct*100)}%</td>
    <td class="st-mono" style="color:${t.rdiff>=0?'var(--green)':'var(--accent2)'}">${t.rdiff>=0?'+':''}${t.rdiff}</td>
    <td>${formHtml}</td>
    <td style="font-family:var(--mono);font-size:11px;color:${t.streak[0]==='W'?'var(--green)':'var(--accent2)'}">${t.streak}</td>`;
  body.appendChild(tr);
}


// ============================================================
// §7  ACCURACY LOG
// ============================================================

function renderAccuracy() {
  const body = document.getElementById('accBody');
  if (!body) return;
  // Recompute totals from RECENT_RESULTS
  const total   = RECENT_RESULTS.length;
  const correct = RECENT_RESULTS.filter(r=>r.correct).length;
  const strong  = RECENT_RESULTS.filter(r=>r.conf==='STRONG');
  const likely  = RECENT_RESULTS.filter(r=>r.conf==='LIKELY');
  const tossup  = RECENT_RESULTS.filter(r=>r.conf==='TOSS-UP');
  const pct = n => n ? Math.round(n/n*100)+'%' : '—'; // placeholder; real calc below
  // Update KPI cards in accuracy tab if they exist
  const update = (id,val) => { const el=document.getElementById(id); if(el) el.textContent=val; };
  update('acc-overall', `${Math.round(correct/total*100)}%`);
  update('acc-overall-sub', `${correct} of ${total} correct picks`);
  update('acc-strong', strong.length ? Math.round(strong.filter(r=>r.correct).length/strong.length*100)+'%' : '—');
  update('acc-strong-sub', `${strong.filter(r=>r.correct).length} of ${strong.length} (>70% prob)`);
  update('acc-likely', likely.length ? Math.round(likely.filter(r=>r.correct).length/likely.length*100)+'%' : '—');
  update('acc-likely-sub', `${likely.filter(r=>r.correct).length} of ${likely.length} (60–70% prob)`);
  update('acc-tossup', tossup.length ? Math.round(tossup.filter(r=>r.correct).length/tossup.length*100)+'%' : '—');
  update('acc-tossup-sub', `${tossup.filter(r=>r.correct).length} of ${tossup.length} (<60% prob)`);

  body.innerHTML = RECENT_RESULTS.map(r => {
    const cc = r.conf==='STRONG'?'conf-s2':r.conf==='LIKELY'?'conf-l2':'conf-t2';
    return `<tr>
      <td class="acc-date">${r.date}</td>
      <td style="font-family:var(--mono);font-size:11px">
        <span style="color:${COLORS[r.away]||'#555'}">${r.away}</span>
        <span style="color:var(--dim)"> @ </span>
        <span style="color:${COLORS[r.home]||'#555'}">${r.home}</span>
        <span style="color:var(--dim);margin-left:6px">${r.awayS}–${r.homeS}</span>
      </td>
      <td style="font-weight:600;color:${COLORS[r.modelPick]||'#555'}">${r.modelPick}</td>
      <td style="font-family:var(--mono)">${r.prob}%</td>
      <td class="${cc}" style="font-family:var(--mono);font-size:10px">${r.conf}</td>
      <td style="font-weight:600;color:${COLORS[r.actual]||'#555'}">${r.actual}</td>
      <td class="${r.correct?'result-w':'result-l'}">${r.correct?'✓ YES':'✗ NO'}</td>
    </tr>`;
  }).join('');
}


// ============================================================
// §8  KPI STATS
// ============================================================

function updateKPIs() {
  const todayGames = SCHEDULED.filter(g=>g.day==='sun');
  const probs      = todayGames.map(g=>advancedProb(g.home,g.away));
  const edges      = probs.map(p=>Math.max(p,1-p));
  const bestEdge   = probs.length ? Math.round(Math.max(...edges)*100) : 0;
  const bestGame   = todayGames[edges.indexOf(Math.max(...edges))];
  const avg        = probs.length ? Math.round(edges.reduce((a,e)=>a+e,0)/probs.length*100) : 0;
  const strong     = probs.filter(p=>Math.max(p,1-p)>0.70).length;

  const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  set('kpi-games',      todayGames.length + LIVE_GAMES.length);
  set('kpi-games-sub',  `${LIVE_GAMES.length} live · ${todayGames.length} scheduled today`);
  set('kpi-edge',       bestEdge+'%');
  if (bestGame) {
    const p = advancedProb(bestGame.home,bestGame.away);
    set('kpi-edge-sub', `${p>=0.5?bestGame.home:bestGame.away} vs ${p>=0.5?bestGame.away:bestGame.home}`);
  }
  set('kpi-avg',    avg+'%');
  set('kpi-strong', strong);

  // Update live count chip
  const liveChip = document.getElementById('liveCount');
  if (liveChip) liveChip.textContent = LIVE_GAMES.length;
}


// ============================================================
// §9  TAB NAVIGATION
// ============================================================

const TAB_NAMES = ['predictions','live','model','standings','accuracy'];

function showTab(name) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+name)?.classList.add('active');
  document.querySelectorAll('.tab')[TAB_NAMES.indexOf(name)]?.classList.add('active');
}


// ============================================================
// §10  FULL RENDER
// ============================================================

function renderAll() {
  // Predictions tab
  const sunEl = document.getElementById('predGames'); // today = Sunday
  const monEl = document.getElementById('sunGames');  // "tomorrow" slot = Monday
  const tueEl = document.getElementById('monGames');  // "day after" slot = Tuesday
  if (sunEl) { sunEl.innerHTML=''; SCHEDULED.filter(g=>g.day==='sun').forEach(g=>renderCard(g,sunEl)); }
  if (monEl) { monEl.innerHTML=''; SCHEDULED.filter(g=>g.day==='mon').forEach(g=>renderCard(g,monEl)); }
  if (tueEl) { tueEl.innerHTML=''; SCHEDULED.filter(g=>g.day==='tue').forEach(g=>renderCard(g,tueEl)); }

  // Live tab
  const liveEl = document.getElementById('liveGamesGrid');
  const finEl  = document.getElementById('finishedGames');
  if (liveEl) {
    liveEl.innerHTML = '';
    if (LIVE_GAMES.length === 0) {
      liveEl.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;font-family:var(--mono);font-size:12px;color:var(--dim)">No games currently in progress — check back at 1:35 PM EDT</div>';
    } else {
      LIVE_GAMES.forEach(g=>renderCard(g,liveEl));
    }
  }
  if (finEl) {
    finEl.innerHTML='';
    RECENT_RESULTS.filter(r=>r.date==='Sat Apr 11').forEach(r=>{
      renderCard({id:'f_'+r.home+r.away,home:r.home,away:r.away,time:r.date,status:'closed',hs:r.homeS,as:r.awayS},finEl);
    });
  }

  // Model tab
  const ddEl = document.getElementById('liveDeepDive');
  if (ddEl) {
    ddEl.innerHTML='';
    if (LIVE_GAMES.length===0) {
      ddEl.innerHTML='<div style="padding:24px;font-family:var(--mono);font-size:12px;color:var(--dim)">Deep dive panels appear here once games go live.</div>';
    } else {
      LIVE_GAMES.filter(g=>g.stats?.home?.era).forEach(g=>renderLiveDeepDive(g));
    }
  }
  renderPowerRankings();
  renderStandingsTable();
  renderAccuracy();
  updateKPIs();
}


// ============================================================
// §11  AUTO-REFRESH ENGINE
// ============================================================

const REFRESH_INTERVAL = 60;
let secs = REFRESH_INTERVAL;

function flash() {
  const el = document.createElement('div');
  el.className = 'flash-overlay'; document.body.appendChild(el);
  setTimeout(()=>el.remove(), 700);
}

function doRefresh() {
  flash(); renderAll(); secs = REFRESH_INTERVAL;
  const chip = document.getElementById('lastRefreshChip');
  const t    = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  if (chip) { chip.textContent='Updated '+t; chip.style.color='var(--green)'; setTimeout(()=>{chip.style.color='';},2000); }
}

function manualRefresh() {
  const btn = document.getElementById('manualRefreshBtn');
  if (btn) { btn.textContent='↻ Refreshing…'; setTimeout(()=>{btn.textContent='↺ Refresh';},1000); }
  secs = 0;
}

setInterval(()=>{
  secs--;
  const cd   = document.getElementById('countdown');
  const fill = document.getElementById('refreshFill');
  if (cd)   cd.textContent  = secs<=0?'…':secs;
  if (fill) fill.style.width = (Math.max(0,secs/REFRESH_INTERVAL)*100)+'%';
  if (secs<=0) doRefresh();
}, 1000);


// ============================================================
// §12  BOOT
// ============================================================

const _style = document.createElement('style');
_style.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
document.head.appendChild(_style);

renderAll();
