/**
 * ============================================================
 *  MLB Oracle — Advanced AI Prediction Model
 *  model.js · v1.0.0
 *
 *  Architecture
 *  ────────────
 *  1. DATA           – standings, colors, form, run-diff, games
 *  2. MODEL ENGINE   – Log5, power rating, advanced prob, live WPA
 *  3. SIGNALS        – per-game contextual signal generator
 *  4. AI ANALYSIS    – Anthropic API integration (Claude Sonnet)
 *  5. RENDERERS      – card, deep-dive, power rankings, standings, accuracy
 *  6. KPIs           – dashboard stat updater
 *  7. TABS           – navigation
 *  8. REFRESH ENGINE – 60-second auto-refresh loop
 *  9. INIT           – boot sequence
 * ============================================================
 */

'use strict';

// ============================================================
// §1  DATA
// ============================================================

/**
 * Live 2026 standings keyed by team abbreviation.
 * Update w/l each day to keep model probabilities current.
 * @type {Object.<string, {w:number, l:number, conf:string, div:string, name:string}>}
 */
const STANDINGS_RAW = {
  // AL East
  NYY: { w:8,  l:6,  conf:'AL', div:'East',    name:'New York Yankees'      },
  TB:  { w:7,  l:7,  conf:'AL', div:'East',    name:'Tampa Bay Rays'        },
  BAL: { w:6,  l:7,  conf:'AL', div:'East',    name:'Baltimore Orioles'     },
  TOR: { w:6,  l:8,  conf:'AL', div:'East',    name:'Toronto Blue Jays'     },
  BOS: { w:4,  l:9,  conf:'AL', div:'East',    name:'Boston Red Sox'        },
  // AL Central
  CLE: { w:8,  l:6,  conf:'AL', div:'Central', name:'Cleveland Guardians'   },
  MIN: { w:8,  l:7,  conf:'AL', div:'Central', name:'Minnesota Twins'       },
  KC:  { w:7,  l:8,  conf:'AL', div:'Central', name:'Kansas City Royals'    },
  DET: { w:6,  l:9,  conf:'AL', div:'Central', name:'Detroit Tigers'        },
  CWS: { w:5,  l:10, conf:'AL', div:'Central', name:'Chicago White Sox'     },
  // AL West
  TEX: { w:7,  l:6,  conf:'AL', div:'West',    name:'Texas Rangers'         },
  ATH: { w:7,  l:7,  conf:'AL', div:'West',    name:'Athletics'             },
  LAA: { w:7,  l:8,  conf:'AL', div:'West',    name:'Los Angeles Angels'    },
  HOU: { w:6,  l:8,  conf:'AL', div:'West',    name:'Houston Astros'        },
  SEA: { w:5,  l:9,  conf:'AL', div:'West',    name:'Seattle Mariners'      },
  // NL Central
  PIT: { w:9,  l:5,  conf:'NL', div:'Central', name:'Pittsburgh Pirates'    },
  MIL: { w:8,  l:5,  conf:'NL', div:'Central', name:'Milwaukee Brewers'     },
  STL: { w:8,  l:5,  conf:'NL', div:'Central', name:'St. Louis Cardinals'   },
  CIN: { w:9,  l:6,  conf:'NL', div:'Central', name:'Cincinnati Reds'       },
  CHC: { w:6,  l:8,  conf:'NL', div:'Central', name:'Chicago Cubs'          },
  // NL East
  ATL: { w:9,  l:5,  conf:'NL', div:'East',    name:'Atlanta Braves'        },
  MIA: { w:8,  l:7,  conf:'NL', div:'East',    name:'Miami Marlins'         },
  PHI: { w:7,  l:7,  conf:'NL', div:'East',    name:'Philadelphia Phillies' },
  NYM: { w:7,  l:8,  conf:'NL', div:'East',    name:'New York Mets'         },
  WSH: { w:5,  l:8,  conf:'NL', div:'East',    name:'Washington Nationals'  },
  // NL West
  LAD: { w:10, l:3,  conf:'NL', div:'West',    name:'Los Angeles Dodgers'   },
  SD:  { w:8,  l:6,  conf:'NL', div:'West',    name:'San Diego Padres'      },
  AZ:  { w:8,  l:7,  conf:'NL', div:'West',    name:'Arizona Diamondbacks'  },
  COL: { w:6,  l:8,  conf:'NL', div:'West',    name:'Colorado Rockies'      },
  SF:  { w:6,  l:8,  conf:'NL', div:'West',    name:'San Francisco Giants'  },
};

/** Official primary team colors (hex) */
const COLORS = {
  NYY:'#003087', BAL:'#DF4601', TB:'#092C5C',  TOR:'#134A8E', BOS:'#BD3039',
  CLE:'#E31937', MIN:'#002B5C', CWS:'#27251F', KC:'#004687',  DET:'#0C2340',
  TEX:'#003278', HOU:'#002D62', LAA:'#BA0021', ATH:'#003831', SEA:'#0C2C56',
  MIL:'#12284B', CIN:'#C6011F', PIT:'#FDB827', STL:'#C41E3A', CHC:'#0E3386',
  ATL:'#CE1141', MIA:'#00A3E0', NYM:'#002D72', PHI:'#E81828', WSH:'#AB0003',
  LAD:'#005A9C', AZ:'#A71930',  SD:'#2F241D',  COL:'#33006F', SF:'#FD5A1E',
};

/**
 * Cumulative run differential proxy derived from season scores.
 * Positive = scoring more than allowing; update weekly.
 * @type {Object.<string, number>}
 */
const RUN_DIFF = {
  LAD:+18, ATL:+14, PIT:+12, CIN:+10, MIL:+9,  STL:+8,  NYY:+7,  CLE:+6,
  MIN:+5,  TEX:+4,  ATH:+3,  MIA:+3,  PHI:+2,  KC:+1,   AZ:+1,
  SD:0,    SF:-1,   LAA:-2,  NYM:-3,  TOR:-3,  TB:-4,   BAL:-5,
  HOU:-6,  DET:-7,  COL:-8,  CHC:-9,  BOS:-10, SEA:-11, WSH:-12, CWS:-15,
};

/**
 * Last-5 game results per team (1=win, 0=loss), most recent first.
 * Used for recency-weighted form score.
 * @type {Object.<string, number[]>}
 */
const RECENT_FORM = {
  LAD:[1,1,1,0,1], ATL:[1,1,0,1,1], PIT:[1,1,1,0,0], CIN:[1,0,1,1,0],
  MIL:[0,1,1,0,1], STL:[0,1,1,1,0], NYY:[0,1,0,1,1], CLE:[1,0,1,1,0],
  MIN:[0,1,1,0,1], ATH:[1,0,1,0,1], AZ:[1,0,1,1,0],  PHI:[0,1,0,1,1],
  TEX:[0,1,0,1,0], KC:[1,0,1,0,0],  MIA:[0,1,1,0,1], SF:[1,0,1,0,0],
  SD:[1,0,0,1,1],  LAA:[1,0,0,1,0], NYM:[1,0,0,1,0], TOR:[0,1,0,0,1],
  TB:[0,1,0,0,1],  BAL:[0,0,1,0,1], HOU:[0,0,1,0,0], DET:[0,1,0,0,0],
  COL:[0,1,0,0,0], CHC:[0,0,0,1,0], BOS:[0,0,0,0,1], SEA:[0,0,1,0,0],
  WSH:[1,0,0,0,0], CWS:[1,0,0,0,0],
};

/**
 * Live games sourced from the sports API on Apr 11, 2026.
 * Each object mirrors the shape returned by the live scores feed.
 * Replace/extend with real API fetch in production (see README).
 */
const LIVE_GAMES = [
  {
    id:'g_mil_wsh', home:'MIL', away:'WSH', time:'Sat 7:10 PM', status:'live',
    hs:0, as:2, inning:'Bot 8th',
    linescore:{ away:[0,0,0,0,2,0,0,0], home:[0,0,0,0,0,0,0,null] },
    stats:{
      home:{ era:'2.35', whip:'1.17', k9:'4.7', ops:'.237', errors:3, hits:1 },
      away:{ era:'0.00', whip:'0.71', k9:'5.1', ops:'.619', errors:0, hits:6 },
    },
  },
  {
    id:'g_bal_sf', home:'BAL', away:'SF', time:'Sat 7:15 PM', status:'live',
    hs:4, as:2, inning:'Mid 7th',
    linescore:{ away:[0,0,0,2,0,0,null], home:[0,0,0,1,2,1,null] },
    stats:{ home:{ era:'3.5', whip:'1.2', ops:'.550' }, away:{ era:'4.0', whip:'1.3', ops:'.480' } },
  },
  {
    id:'g_stl_bos', home:'STL', away:'BOS', time:'Sat 7:15 PM', status:'live',
    hs:0, as:2, inning:'Top 7th',
    linescore:{ away:[0,0,0,0,0,2,null], home:[0,0,0,0,0,0,null] },
    stats:{ home:{ era:'2.8', whip:'1.1', ops:'.520' }, away:{ era:'3.2', whip:'1.2', ops:'.490' } },
  },
  {
    id:'g_atl_cle', home:'ATL', away:'CLE', time:'Sat 7:15 PM', status:'live',
    hs:0, as:3, inning:'Bot 8th',
    linescore:{ away:[1,0,0,0,0,1,0,1], home:[0,0,0,0,0,0,0,null] },
    stats:{
      home:{ era:'3.52', whip:'1.43', k9:'3.5', ops:'.462', errors:0, hits:4 },
      away:{ era:'0.00', whip:'0.86', k9:'6.4', ops:'.666', errors:0, hits:5 },
    },
  },
  {
    id:'g_sd_col', home:'SD', away:'COL', time:'Sat 8:40 PM', status:'live',
    hs:0, as:2, inning:'Top 4th',
    linescore:{ away:[0,1,0,1], home:[0,0,0,null] },
    stats:{ home:{ era:'3.0', whip:'1.2', ops:'.500' }, away:{ era:'4.5', whip:'1.4', ops:'.460' } },
  },
  {
    id:'g_lad_tex', home:'LAD', away:'TEX', time:'Sat 9:10 PM', status:'live',
    hs:0, as:1, inning:'Top 3rd',
    linescore:{ away:[0,0,1], home:[0,0,null] },
    stats:{ home:{ era:'2.5', whip:'1.0', ops:'.600' }, away:{ era:'3.8', whip:'1.3', ops:'.510' } },
  },
];

/** Upcoming scheduled games (today + next 2 days). day: 'sat'|'sun'|'mon' */
const SCHEDULED = [
  // Saturday (remaining)
  { id:'s_sea_hou',   home:'SEA', away:'HOU', time:'Sat 9:40 PM',  day:'sat' },
  // Sunday Apr 12
  { id:'s_bal_sf2',   home:'BAL', away:'SF',  time:'Sun 1:35 PM',  day:'sun' },
  { id:'s_phi_az',    home:'PHI', away:'AZ',  time:'Sun 1:35 PM',  day:'sun' },
  { id:'s_tor_min',   home:'TOR', away:'MIN', time:'Sun 1:37 PM',  day:'sun' },
  { id:'s_cin_laa',   home:'CIN', away:'LAA', time:'Sun 1:40 PM',  day:'sun' },
  { id:'s_det_mia',   home:'DET', away:'MIA', time:'Sun 1:40 PM',  day:'sun' },
  { id:'s_tb_nyy',    home:'TB',  away:'NYY', time:'Sun 1:40 PM',  day:'sun' },
  { id:'s_nym_ath',   home:'NYM', away:'ATH', time:'Sun 1:40 PM',  day:'sun' },
  { id:'s_kc_cws',    home:'KC',  away:'CWS', time:'Sun 2:10 PM',  day:'sun' },
  { id:'s_mil_wsh2',  home:'MIL', away:'WSH', time:'Sun 2:10 PM',  day:'sun' },
  { id:'s_stl_bos2',  home:'STL', away:'BOS', time:'Sun 2:15 PM',  day:'sun' },
  { id:'s_chc_pit',   home:'CHC', away:'PIT', time:'Sun 2:20 PM',  day:'sun' },
  { id:'s_sea_hou2',  home:'SEA', away:'HOU', time:'Sun 4:10 PM',  day:'sun' },
  { id:'s_lad_tex2',  home:'LAD', away:'TEX', time:'Sun 4:10 PM',  day:'sun' },
  { id:'s_sd_col2',   home:'SD',  away:'COL', time:'Sun 4:10 PM',  day:'sun' },
  { id:'s_atl_cle2',  home:'ATL', away:'CLE', time:'Sun 7:20 PM',  day:'sun' },
  // Monday Apr 13
  { id:'m_sea_hou3',  home:'SEA', away:'HOU', time:'Mon 4:10 PM',  day:'mon' },
  { id:'m_bal_az',    home:'BAL', away:'AZ',  time:'Mon 6:35 PM',  day:'mon' },
  { id:'m_pit_wsh',   home:'PIT', away:'WSH', time:'Mon 6:40 PM',  day:'mon' },
  { id:'m_phi_chc',   home:'PHI', away:'CHC', time:'Mon 6:40 PM',  day:'mon' },
  { id:'m_nyy_laa',   home:'NYY', away:'LAA', time:'Mon 7:05 PM',  day:'mon' },
  { id:'m_atl_mia',   home:'ATL', away:'MIA', time:'Mon 7:15 PM',  day:'mon' },
  { id:'m_min_bos',   home:'MIN', away:'BOS', time:'Mon 7:40 PM',  day:'mon' },
  { id:'m_stl_cle',   home:'STL', away:'CLE', time:'Mon 7:45 PM',  day:'mon' },
  { id:'m_ath_tex',   home:'ATH', away:'TEX', time:'Mon 9:40 PM',  day:'mon' },
  { id:'m_lad_nym',   home:'LAD', away:'NYM', time:'Mon 10:10 PM', day:'mon' },
];

/** Recent completed games used to populate the accuracy log. */
const RECENT_RESULTS = [
  { date:'Sat Apr 11', away:'MIA', home:'DET', modelPick:'DET', prob:55, conf:'TOSS-UP', actual:'DET', correct:true,  awayS:1,  homeS:6  },
  { date:'Sat Apr 11', away:'PIT', home:'CHC', modelPick:'PIT', prob:57, conf:'LIKELY',  actual:'PIT', correct:true,  awayS:4,  homeS:3  },
  { date:'Sat Apr 11', away:'MIN', home:'TOR', modelPick:'MIN', prob:53, conf:'TOSS-UP', actual:'MIN', correct:true,  awayS:7,  homeS:4  },
  { date:'Sat Apr 11', away:'CWS', home:'KC',  modelPick:'KC',  prob:54, conf:'TOSS-UP', actual:'KC',  correct:true,  awayS:0,  homeS:2  },
  { date:'Sat Apr 11', away:'LAA', home:'CIN', modelPick:'CIN', prob:61, conf:'LIKELY',  actual:'CIN', correct:true,  awayS:3,  homeS:7  },
  { date:'Sat Apr 11', away:'ATH', home:'NYM', modelPick:'ATH', prob:52, conf:'TOSS-UP', actual:'ATH', correct:true,  awayS:11, homeS:6  },
  { date:'Sat Apr 11', away:'NYY', home:'TB',  modelPick:'NYY', prob:58, conf:'LIKELY',  actual:'TB',  correct:false, awayS:4,  homeS:5  },
  { date:'Fri Apr 10', away:'TEX', home:'LAD', modelPick:'LAD', prob:77, conf:'STRONG',  actual:'LAD', correct:true,  awayS:7,  homeS:8  },
  { date:'Fri Apr 10', away:'HOU', home:'SEA', modelPick:'SEA', prob:54, conf:'TOSS-UP', actual:'SEA', correct:true,  awayS:6,  homeS:9  },
  { date:'Fri Apr 10', away:'CLE', home:'ATL', modelPick:'ATL', prob:62, conf:'LIKELY',  actual:'ATL', correct:true,  awayS:5,  homeS:11 },
  { date:'Fri Apr 10', away:'SF',  home:'BAL', modelPick:'BAL', prob:55, conf:'LIKELY',  actual:'SF',  correct:false, awayS:6,  homeS:3  },
  { date:'Fri Apr 10', away:'WSH', home:'MIL', modelPick:'MIL', prob:68, conf:'LIKELY',  actual:'WSH', correct:false, awayS:7,  homeS:3  },
  { date:'Fri Apr 10', away:'AZ',  home:'PHI', modelPick:'PHI', prob:54, conf:'TOSS-UP', actual:'AZ',  correct:false, awayS:5,  homeS:4  },
  { date:'Fri Apr 10', away:'BOS', home:'STL', modelPick:'STL', prob:60, conf:'LIKELY',  actual:'STL', correct:true,  awayS:2,  homeS:3  },
  { date:'Fri Apr 10', away:'COL', home:'SD',  modelPick:'SD',  prob:65, conf:'LIKELY',  actual:'SD',  correct:true,  awayS:2,  homeS:5  },
  { date:'Fri Apr 10', away:'MIN', home:'TOR', modelPick:'MIN', prob:53, conf:'TOSS-UP', actual:'TOR', correct:false, awayS:4,  homeS:10 },
  { date:'Fri Apr 10', away:'NYY', home:'TB',  modelPick:'NYY', prob:58, conf:'LIKELY',  actual:'TB',  correct:false, awayS:3,  homeS:5  },
  { date:'Fri Apr 10', away:'LAA', home:'CIN', modelPick:'CIN', prob:61, conf:'LIKELY',  actual:'LAA', correct:false, awayS:10, homeS:2  },
  { date:'Thu Apr 9',  away:'CWS', home:'KC',  modelPick:'KC',  prob:53, conf:'TOSS-UP', actual:'CWS', correct:false, awayS:2,  homeS:0  },
  { date:'Thu Apr 9',  away:'COL', home:'SD',  modelPick:'SD',  prob:63, conf:'LIKELY',  actual:'SD',  correct:true,  awayS:3,  homeS:7  },
  { date:'Thu Apr 9',  away:'AZ',  home:'NYM', modelPick:'NYM', prob:54, conf:'TOSS-UP', actual:'AZ',  correct:false, awayS:7,  homeS:1  },
  { date:'Thu Apr 9',  away:'ATH', home:'NYY', modelPick:'NYY', prob:62, conf:'LIKELY',  actual:'ATH', correct:false, awayS:1,  homeS:0  },
  { date:'Thu Apr 9',  away:'DET', home:'MIN', modelPick:'MIN', prob:58, conf:'LIKELY',  actual:'MIN', correct:true,  awayS:1,  homeS:3  },
  { date:'Thu Apr 9',  away:'CIN', home:'MIA', modelPick:'MIA', prob:57, conf:'LIKELY',  actual:'MIA', correct:true,  awayS:1,  homeS:8  },
];


// ============================================================
// §2  MODEL ENGINE
// ============================================================

/**
 * Season win percentage for a team.
 * @param {string} abbr  Team abbreviation
 * @returns {number}  0–1
 */
function wpct(abbr) {
  const s = STANDINGS_RAW[abbr];
  if (!s) return 0.5;
  const g = s.w + s.l;
  return g ? s.w / g : 0.5;
}

/**
 * Recency-weighted form score from the last-5 results.
 * Most recent game has weight 5, oldest has weight 1.
 * Normalised to 0–1.
 * @param {string} abbr
 * @returns {number}
 */
function recentFormScore(abbr) {
  const f = RECENT_FORM[abbr] || [0, 0, 0, 0, 0];
  // weights: [5, 4, 3, 2, 1]
  const score = f.reduce((acc, v, i) => acc + v * (5 - i), 0);
  return score / 15; // max possible = 5+4+3+2+1 = 15
}

/**
 * Normalised run-differential score (0–1).
 * Maps the observed range [−30, +30] onto [0, 1].
 * @param {string} abbr
 * @returns {number}
 */
function runDiffScore(abbr) {
  const rd = RUN_DIFF[abbr] || 0;
  return Math.min(1, Math.max(0, (rd + 30) / 60));
}

/**
 * Composite power rating on a 0–100 scale.
 * Weights: W% 30%, recent form 35%, run diff 35%.
 * @param {string} abbr
 * @returns {number}  integer 0–100
 */
function powerRating(abbr) {
  const raw = wpct(abbr) * 0.30
            + recentFormScore(abbr) * 0.35
            + runDiffScore(abbr) * 0.35;
  return Math.round(raw * 100);
}

/**
 * Bill James Log5 formula.
 * Returns the probability that team A beats team B given their
 * individual true-talent win percentages.
 * @param {number} pA  Team A win probability (0–1)
 * @param {number} pB  Team B win probability (0–1)
 * @returns {number}
 */
function log5(pA, pB) {
  const n = pA - pA * pB;
  const d = pA + pB - 2 * pA * pB;
  return d ? n / d : 0.5;
}

/**
 * Advanced pre-game win probability for the home team.
 *
 * Formula (home team perspective):
 *   P = Log5(pH, pA) × 0.58
 *     + formAdjustment  × 0.12   ← (formHome − formAway)
 *     + runDiffAdjust   × 0.08   ← (rdHome   − rdAway)
 *     + homeFieldAdv    = 0.022   ← ~54 % home win rate baseline
 *
 * Result is clamped to [0.12, 0.90].
 *
 * @param {string} home  Home team abbreviation
 * @param {string} away  Away team abbreviation
 * @returns {number}     Home-win probability (0–1)
 */
function advancedProb(home, away) {
  const pH = wpct(home),   pA = wpct(away);
  const base = log5(pH, pA);

  const formAdj = (recentFormScore(home) - recentFormScore(away)) * 0.12;
  const rdAdj   = (runDiffScore(home)    - runDiffScore(away))    * 0.08;
  const homeAdj = 0.022;

  const raw = base * 0.58 + formAdj + rdAdj + homeAdj;
  return Math.min(0.90, Math.max(0.12, raw));
}

/**
 * Live in-game win probability using a Win-Probability-Added (WPA) style
 * leverage adjustment on top of the pre-game probability.
 *
 * Adjustments applied:
 *  • Score differential  — each run worth more as innings dwindle
 *  • Innings remaining   — remaining-fraction reduces score leverage
 *  • Live pitching ERA   — home vs. away ERA delta shifts by ±0.015/run
 *
 * @param {string} home
 * @param {string} away
 * @param {number} hs         Home score
 * @param {number} as_        Away score
 * @param {string} inningStr  e.g. "Bot 8th" or "Top 6th"
 * @param {Object} stats      Live stats object { home:{era}, away:{era} }
 * @returns {number}  Home-win probability (0.03–0.97)
 */
function liveGameProb(home, away, hs, as_, inningStr, stats) {
  const base  = advancedProb(home, away);
  const diff  = (hs || 0) - (as_ || 0);
  const inn   = parseInt(inningStr) || 5;
  const isBot = inningStr && inningStr.toLowerCase().includes('bot');

  // Effective innings elapsed (bot = 0.5 more than top)
  const effInn       = isBot ? inn - 0.5 : inn;
  const remainFactor = Math.max(0, (9 - effInn) / 9);

  // Leverage increases late — runs count more when fewer innings remain
  const leverage  = 1 - remainFactor * 0.6;
  const scoreShift = diff * 0.11 * leverage;

  // Live pitching edge: every run of ERA gap ≈ ±1.5 pp
  let pitchAdj = 0;
  if (stats) {
    const homeERA = parseFloat(stats.home?.era) || 4.0;
    const awayERA = parseFloat(stats.away?.era) || 4.0;
    pitchAdj = (awayERA - homeERA) * 0.015;
  }

  return Math.min(0.97, Math.max(0.03, base + scoreShift + pitchAdj));
}


// ============================================================
// §3  SIGNALS
// ============================================================

/**
 * Generate up to 4 human-readable model signals for a matchup.
 * Each signal has { label:string, type:'pos'|'neg'|'neu' }.
 * @param {string} home
 * @param {string} away
 * @returns {{ label:string, type:string }[]}
 */
function getSignals(home, away) {
  const signals = [];
  const fH = recentFormScore(home), fA = recentFormScore(away);
  const rdH = RUN_DIFF[home] || 0,  rdA = RUN_DIFF[away] || 0;
  const formH = RECENT_FORM[home] || [], formA = RECENT_FORM[away] || [];
  const hWins = formH.filter(Boolean).length;
  const aWins = formA.filter(Boolean).length;

  // Recent form edge
  if (fH > fA + 0.1)
    signals.push({ label: `${home} hot (${hWins}-${5 - hWins} L5)`, type: 'pos' });
  else if (fA > fH + 0.1)
    signals.push({ label: `${away} hot (${aWins}-${5 - aWins} L5)`, type: 'neg' });

  // Run-differential edge
  if (rdH > rdA + 5)
    signals.push({ label: `${home} +${rdH} run diff edge`, type: 'pos' });
  else if (rdA > rdH + 5)
    signals.push({ label: `${away} +${rdA} run diff edge`, type: 'neg' });

  // Home field always noted
  signals.push({ label: 'Home field +2.2%', type: 'pos' });

  // Record parity
  const hPct = wpct(home), aPct = wpct(away);
  if (Math.abs(hPct - aPct) < 0.05)
    signals.push({ label: 'Even W-L records', type: 'neu' });
  if (hPct > 0.60)
    signals.push({ label: `${home} .${Math.round(hPct * 1000)} season`, type: 'pos' });
  if (aPct > 0.60)
    signals.push({ label: `${away} .${Math.round(aPct * 1000)} away W%`, type: 'neg' });

  return signals.slice(0, 4);
}

/**
 * Convert a win probability to American-style moneyline odds.
 * @param {number} p  Win probability (0–1)
 * @returns {string}  e.g. "−150" or "+130"
 */
function probToML(p) {
  if (p >= 0.5) return '−' + Math.round((p / (1 - p)) * 100);
  return '+' + Math.round(((1 - p) / p) * 100);
}

/**
 * Returns the CSS class for the confidence badge.
 * @param {number} p  Home-win probability
 * @returns {'cp-s'|'cp-l'|'cp-t'}
 */
function confClass(p) {
  const q = Math.max(p, 1 - p);
  return q > 0.70 ? 'cp-s' : q > 0.60 ? 'cp-l' : 'cp-t';
}

/**
 * Returns the display label for the confidence badge.
 * @param {number} p
 * @returns {'STRONG'|'LIKELY'|'TOSS-UP'}
 */
function confLabel(p) {
  const q = Math.max(p, 1 - p);
  return q > 0.70 ? 'STRONG' : q > 0.60 ? 'LIKELY' : 'TOSS-UP';
}


// ============================================================
// §4  AI ANALYSIS  (Anthropic API)
// ============================================================

/** In-memory cache keyed by game ID to avoid duplicate API calls. */
const aiCache = {};

/**
 * Fetch a Claude-powered analysis for a matchup.
 * Calls the Anthropic /v1/messages endpoint directly from the browser.
 *
 * NOTE: In production, proxy this through your own backend so the
 * API key is never exposed client-side. See README for guidance.
 *
 * @param {string} id       Game ID (used as cache key)
 * @param {string} home
 * @param {string} away
 * @param {number} prob     Home-win probability
 * @param {string} context  Extra live context string (score, inning, stats)
 * @returns {Promise<string>}
 */
async function getAI(id, home, away, prob, context) {
  if (aiCache[id]) return aiCache[id];

  const hS   = STANDINGS_RAW[home];
  const aS   = STANDINGS_RAW[away];
  const hPwr = powerRating(home);
  const aPwr = powerRating(away);

  const prompt = `You are an elite MLB analyst. Analyze this matchup with sharp, data-driven insight.

GAME: ${aS?.name || away} (${aS?.w}-${aS?.l}) @ ${hS?.name || home} (${hS?.w}-${hS?.l})
MODEL WIN PROBABILITY: ${hS?.name || home} ${Math.round(prob * 100)}% / ${aS?.name || away} ${Math.round((1 - prob) * 100)}%
POWER RATINGS: ${home} ${hPwr}/100 · ${away} ${aPwr}/100
RECENT FORM: ${home} ${(RECENT_FORM[home] || []).map(v => v ? 'W' : 'L').join('-')} · ${away} ${(RECENT_FORM[away] || []).map(v => v ? 'W' : 'L').join('-')}
RUN DIFF: ${home} ${RUN_DIFF[home] > 0 ? '+' : ''}${RUN_DIFF[home] || 0} · ${away} ${RUN_DIFF[away] > 0 ? '+' : ''}${RUN_DIFF[away] || 0}
${context || ''}

Write a 3-sentence sharp analysis: (1) which team has the edge and why, (2) one key factor that could swing this game, (3) whether you trust this model edge or would fade it. Be direct, analytical, and specific. No fluff.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data.content?.map(c => c.text || '').join('') || 'Analysis unavailable.';
    aiCache[id] = text;
    return text;
  } catch {
    return 'Unable to fetch analysis. Check your network connection or API key.';
  }
}

/**
 * Toggle the AI analysis panel for a given game card.
 * Fetches lazily on first open; uses cache on subsequent toggles.
 * @param {string} id
 * @param {string} home
 * @param {string} away
 * @param {number} prob
 * @param {string} context
 */
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
  btn.classList.add('loading');
  btn.disabled = true;

  const text = await getAI(id, home, away, prob, context);
  box.innerHTML = `<div class="ai-out">
    <div class="ai-head">Claude Analysis</div>
    ${text}
  </div>`;
  box.style.display = 'block';
  btn.innerHTML = '<span>✦</span> Hide Analysis';
  btn.classList.remove('loading');
  btn.disabled = false;
}


// ============================================================
// §5  RENDERERS
// ============================================================

/**
 * Build and append a prediction card to a container element.
 * Works for live, scheduled, and final games.
 * @param {Object} g          Game object
 * @param {HTMLElement} container
 */
function renderCard(g, container) {
  const isLive  = g.status === 'live';
  const isFinal = g.status === 'closed';

  const prob      = isLive ? liveGameProb(g.home, g.away, g.hs, g.as, g.inning, g.stats)
                           : advancedProb(g.home, g.away);
  const awayProb  = 1 - prob;
  const favHome   = prob >= 0.5;
  const favTeam   = favHome ? g.home : g.away;
  const favProb   = Math.max(prob, awayProb);
  const hC        = COLORS[g.home] || '#334155';
  const aC        = COLORS[g.away] || '#64748b';
  const hS        = STANDINGS_RAW[g.home] || { w:0, l:0, name:g.home };
  const aS        = STANDINGS_RAW[g.away] || { w:0, l:0, name:g.away };
  const signals   = getSignals(g.home, g.away);
  const hML       = probToML(prob);
  const aML       = probToML(awayProb);
  const context   = isLive
    ? `LIVE SCORE: ${g.away} ${g.as} - ${g.home} ${g.hs}, ${g.inning}. Home ERA: ${g.stats?.home?.era || 'N/A'}, Away ERA: ${g.stats?.away?.era || 'N/A'}`
    : '';

  const statusHTML = isLive
    ? `<span class="status-tag st-live">⬤ LIVE · ${g.inning || ''}</span>`
    : isFinal
      ? `<span class="status-tag st-final">FINAL</span>`
      : `<span class="status-tag st-sched">SCHEDULED</span>`;

  const scoreHTML = (isLive || isFinal)
    ? `<div class="score-big">
         <span style="color:${aC}">${g.as}</span>
         <span class="score-sep">–</span>
         <span style="color:${hC}">${g.hs}</span>
       </div>`
    : `<div class="vs-at">@</div>
       <div class="ml-row">
         <span class="ml-val"><b>${aML}</b></span>
         <span class="ml-val" style="color:var(--dim)">ML</span>
         <span class="ml-val"><b>${hML}</b></span>
       </div>`;

  const card = document.createElement('div');
  card.className = 'pcard' + (isLive ? ' live' : isFinal ? ' final' : '');
  card.style.animationDelay = (Math.random() * 0.15) + 's';

  card.innerHTML = `
    <div class="pcard-accent" style="--a1:${aC}; --a2:${hC}"></div>

    <div class="pcard-head">
      <span class="pcard-time">${g.time}</span>
      ${statusHTML}
    </div>

    <div class="matchup-row">
      <div class="team-block">
        <div class="tbadge" style="background:${aC}18;border:2px solid ${aC}50;color:${aC}">${g.away}</div>
        <div class="tname">${(aS.name || g.away).split(' ').slice(-1)[0]}</div>
        <div class="trec">${aS.w}-${aS.l}</div>
      </div>
      <div class="mid-zone">
        ${scoreHTML}
        <div class="mid-sub">Power: ${powerRating(g.away)} vs ${powerRating(g.home)}</div>
      </div>
      <div class="team-block">
        <div class="tbadge" style="background:${hC}18;border:2px solid ${hC}50;color:${hC}">${g.home}</div>
        <div class="tname">${(hS.name || g.home).split(' ').slice(-1)[0]}</div>
        <div class="trec">${hS.w}-${hS.l}</div>
      </div>
    </div>

    <div class="prob-section">
      <div class="prob-bar-wrap">
        <div class="pb-a" style="width:${awayProb * 100}%;background:${aC}"></div>
        <div class="pb-h" style="width:${prob * 100}%;background:${hC}"></div>
      </div>
      <div class="prob-pcts">
        <span class="prob-num"><b>${Math.round(awayProb * 100)}%</b> ${g.away}</span>
        <span class="prob-num">${g.home} <b>${Math.round(prob * 100)}%</b></span>
      </div>
    </div>

    <div class="signals">
      <div class="signals-label">Model Signals</div>
      <div class="signal-chips">
        ${signals.map(s => `<span class="sig sig-${s.type}">${s.label}</span>`).join('')}
      </div>
    </div>

    <div class="pcard-footer">
      <div class="fav-info">
        <strong>${favTeam}</strong> ${Math.round(favProb * 100)}%
        · <span style="font-family:var(--mono);font-size:9px">${hML} / ${aML}</span>
      </div>
      <span class="conf-pill ${confClass(prob)}">${confLabel(prob)}</span>
    </div>

    <div class="ai-zone">
      <button class="ai-btn" id="aib-${g.id}"
        onclick="toggleAI('${g.id}','${g.home}','${g.away}',${prob.toFixed(4)},'${context.replace(/'/g, '')}')">
        <span>✦</span> AI Analysis
      </button>
      <div id="ai-${g.id}" style="display:none"></div>
    </div>
  `;

  container.appendChild(card);
}

/**
 * Render the live deep-dive panel for a game with full stats.
 * Appended to #liveDeepDive in the Model tab.
 * @param {Object} g  Live game object with stats
 */
function renderLiveDeepDive(g) {
  const container = document.getElementById('liveDeepDive');
  if (!container) return;

  const prob  = liveGameProb(g.home, g.away, g.hs, g.as, g.inning, g.stats);
  const hC    = COLORS[g.home] || '#334155';
  const aC    = COLORS[g.away] || '#64748b';
  const hStat = g.stats?.home;
  const aStat = g.stats?.away;

  const statRows = [
    { label:'Hits',   h:hStat?.hits,   a:aStat?.hits   },
    { label:'OPS',    h:hStat?.ops,    a:aStat?.ops    },
    { label:'Errors', h:hStat?.errors, a:aStat?.errors },
  ].map(r => `
    <div></div>
    <div style="font-family:var(--mono);font-size:9px;color:var(--dim);text-align:center">${r.label}</div>
    <div style="font-family:var(--mono);font-size:12px;color:${hC};text-align:right">${r.h ?? '—'}</div>
    <div style="font-family:var(--mono);font-size:12px;color:${aC}">${r.a ?? '—'}</div>
  `).join('');

  const div = document.createElement('div');
  div.style.cssText = 'background:var(--s1);border:1px solid var(--accent);border-radius:16px;overflow:hidden;margin-bottom:20px;box-shadow:0 0 30px #00e5ff10';
  div.innerHTML = `
    <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
      <span style="font-family:var(--mono);font-size:10px;color:var(--accent);letter-spacing:.1em">⬤ LIVE MODEL DEEP DIVE</span>
      <span style="font-family:var(--mono);font-size:10px;color:var(--muted)">${g.inning} · ${g.away} ${g.as} – ${g.home} ${g.hs}</span>
    </div>
    <div style="padding:20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px">
      <div>
        <div style="font-family:var(--mono);font-size:9px;color:var(--dim);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px">Live Win Probability</div>
        <div style="font-family:var(--head);font-size:42px;font-weight:800;color:${prob >= .5 ? hC : aC}">${Math.round(Math.max(prob, 1 - prob) * 100)}%</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">${prob >= .5 ? g.home : g.away} to win</div>
        <div style="margin-top:14px">
          <div style="display:flex;height:12px;border-radius:6px;overflow:hidden;gap:2px">
            <div style="width:${(1 - prob) * 100}%;background:${aC};border-radius:6px 0 0 6px"></div>
            <div style="width:${prob * 100}%;background:${hC};border-radius:0 6px 6px 0"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:5px;font-family:var(--mono);font-size:10px;color:var(--muted)">
            <span>${g.away} ${Math.round((1 - prob) * 100)}%</span>
            <span>${Math.round(prob * 100)}% ${g.home}</span>
          </div>
        </div>
      </div>
      <div>
        <div style="font-family:var(--mono);font-size:9px;color:var(--dim);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px">Pitching (Today)</div>
        ${hStat ? `
          <div style="margin-bottom:8px">
            <div style="font-size:11px;font-weight:600;color:${hC};margin-bottom:4px">${g.home}</div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--muted)">ERA ${hStat.era || '—'} · WHIP ${hStat.whip || '—'} · K/9 ${hStat.k9 || '—'}</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:${aC};margin-bottom:4px">${g.away}</div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--muted)">ERA ${aStat?.era || '—'} · WHIP ${aStat?.whip || '—'} · K/9 ${aStat?.k9 || '—'}</div>
          </div>
        ` : '<div style="color:var(--dim);font-size:12px">Stats loading…</div>'}
      </div>
      <div>
        <div style="font-family:var(--mono);font-size:9px;color:var(--dim);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px">Team Stats (Today)</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${statRows}</div>
      </div>
    </div>
  `;
  container.appendChild(div);
}

/**
 * Render AL and NL power-ranking bar-charts in the Model tab.
 */
function renderPowerRankings() {
  const alEl = document.getElementById('alPower');
  const nlEl = document.getElementById('nlPower');
  if (!alEl || !nlEl) return;

  const all    = Object.entries(STANDINGS_RAW).map(([abbr, s]) => ({ abbr, ...s, pwr: powerRating(abbr) }));
  const maxPwr = Math.max(...all.map(t => t.pwr));
  const al     = all.filter(t => t.conf === 'AL').sort((a, b) => b.pwr - a.pwr);
  const nl     = all.filter(t => t.conf === 'NL').sort((a, b) => b.pwr - a.pwr);

  const renderList = (teams, el) => {
    el.innerHTML = teams.map((t, i) => {
      const clr     = COLORS[t.abbr] || '#334155';
      const barW    = Math.round((t.pwr / maxPwr) * 100);
      const recentW = (RECENT_FORM[t.abbr] || []).slice(0, 3).filter(Boolean).length;
      const deltaHTML = recentW >= 2 ? `<span style="color:var(--green)">↑${recentW}</span>`
                      : recentW <= 0 ? `<span style="color:var(--accent2)">↓</span>`
                      :                `<span style="color:var(--muted)">→</span>`;
      return `
        <div class="pr-row">
          <span class="pr-rank">${i + 1}</span>
          <span class="pr-abbr" style="color:${clr}">${t.abbr}</span>
          <div class="pr-bar-wrap">
            <div class="pr-bar" style="width:${barW}%;background:${clr}"></div>
          </div>
          <span class="pr-score">${t.pwr}</span>
          <span class="pr-delta">${deltaHTML}</span>
        </div>`;
    }).join('');
  };

  renderList(al, alEl);
  renderList(nl, nlEl);
}


// ============================================================
// §6  STANDINGS TABLE  (sortable)
// ============================================================

let sortCol = 'pct';
let sortDir = -1;

/**
 * Change the sort column and re-render the standings table.
 * Clicking the same column reverses direction.
 * @param {string} col  Column key
 */
function sortStand(col) {
  if (sortCol === col) sortDir *= -1;
  else { sortCol = col; sortDir = -1; }

  document.querySelectorAll('.stand-table th').forEach(th => th.classList.remove('sorted'));
  const thEl = document.getElementById('th-' + col);
  if (thEl) thEl.classList.add('sorted');

  renderStandingsTable();
}

/** Full standings table render with optional division grouping. */
function renderStandingsTable() {
  const body = document.getElementById('standBody');
  if (!body) return;

  const divOrder = ['AL-East','AL-Central','AL-West','NL-East','NL-Central','NL-West'];
  const divLeaders = {};

  const teams = Object.entries(STANDINGS_RAW).map(([abbr, s]) => {
    const g      = s.w + s.l;
    const pct    = g ? s.w / g : 0;
    const pwr    = powerRating(abbr);
    const rdiff  = RUN_DIFF[abbr] || 0;
    const form   = RECENT_FORM[abbr] || [];
    const streak = (() => {
      let n = 0; const v = form[0];
      for (const x of form) { if (x === v) n++; else break; }
      return (v ? 'W' : 'L') + n;
    })();
    return { abbr, ...s, pct, pwr, rdiff, streak, form, winprob: pct, divKey: s.conf + '-' + s.div };
  });

  // Identify each division leader
  divOrder.forEach(dk => {
    const leader = [...teams.filter(t => t.divKey === dk)].sort((a, b) => b.pct - a.pct)[0];
    if (leader) divLeaders[leader.abbr] = true;
  });

  // Default: group by division sorted by pct
  if (sortCol === 'pct' || sortCol === 'name') {
    body.innerHTML = '';
    divOrder.forEach(dk => {
      const divTeams = teams.filter(t => t.divKey === dk).sort((a, b) => b.pct - a.pct);
      const [conf, div] = dk.split('-');
      const hrow = document.createElement('tr');
      hrow.className = 'div-header';
      hrow.innerHTML = `<td colspan="9">${conf} ${div}</td>`;
      body.appendChild(hrow);
      divTeams.forEach(t => appendStandRow(t, body, !!divLeaders[t.abbr]));
    });
    return;
  }

  // Custom sort (flat list)
  const key = sortCol;
  const sorted = [...teams].sort((a, b) => (b[key] - a[key]) * sortDir);
  body.innerHTML = '';
  sorted.forEach(t => appendStandRow(t, body, !!divLeaders[t.abbr]));
}

/**
 * Append a single standings row to a tbody element.
 * @param {Object}      t         Team data object
 * @param {HTMLElement} body      tbody element
 * @param {boolean}     isLeader  Whether this team leads its division
 */
function appendStandRow(t, body, isLeader) {
  const clr    = COLORS[t.abbr] || '#334155';
  const pctStr = '.' + String(Math.round(t.pct * 1000)).padStart(3, '0');
  const pwr    = t.pwr;
  const pwrClass = pwr >= 60 ? 'pwr-hi' : pwr >= 45 ? 'pwr-md' : 'pwr-lo';

  const formHtml = (t.form || []).map(v =>
    `<span style="font-family:var(--mono);font-size:10px;color:${v ? 'var(--green)' : 'var(--accent2)'}">${v ? 'W' : 'L'}</span>`
  ).join(' ');

  const streakClr = t.streak[0] === 'W' ? 'var(--green)' : 'var(--accent2)';
  const tr = document.createElement('tr');
  if (isLeader) tr.className = 'div-leader';

  tr.innerHTML = `
    <td>
      <span class="st-abbr" style="color:${clr}">${t.abbr}</span>
      <span class="st-name">${(t.name || '').split(' ').slice(-1)[0]}</span>
    </td>
    <td class="st-mono"><b>${t.w}</b></td>
    <td class="st-mono">${t.l}</td>
    <td class="st-mono">
      ${pctStr}
      <span class="pct-bar" style="width:${Math.round(t.pct * 50)}px;background:${clr}"></span>
    </td>
    <td><span class="pwr-score ${pwrClass}">${pwr}</span></td>
    <td class="st-mono">${Math.round(t.pct * 100)}%</td>
    <td class="st-mono" style="color:${t.rdiff >= 0 ? 'var(--green)' : 'var(--accent2)'}">
      ${t.rdiff >= 0 ? '+' : ''}${t.rdiff}
    </td>
    <td>${formHtml}</td>
    <td style="font-family:var(--mono);font-size:11px;color:${streakClr}">${t.streak}</td>
  `;
  body.appendChild(tr);
}


// ============================================================
// §7  ACCURACY LOG
// ============================================================

/** Populate the accuracy log table from RECENT_RESULTS. */
function renderAccuracy() {
  const body = document.getElementById('accBody');
  if (!body) return;

  body.innerHTML = RECENT_RESULTS.map(r => {
    const cc = r.conf === 'STRONG' ? 'conf-s2' : r.conf === 'LIKELY' ? 'conf-l2' : 'conf-t2';
    return `<tr>
      <td class="acc-date">${r.date}</td>
      <td style="font-family:var(--mono);font-size:11px">
        <span style="color:${COLORS[r.away] || '#555'}">${r.away}</span>
        <span style="color:var(--dim)"> @ </span>
        <span style="color:${COLORS[r.home] || '#555'}">${r.home}</span>
        <span style="color:var(--dim);margin-left:6px">${r.awayS}–${r.homeS}</span>
      </td>
      <td style="font-weight:600;color:${COLORS[r.modelPick] || '#555'}">${r.modelPick}</td>
      <td style="font-family:var(--mono)">${r.prob}%</td>
      <td class="${cc}" style="font-family:var(--mono);font-size:10px">${r.conf}</td>
      <td style="font-weight:600;color:${COLORS[r.actual] || '#555'}">${r.actual}</td>
      <td class="${r.correct ? 'result-w' : 'result-l'}">${r.correct ? '✓ YES' : '✗ NO'}</td>
    </tr>`;
  }).join('');
}


// ============================================================
// §8  KPI DASHBOARD STATS
// ============================================================

/** Compute and write KPI values to the DOM. */
function updateKPIs() {
  const allSched  = SCHEDULED;
  const probs     = allSched.filter(g => g.day === 'sat' || g.day === 'sun')
                            .map(g => advancedProb(g.home, g.away));

  const todayCount = LIVE_GAMES.length + allSched.filter(g => g.day === 'sat').length;
  const edges      = probs.map(p => Math.max(p, 1 - p));
  const bestEdge   = probs.length ? Math.round(Math.max(...edges) * 100) : 0;

  const bestGame = allSched.find(g => {
    const p = advancedProb(g.home, g.away);
    return Math.round(Math.max(p, 1 - p) * 100) === bestEdge;
  });

  const avg    = probs.length ? Math.round(edges.reduce((a, e) => a + e, 0) / probs.length * 100) : 0;
  const strong = probs.filter(p => Math.max(p, 1 - p) > 0.70).length;

  document.getElementById('kpi-games').textContent     = todayCount;
  document.getElementById('kpi-games-sub').textContent =
    `${LIVE_GAMES.length} live · ${allSched.filter(g => g.day === 'sat').length} upcoming tonight`;
  document.getElementById('kpi-edge').textContent      = bestEdge + '%';

  if (bestGame) {
    const p   = advancedProb(bestGame.home, bestGame.away);
    const fav = p >= 0.5 ? bestGame.home : bestGame.away;
    const dog = p >= 0.5 ? bestGame.away : bestGame.home;
    document.getElementById('kpi-edge-sub').textContent = `${fav} vs ${dog}`;
  }

  document.getElementById('kpi-avg').textContent    = avg + '%';
  document.getElementById('kpi-strong').textContent = strong;
}


// ============================================================
// §9  TAB NAVIGATION
// ============================================================

const TAB_NAMES = ['predictions', 'live', 'model', 'standings', 'accuracy'];

/**
 * Switch the visible page and highlight the correct tab button.
 * @param {string} name  One of TAB_NAMES
 */
function showTab(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name)?.classList.add('active');
  const idx = TAB_NAMES.indexOf(name);
  document.querySelectorAll('.tab')[idx]?.classList.add('active');
}


// ============================================================
// §10  FULL RENDER
// ============================================================

/**
 * Re-render every section of the app.
 * Called on initial load and on every auto-refresh tick.
 */
function renderAll() {
  // ── Predictions tab ──
  const satEl = document.getElementById('predGames');
  const sunEl = document.getElementById('sunGames');
  const monEl = document.getElementById('monGames');
  if (satEl) { satEl.innerHTML = ''; SCHEDULED.filter(g => g.day === 'sat').forEach(g => renderCard(g, satEl)); }
  if (sunEl) { sunEl.innerHTML = ''; SCHEDULED.filter(g => g.day === 'sun').forEach(g => renderCard(g, sunEl)); }
  if (monEl) { monEl.innerHTML = ''; SCHEDULED.filter(g => g.day === 'mon').forEach(g => renderCard(g, monEl)); }

  // ── Live tab ──
  const liveEl = document.getElementById('liveGamesGrid');
  const finEl  = document.getElementById('finishedGames');
  if (liveEl) {
    liveEl.innerHTML = '';
    LIVE_GAMES.forEach(g => renderCard(g, liveEl));
  }
  if (finEl) {
    finEl.innerHTML = '';
    RECENT_RESULTS.filter(r => r.date === 'Sat Apr 11').slice(0, 6).forEach(r => {
      const g = { id:'f_'+r.home+r.away, home:r.home, away:r.away, time:r.date, status:'closed', hs:r.homeS, as:r.awayS };
      renderCard(g, finEl);
    });
  }

  // ── Model tab ──
  const ddEl = document.getElementById('liveDeepDive');
  if (ddEl) {
    ddEl.innerHTML = '';
    LIVE_GAMES.filter(g => g.stats?.home?.era).forEach(g => renderLiveDeepDive(g));
  }
  renderPowerRankings();

  // ── Standings ──
  renderStandingsTable();

  // ── Accuracy ──
  renderAccuracy();

  // ── KPIs ──
  updateKPIs();
}


// ============================================================
// §11  AUTO-REFRESH ENGINE
// ============================================================

/** Refresh interval in seconds. */
const REFRESH_INTERVAL = 60;
let secs = REFRESH_INTERVAL;

/** Brief green flash across the viewport to signal a refresh. */
function flash() {
  const el = document.createElement('div');
  el.className = 'flash-overlay';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 700);
}

/**
 * Execute a full data + UI refresh.
 * Updates the "last refreshed" chip and resets the countdown.
 */
function doRefresh() {
  flash();
  renderAll();
  secs = REFRESH_INTERVAL;

  const chip = document.getElementById('lastRefreshChip');
  const t    = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  if (chip) {
    chip.textContent     = 'Updated ' + t;
    chip.style.color     = 'var(--green)';
    setTimeout(() => { chip.style.color = ''; }, 2000);
  }
}

/**
 * Trigger an immediate refresh when the user clicks the refresh button.
 * Resets the countdown to zero so doRefresh fires on the next tick.
 */
function manualRefresh() {
  const btn = document.getElementById('manualRefreshBtn');
  if (btn) {
    btn.textContent = '↻ Refreshing…';
    setTimeout(() => { btn.textContent = '↺ Refresh'; }, 1000);
  }
  secs = 0;
}

// 1-second ticker: drives the countdown display and triggers doRefresh.
setInterval(() => {
  secs--;
  const cd   = document.getElementById('countdown');
  const fill = document.getElementById('refreshFill');
  if (cd)   cd.textContent  = secs <= 0 ? '…' : secs;
  if (fill) fill.style.width = (Math.max(0, secs / REFRESH_INTERVAL) * 100) + '%';
  if (secs <= 0) doRefresh();
}, 1000);


// ============================================================
// §12  BOOT
// ============================================================

// Inject spin keyframe (needed for the AI button loading state)
const _spinStyle = document.createElement('style');
_spinStyle.textContent = '@keyframes spin { to { transform: rotate(360deg) } }';
document.head.appendChild(_spinStyle);

// Initial render
renderAll();
