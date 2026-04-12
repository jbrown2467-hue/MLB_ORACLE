 *  §1   DATA          standings, colors, form, run-diff, games
 *  §2   MODEL ENGINE  Log5, power rating, advancedProb, liveGameProb
 *  §3   SIGNALS       per-game signal generator + ML odds
 *  §4   AI ANALYSIS   Anthropic API (Claude Sonnet)
 *  §5   CARD RENDER   prediction card builder
 *  §6   LIVE DEEP-DIVE live game stats panel
 *  §7   POWER RANKS   AL/NL bar-chart rankings
 *  §8   STANDINGS     sortable full-standings table
 *  §9   ACCURACY LOG  model vs reality tracker
 *  §10  KPIs          dashboard stat cards
 *  §11  TABS          navigation
 *  §12  RENDER ALL    full page re-render
 *  §13  AUTO-REFRESH  60-second countdown loop
 *  §14  BOOT          init
 * ============================================================
 */

'use strict';

// ============================================================
// §1  DATA  —  current as of Sun Apr 12, 2026 ~1:45 PM EDT
// ============================================================

/**
 * Live 2026 standings. Update w/l daily to keep model current.
 * @type {Object.<string,{w:number,l:number,conf:string,div:string,name:string}>}
 */
const STANDINGS_RAW = {
  // AL East
  NYY:{ w:8,  l:6,  conf:'AL', div:'East',    name:'New York Yankees'      },
  BAL:{ w:7,  l:7,  conf:'AL', div:'East',    name:'Baltimore Orioles'     },
  TB: { w:7,  l:7,  conf:'AL', div:'East',    name:'Tampa Bay Rays'        },
  TOR:{ w:6,  l:8,  conf:'AL', div:'East',    name:'Toronto Blue Jays'     },
  BOS:{ w:5,  l:9,  conf:'AL', div:'East',    name:'Boston Red Sox'        },
  // AL Central
  CLE:{ w:9,  l:6,  conf:'AL', div:'Central', name:'Cleveland Guardians'   },
  MIN:{ w:8,  l:7,  conf:'AL', div:'Central', name:'Minnesota Twins'       },
  KC: { w:7,  l:8,  conf:'AL', div:'Central', name:'Kansas City Royals'    },
  DET:{ w:6,  l:9,  conf:'AL', div:'Central', name:'Detroit Tigers'        },
  CWS:{ w:5,  l:10, conf:'AL', div:'Central', name:'Chicago White Sox'     },
  // AL West
  ATH:{ w:7,  l:7,  conf:'AL', div:'West',    name:'Athletics'             },
  TEX:{ w:7,  l:7,  conf:'AL', div:'West',    name:'Texas Rangers'         },
  LAA:{ w:7,  l:8,  conf:'AL', div:'West',    name:'Los Angeles Angels'    },
  HOU:{ w:6,  l:9,  conf:'AL', div:'West',    name:'Houston Astros'        },
  SEA:{ w:6,  l:9,  conf:'AL', div:'West',    name:'Seattle Mariners'      },
  // NL Central
  PIT:{ w:9,  l:5,  conf:'NL', div:'Central', name:'Pittsburgh Pirates'    },
  CIN:{ w:9,  l:6,  conf:'NL', div:'Central', name:'Cincinnati Reds'       },
  MIL:{ w:8,  l:6,  conf:'NL', div:'Central', name:'Milwaukee Brewers'     },
  STL:{ w:8,  l:6,  conf:'NL', div:'Central', name:'St. Louis Cardinals'   },
  CHC:{ w:6,  l:8,  conf:'NL', div:'Central', name:'Chicago Cubs'          },
  // NL East
  ATL:{ w:9,  l:6,  conf:'NL', div:'East',    name:'Atlanta Braves'        },
  MIA:{ w:8,  l:7,  conf:'NL', div:'East',    name:'Miami Marlins'         },
  PHI:{ w:7,  l:7,  conf:'NL', div:'East',    name:'Philadelphia Phillies' },
  NYM:{ w:7,  l:8,  conf:'NL', div:'East',    name:'New York Mets'         },
  WSH:{ w:6,  l:8,  conf:'NL', div:'East',    name:'Washington Nationals'  },
  // NL West
  LAD:{ w:11, l:3,  conf:'NL', div:'West',    name:'Los Angeles Dodgers'   },
  SD: { w:9,  l:6,  conf:'NL', div:'West',    name:'San Diego Padres'      },
  AZ: { w:8,  l:7,  conf:'NL', div:'West',    name:'Arizona Diamondbacks'  },
  COL:{ w:6,  l:9,  conf:'NL', div:'West',    name:'Colorado Rockies'      },
  SF: { w:6,  l:9,  conf:'NL', div:'West',    name:'San Francisco Giants'  },
};

/** Official primary team colors */
const COLORS = {
  NYY:'#003087', BAL:'#DF4601', TB:'#092C5C',  TOR:'#134A8E', BOS:'#BD3039',
  CLE:'#E31937', MIN:'#002B5C', CWS:'#27251F', KC:'#004687',  DET:'#0C2340',
  TEX:'#003278', HOU:'#002D62', LAA:'#BA0021', ATH:'#003831', SEA:'#0C2C56',
  MIL:'#12284B', CIN:'#C6011F', PIT:'#FDB827', STL:'#C41E3A', CHC:'#0E3386',
  ATL:'#CE1141', MIA:'#00A3E0', NYM:'#002D72', PHI:'#E81828', WSH:'#AB0003',
  LAD:'#005A9C', AZ:'#A71930',  SD:'#2F241D',  COL:'#33006F', SF:'#FD5A1E',
};

/**
 * Season run differential — positive = scoring more than allowing.
 * Updated through Sat Apr 11.
 */
const RUN_DIFF = {
  LAD:+24, ATL:+16, PIT:+14, CIN:+12, SD:+10, MIL:+9,  CLE:+9,  STL:+7,
  NYY:+7,  MIN:+5,  ATH:+4,  MIA:+3,  PHI:+2, AZ:+2,   KC:+1,
  TEX:0,   SF:-2,   LAA:-2,  NYM:-3,  TOR:-4, TB:-4,   BAL:-5,
  HOU:-7,  DET:-8,  COL:-9,  CHC:-10, BOS:-11,SEA:-12, WSH:-13, CWS:-16,
};

/**
 * Last-5 game results per team (1=win 0=loss), most recent first.
 * Updated through Sat Apr 11 final scores.
 */
const RECENT_FORM = {
  LAD:[1,1,1,1,0], CLE:[1,1,0,1,1], ATL:[1,0,1,1,0], PIT:[1,1,1,0,0],
  SD: [1,1,0,0,1], CIN:[0,1,1,1,0], MIL:[0,1,1,0,1], STL:[0,1,1,1,0],
  NYY:[0,1,0,1,1], MIN:[0,1,1,0,1], ATH:[1,0,1,0,1], AZ:[1,0,1,1,0],
  PHI:[0,1,0,1,1], MIA:[0,1,1,0,1], BAL:[1,0,0,1,0], KC:[1,0,1,0,0],
  TEX:[0,0,1,0,1], LAA:[1,0,0,1,0], NYM:[1,0,0,1,0], TOR:[1,0,1,0,0],
  TB: [0,1,0,0,1], BOS:[1,0,0,0,0], SEA:[1,0,0,1,0], SF:[0,0,1,0,0],
  DET:[0,1,0,0,0], COL:[0,1,0,0,0], CHC:[0,0,0,1,0], WSH:[1,0,0,0,0],
  HOU:[0,0,0,1,0], CWS:[1,0,0,0,0],
};

/**
 * Live games — Sun Apr 12, 2026 (~1:45 PM EDT).
 * 7 games currently in progress.
 */
const LIVE_GAMES = [
  { id:'g_bal_sf',  home:'BAL', away:'SF',  time:'Sun 1:35 PM EDT', status:'live',
    hs:2, as:0, inning:'Top 3rd',
    stats:{ home:{ era:'2.1', whip:'1.0', ops:'.560' }, away:{ era:'4.2', whip:'1.3', ops:'.440' } } },
  { id:'g_phi_az',  home:'PHI', away:'AZ',  time:'Sun 1:35 PM EDT', status:'live',
    hs:0, as:0, inning:'Top 2nd',
    stats:{ home:{ era:'3.2', whip:'1.1', ops:'.510' }, away:{ era:'3.8', whip:'1.2', ops:'.490' } } },
  { id:'g_tor_min', home:'TOR', away:'MIN', time:'Sun 1:37 PM EDT', status:'live',
    hs:1, as:0, inning:'Bot 2nd',
    stats:{ home:{ era:'3.5', whip:'1.2', ops:'.520' }, away:{ era:'3.1', whip:'1.1', ops:'.530' } } },
  { id:'g_cin_laa', home:'CIN', away:'LAA', time:'Sun 1:40 PM EDT', status:'live',
    hs:0, as:3, inning:'Top 3rd',
    stats:{ home:{ era:'4.0', whip:'1.3', ops:'.480' }, away:{ era:'2.5', whip:'1.0', ops:'.580' } } },
  { id:'g_det_mia', home:'DET', away:'MIA', time:'Sun 1:40 PM EDT', status:'live',
    hs:3, as:0, inning:'Top 4th',
    stats:{ home:{ era:'1.8', whip:'0.9', ops:'.600' }, away:{ era:'4.5', whip:'1.4', ops:'.430' } } },
  { id:'g_tb_nyy',  home:'TB',  away:'NYY', time:'Sun 1:40 PM EDT', status:'live',
    hs:1, as:0, inning:'Bot 2nd',
    stats:{ home:{ era:'3.2', whip:'1.1', ops:'.510' }, away:{ era:'3.6', whip:'1.2', ops:'.490' } } },
  { id:'g_nym_ath', home:'NYM', away:'ATH', time:'Sun 1:40 PM EDT', status:'live',
    hs:0, as:0, inning:'Top 2nd',
    stats:{ home:{ era:'3.8', whip:'1.2', ops:'.470' }, away:{ era:'3.4', whip:'1.1', ops:'.510' } } },
];

/** Upcoming scheduled games — Sun remaining + Mon + Tue */
const SCHEDULED = [
  // Sunday remaining
  { id:'s_kc_cws',   home:'KC',  away:'CWS', time:'Sun 2:10 PM', day:'sun' },
  { id:'s_mil_wsh',  home:'MIL', away:'WSH', time:'Sun 2:10 PM', day:'sun' },
  { id:'s_stl_bos',  home:'STL', away:'BOS', time:'Sun 2:15 PM', day:'sun' },
  { id:'s_chc_pit',  home:'CHC', away:'PIT', time:'Sun 2:20 PM', day:'sun' },
  { id:'s_sea_hou',  home:'SEA', away:'HOU', time:'Sun 4:10 PM', day:'sun' },
  { id:'s_lad_tex',  home:'LAD', away:'TEX', time:'Sun 4:10 PM', day:'sun' },
  { id:'s_sd_col',   home:'SD',  away:'COL', time:'Sun 4:10 PM', day:'sun' },
  { id:'s_atl_cle',  home:'ATL', away:'CLE', time:'Sun 7:20 PM', day:'sun' },
  // Monday Apr 13
  { id:'m_sea_hou2', home:'SEA', away:'HOU', time:'Mon 4:10 PM', day:'mon' },
  { id:'m_bal_az',   home:'BAL', away:'AZ',  time:'Mon 6:35 PM', day:'mon' },
  { id:'m_pit_wsh',  home:'PIT', away:'WSH', time:'Mon 6:40 PM', day:'mon' },
  { id:'m_phi_chc',  home:'PHI', away:'CHC', time:'Mon 6:40 PM', day:'mon' },
  { id:'m_nyy_laa',  home:'NYY', away:'LAA', time:'Mon 7:05 PM', day:'mon' },
  { id:'m_atl_mia',  home:'ATL', away:'MIA', time:'Mon 7:15 PM', day:'mon' },
  { id:'m_min_bos',  home:'MIN', away:'BOS', time:'Mon 7:40 PM', day:'mon' },
  { id:'m_stl_cle',  home:'STL', away:'CLE', time:'Mon 7:45 PM', day:'mon' },
  { id:'m_ath_tex',  home:'ATH', away:'TEX', time:'Mon 9:40 PM', day:'mon' },
  { id:'m_lad_nym',  home:'LAD', away:'NYM', time:'Mon 10:10 PM',day:'mon' },
  // Tuesday Apr 14
  { id:'t_bal_az2',  home:'BAL', away:'AZ',  time:'Tue 6:35 PM', day:'tue' },
  { id:'t_phi_chc2', home:'PHI', away:'CHC', time:'Tue 6:40 PM', day:'tue' },
  { id:'t_det_kc',   home:'DET', away:'KC',  time:'Tue 6:40 PM', day:'tue' },
  { id:'t_cin_sf',   home:'CIN', away:'SF',  time:'Tue 6:40 PM', day:'tue' },
  { id:'t_pit_wsh2', home:'PIT', away:'WSH', time:'Tue 6:40 PM', day:'tue' },
  { id:'t_nyy_laa2', home:'NYY', away:'LAA', time:'Tue 7:05 PM', day:'tue' },
  { id:'t_atl_mia2', home:'ATL', away:'MIA', time:'Tue 7:15 PM', day:'tue' },
  { id:'t_min_bos2', home:'MIN', away:'BOS', time:'Tue 7:40 PM', day:'tue' },
  { id:'t_mil_tor',  home:'MIL', away:'TOR', time:'Tue 7:40 PM', day:'tue' },
  { id:'t_cws_tb',   home:'CWS', away:'TB',  time:'Tue 7:40 PM', day:'tue' },
  { id:'t_stl_cle2', home:'STL', away:'CLE', time:'Tue 7:45 PM', day:'tue' },
  { id:'t_hou_col',  home:'HOU', away:'COL', time:'Tue 8:10 PM', day:'tue' },
  { id:'t_sd_sea',   home:'SD',  away:'SEA', time:'Tue 9:40 PM', day:'tue' },
];

/** Completed games for accuracy log — through Sat Apr 11 */
const RECENT_RESULTS = [
  { date:'Sat Apr 11', away:'SF',  home:'BAL', modelPick:'BAL', prob:55, conf:'LIKELY',  actual:'BAL', correct:true,  awayS:2,  homeS:6  },
  { date:'Sat Apr 11', away:'BOS', home:'STL', modelPick:'STL', prob:59, conf:'LIKELY',  actual:'BOS', correct:false, awayS:7,  homeS:1  },
  { date:'Sat Apr 11', away:'CLE', home:'ATL', modelPick:'ATL', prob:60, conf:'LIKELY',  actual:'CLE', correct:false, awayS:6,  homeS:0  },
  { date:'Sat Apr 11', away:'WSH', home:'MIL', modelPick:'MIL', prob:66, conf:'LIKELY',  actual:'WSH', correct:false, awayS:3,  homeS:1  },
  { date:'Sat Apr 11', away:'COL', home:'SD',  modelPick:'SD',  prob:68, conf:'LIKELY',  actual:'SD',  correct:true,  awayS:5,  homeS:9  },
  { date:'Sat Apr 11', away:'TEX', home:'LAD', modelPick:'LAD', prob:76, conf:'STRONG',  actual:'LAD', correct:true,  awayS:3,  homeS:6  },
  { date:'Sat Apr 11', away:'HOU', home:'SEA', modelPick:'SEA', prob:53, conf:'TOSS-UP', actual:'SEA', correct:true,  awayS:7,  homeS:8  },
  { date:'Sat Apr 11', away:'MIA', home:'DET', modelPick:'DET', prob:55, conf:'LIKELY',  actual:'DET', correct:true,  awayS:1,  homeS:6  },
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
  { date:'Fri Apr 10', away:'BOS', home:'STL', modelPick:'STL', prob:60, conf:'LIKELY',  actual:'STL', correct:true,  awayS:2,  homeS:3  },
  { date:'Fri Apr 10', away:'COL', home:'SD',  modelPick:'SD',  prob:65, conf:'LIKELY',  actual:'SD',  correct:true,  awayS:2,  homeS:5  },
  { date:'Fri Apr 10', away:'AZ',  home:'PHI', modelPick:'PHI', prob:54, conf:'TOSS-UP', actual:'AZ',  correct:false, awayS:5,  homeS:4  },
  { date:'Fri Apr 10', away:'NYY', home:'TB',  modelPick:'NYY', prob:58, conf:'LIKELY',  actual:'TB',  correct:false, awayS:3,  homeS:5  },
  { date:'Fri Apr 10', away:'LAA', home:'CIN', modelPick:'CIN', prob:61, conf:'LIKELY',  actual:'LAA', correct:false, awayS:10, homeS:2  },
];


// ============================================================
// §2  MODEL ENGINE
// ============================================================

function wpct(abbr) {
  const s = STANDINGS_RAW[abbr];
  if (!s) return 0.5;
  const g = s.w + s.l;
  return g ? s.w / g : 0.5;
}

function recentFormScore(abbr) {
  const f = RECENT_FORM[abbr] || [0,0,0,0,0];
  return f.reduce((acc,v,i) => acc + v*(5-i), 0) / 15;
}

function runDiffScore(abbr) {
  return Math.min(1, Math.max(0, ((RUN_DIFF[abbr]||0) + 40) / 80));
}

function powerRating(abbr) {
  return Math.round(
    (wpct(abbr)*0.30 + recentFormScore(abbr)*0.35 + runDiffScore(abbr)*0.35) * 100
  );
}

function log5(pA, pB) {
  const n=pA-pA*pB, d=pA+pB-2*pA*pB;
  return d ? n/d : 0.5;
}

function advancedProb(home, away) {
  const pH=wpct(home), pA=wpct(away);
  const raw = log5(pH,pA)*0.58
    + (recentFormScore(home)-recentFormScore(away))*0.12
    + (runDiffScore(home)-runDiffScore(away))*0.08
    + 0.022;
  return Math.min(0.90, Math.max(0.12, raw));
}

function liveGameProb(home, away, hs, as_, inningStr, stats) {
  const base     = advancedProb(home, away);
  const diff     = (hs||0)-(as_||0);
  const inn      = parseInt(inningStr)||5;
  const isBot    = inningStr&&inningStr.toLowerCase().includes('bot');
  const effInn   = isBot ? inn-0.5 : inn;
  const remain   = Math.max(0,(9-effInn)/9);
  const leverage = 1-remain*0.6;
  const scoreAdj = diff*0.11*leverage;
  const homeERA  = parseFloat(stats?.home?.era)||4.0;
  const awayERA  = parseFloat(stats?.away?.era)||4.0;
  const pitchAdj = (awayERA-homeERA)*0.015;
  return Math.min(0.97, Math.max(0.03, base+scoreAdj+pitchAdj));
}


// ============================================================
// §3  SIGNALS + HELPERS
// ============================================================

function getSignals(home, away) {
  const signals=[];
  const fH=recentFormScore(home), fA=recentFormScore(away);
  const rdH=RUN_DIFF[home]||0, rdA=RUN_DIFF[away]||0;
  const formH=RECENT_FORM[home]||[], formA=RECENT_FORM[away]||[];
  const hW=formH.filter(Boolean).length, aW=formA.filter(Boolean).length;
  if (fH>fA+0.1)      signals.push({label:`${home} hot (${hW}-${5-hW} L5)`,      type:'pos'});
  else if (fA>fH+0.1) signals.push({label:`${away} hot (${aW}-${5-aW} L5)`,      type:'neg'});
  if (rdH>rdA+6)      signals.push({label:`${home} +${rdH} run diff edge`,        type:'pos'});
  else if (rdA>rdH+6) signals.push({label:`${away} +${rdA} run diff edge`,        type:'neg'});
  signals.push({label:'Home field +2.2%', type:'pos'});
  const hP=wpct(home), aP=wpct(away);
  if (Math.abs(hP-aP)<0.05) signals.push({label:'Even W-L records',              type:'neu'});
  if (hP>0.60) signals.push({label:`${home} .${Math.round(hP*1000)} season`,     type:'pos'});
  if (aP>0.60) signals.push({label:`${away} .${Math.round(aP*1000)} W%`,         type:'neg'});
  return signals.slice(0,4);
}

function probToML(p) {
  return p>=0.5 ? '−'+Math.round((p/(1-p))*100) : '+'+Math.round(((1-p)/p)*100);
}
function confClass(p) { const q=Math.max(p,1-p); return q>0.70?'cp-s':q>0.60?'cp-l':'cp-t'; }
function confLabel(p) { const q=Math.max(p,1-p); return q>0.70?'STRONG':q>0.60?'LIKELY':'TOSS-UP'; }


// ============================================================
// §4  AI ANALYSIS  (Anthropic API)
// ============================================================

const aiCache = {};

async function getAI(id, home, away, prob, context) {
  if (aiCache[id]) return aiCache[id];
  const hS=STANDINGS_RAW[home], aS=STANDINGS_RAW[away];
  const prompt=`You are an elite MLB analyst. Analyze this matchup with sharp, data-driven insight.

GAME: ${aS?.name||away} (${aS?.w}-${aS?.l}) @ ${hS?.name||home} (${hS?.w}-${hS?.l})
DATE: Sunday April 12, 2026
MODEL WIN PROBABILITY: ${hS?.name||home} ${Math.round(prob*100)}% / ${aS?.name||away} ${Math.round((1-prob)*100)}%
POWER RATINGS: ${home} ${powerRating(home)}/100 · ${away} ${powerRating(away)}/100
RECENT FORM (L5): ${home} ${(RECENT_FORM[home]||[]).map(v=>v?'W':'L').join('-')} · ${away} ${(RECENT_FORM[away]||[]).map(v=>v?'W':'L').join('-')}
RUN DIFF: ${home} ${(RUN_DIFF[home]||0)>0?'+':''}${RUN_DIFF[home]||0} · ${away} ${(RUN_DIFF[away]||0)>0?'+':''}${RUN_DIFF[away]||0}
${context||''}

Write a 3-sentence sharp analysis: (1) which team has the edge and why, (2) one key factor that could swing this game, (3) whether you trust this model edge or would fade it. Direct, specific, no fluff.`;

  try {
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1000,messages:[{role:'user',content:prompt}]}),
    });
    const data=await res.json();
    const text=data.content?.map(c=>c.text||'').join('')||'Analysis unavailable.';
    aiCache[id]=text; return text;
  } catch { return 'Unable to fetch analysis. Check network or API key.'; }
}

async function toggleAI(id, home, away, prob, context) {
  const box=document.getElementById('ai-'+id), btn=document.getElementById('aib-'+id);
  if (!box||!btn) return;
  if (box.style.display!=='none'){ box.style.display='none'; btn.innerHTML='<span>✦</span> AI Analysis'; return; }
  btn.innerHTML='<span style="animation:spin .6s linear infinite;display:inline-block">↻</span> Analyzing with Claude…';
  btn.classList.add('loading'); btn.disabled=true;
  const text=await getAI(id,home,away,prob,context);
  box.innerHTML=`<div class="ai-out"><div class="ai-head">Claude Analysis</div>${text}</div>`;
  box.style.display='block';
  btn.innerHTML='<span>✦</span> Hide Analysis';
  btn.classList.remove('loading'); btn.disabled=false;
}


// ============================================================
// §5  CARD RENDER
// ============================================================

function renderCard(g, container) {
  const isLive=g.status==='live', isFinal=g.status==='closed';
  const prob=isLive?liveGameProb(g.home,g.away,g.hs,g.as,g.inning,g.stats):advancedProb(g.home,g.away);
  const awayP=1-prob;
  const hC=COLORS[g.home]||'#334155', aC=COLORS[g.away]||'#64748b';
  const hS=STANDINGS_RAW[g.home]||{w:0,l:0,name:g.home};
  const aS=STANDINGS_RAW[g.away]||{w:0,l:0,name:g.away};
  const signals=getSignals(g.home,g.away);
  const hML=probToML(prob), aML=probToML(awayP);
  const ctx=isLive?`LIVE: ${g.away} ${g.as} - ${g.home} ${g.hs}, ${g.inning}. Home ERA:${g.stats?.home?.era||'N/A'}, Away ERA:${g.stats?.away?.era||'N/A'}`:'';
  const favTeam=prob>=0.5?g.home:g.away;
  const favProb=Math.max(prob,awayP);

  const statusHTML=isLive?`<span class="status-tag st-live">⬤ LIVE · ${g.inning||''}</span>`
    :isFinal?`<span class="status-tag st-final">FINAL</span>`
    :`<span class="status-tag st-sched">SCHEDULED</span>`;

  const scoreHTML=(isLive||isFinal)
    ?`<div class="score-big"><span style="color:${aC}">${g.as}</span><span class="score-sep">–</span><span style="color:${hC}">${g.hs}</span></div>`
    :`<div class="vs-at">@</div><div class="ml-row"><span class="ml-val"><b>${aML}</b></span><span class="ml-val" style="color:var(--dim)">ML</span><span class="ml-val"><b>${hML}</b></span></div>`;

  const card=document.createElement('div');
  card.className='pcard'+(isLive?' live':isFinal?' final':'');
  card.style.animationDelay=(Math.random()*0.15)+'s';
  card.innerHTML=`
    <div class="pcard-accent" style="--a1:${aC};--a2:${hC}"></div>
    <div class="pcard-head"><span class="pcard-time">${g.time}</span>${statusHTML}</div>
    <div class="matchup-row">
      <div class="team-block">
        <div class="tbadge" style="background:${aC}18;border:2px solid ${aC}50;color:${aC}">${g.away}</div>
        <div class="tname">${(aS.name||g.away).split(' ').slice(-1)[0]}</div>
        <div class="trec">${aS.w}-${aS.l}</div>
      </div>
      <div class="mid-zone">${scoreHTML}<div class="mid-sub">Power: ${powerRating(g.away)} vs ${powerRating(g.home)}</div></div>
      <div class="team-block">
        <div class="tbadge" style="background:${hC}18;border:2px solid ${hC}50;color:${hC}">${g.home}</div>
        <div class="tname">${(hS.name||g.home).split(' ').slice(-1)[0]}</div>
        <div class="trec">${hS.w}-${hS.l}</div>
      </div>
    </div>
    <div class="prob-section">
      <div class="prob-bar-wrap">
        <div class="pb-a" style="width:${awayP*100}%;background:${aC}"></div>
        <div class="pb-h" style="width:${prob*100}%;background:${hC}"></div>
      </div>
      <div class="prob-pcts">
        <span class="prob-num"><b>${Math.round(awayP*100)}%</b> ${g.away}</span>
        <span class="prob-num">${g.home} <b>${Math.round(prob*100)}%</b></span>
      </div>
    </div>
    <div class="signals">
      <div class="signals-label">Model Signals</div>
      <div class="signal-chips">${signals.map(s=>`<span class="sig sig-${s.type}">${s.label}</span>`).join('')}</div>
    </div>
    <div class="pcard-footer">
      <div class="fav-info"><strong>${favTeam}</strong> ${Math.round(favProb*100)}% · <span style="font-family:var(--mono);font-size:9px">${hML} / ${aML}</span></div>
      <span class="conf-pill ${confClass(prob)}">${confLabel(prob)}</span>
    </div>
    <div class="ai-zone">
      <button class="ai-btn" id="aib-${g.id}" onclick="toggleAI('${g.id}','${g.home}','${g.away}',${prob.toFixed(4)},'${ctx.replace(/'/g,'')}')">
        <span>✦</span> AI Analysis
      </button>
      <div id="ai-${g.id}" style="display:none"></div>
    </div>`;
  container.appendChild(card);
}


// ============================================================
// §6  LIVE DEEP-DIVE
// ============================================================

function renderLiveDeepDive(g) {
  const container=document.getElementById('liveDeepDive');
  if (!container) return;
  const prob=liveGameProb(g.home,g.away,g.hs,g.as,g.inning,g.stats);
  const hC=COLORS[g.home]||'#334155', aC=COLORS[g.away]||'#64748b';
  const hStat=g.stats?.home, aStat=g.stats?.away;
  const div=document.createElement('div');
  div.style.cssText='background:var(--s1);border:1px solid var(--accent);border-radius:16px;overflow:hidden;margin-bottom:20px;box-shadow:0 0 30px #00e5ff10';
  div.innerHTML=`
    <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
      <span style="font-family:var(--mono);font-size:10px;color:var(--accent);letter-spacing:.1em">⬤ LIVE DEEP DIVE</span>
      <span style="font-family:var(--mono);font-size:10px;color:var(--muted)">${g.inning} · ${g.away} ${g.as} – ${g.home} ${g.hs}</span>
    </div>
    <div style="padding:20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px">
      <div>
        <div style="font-family:var(--mono);font-size:9px;color:var(--dim);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px">Live Win Prob</div>
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
        <div style="font-family:var(--mono);font-size:9px;color:var(--dim);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px">Pitching Today</div>
        <div style="margin-bottom:8px"><div style="font-size:11px;font-weight:600;color:${hC};margin-bottom:4px">${g.home}</div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--muted)">ERA ${hStat?.era||'—'} · WHIP ${hStat?.whip||'—'}</div></div>
        <div><div style="font-size:11px;font-weight:600;color:${aC};margin-bottom:4px">${g.away}</div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--muted)">ERA ${aStat?.era||'—'} · WHIP ${aStat?.whip||'—'}</div></div>
      </div>
      <div>
        <div style="font-family:var(--mono);font-size:9px;color:var(--dim);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px">Team OPS Today</div>
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:11px;color:${hC};font-weight:600">${g.home}</span>
          <span style="font-family:var(--mono);font-size:11px">${hStat?.ops||'—'}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:5px 0">
          <span style="font-size:11px;color:${aC};font-weight:600">${g.away}</span>
          <span style="font-family:var(--mono);font-size:11px">${aStat?.ops||'—'}</span>
        </div>
        <div style="margin-top:12px;font-family:var(--mono);font-size:9px;color:var(--dim)">Power: ${g.home} ${powerRating(g.home)} · ${g.away} ${powerRating(g.away)}</div>
      </div>
    </div>`;
  container.appendChild(div);
}


// ============================================================
// §7  POWER RANKINGS
// ============================================================

function renderPowerRankings() {
  const alEl=document.getElementById('alPower'), nlEl=document.getElementById('nlPower');
  if (!alEl||!nlEl) return;
  const all=Object.entries(STANDINGS_RAW).map(([abbr,s])=>({abbr,...s,pwr:powerRating(abbr)}));
  const maxPwr=Math.max(...all.map(t=>t.pwr));
  const render=(teams,el)=>{
    el.innerHTML=teams.sort((a,b)=>b.pwr-a.pwr).map((t,i)=>{
      const clr=COLORS[t.abbr]||'#334155', barW=Math.round((t.pwr/maxPwr)*100);
      const w3=(RECENT_FORM[t.abbr]||[]).slice(0,3).filter(Boolean).length;
      const d=w3>=2?`<span style="color:var(--green)">↑${w3}</span>`:w3<=0?`<span style="color:var(--accent2)">↓</span>`:`<span style="color:var(--muted)">→</span>`;
      return `<div class="pr-row"><span class="pr-rank">${i+1}</span><span class="pr-abbr" style="color:${clr}">${t.abbr}</span><div class="pr-bar-wrap"><div class="pr-bar" style="width:${barW}%;background:${clr}"></div></div><span class="pr-score">${t.pwr}</span><span class="pr-delta">${d}</span></div>`;
    }).join('');
  };
  render(all.filter(t=>t.conf==='AL'),alEl);
  render(all.filter(t=>t.conf==='NL'),nlEl);
}


// ============================================================
// §8  STANDINGS
// ============================================================

let sortCol='pct', sortDir=-1;

function sortStand(col) {
  if (sortCol===col) sortDir*=-1; else {sortCol=col;sortDir=-1;}
  document.querySelectorAll('.stand-table th').forEach(th=>th.classList.remove('sorted'));
  document.getElementById('th-'+col)?.classList.add('sorted');
  renderStandingsTable();
}

function renderStandingsTable() {
  const body=document.getElementById('standBody');
  if (!body) return;
  const divOrder=['AL-East','AL-Central','AL-West','NL-East','NL-Central','NL-West'];
  const divLeaders={};
  const teams=Object.entries(STANDINGS_RAW).map(([abbr,s])=>{
    const g=s.w+s.l, pct=g?s.w/g:0, pwr=powerRating(abbr), rdiff=RUN_DIFF[abbr]||0;
    const form=RECENT_FORM[abbr]||[];
    let n=0; const v=form[0]; for(const x of form){if(x===v)n++;else break;}
    return{abbr,...s,pct,pwr,rdiff,streak:(v?'W':'L')+n,form,winprob:pct,divKey:s.conf+'-'+s.div};
  });
  divOrder.forEach(dk=>{
    const lead=[...teams.filter(t=>t.divKey===dk)].sort((a,b)=>b.pct-a.pct)[0];
    if(lead) divLeaders[lead.abbr]=true;
  });
  if (sortCol==='pct'||sortCol==='name') {
    body.innerHTML='';
    divOrder.forEach(dk=>{
      const[conf,div]=dk.split('-');
      const hrow=document.createElement('tr'); hrow.className='div-header';
      hrow.innerHTML=`<td colspan="9">${conf} ${div}</td>`; body.appendChild(hrow);
      [...teams.filter(t=>t.divKey===dk)].sort((a,b)=>b.pct-a.pct).forEach(t=>appendStandRow(t,body,!!divLeaders[t.abbr]));
    });
    return;
  }
  body.innerHTML='';
  [...teams].sort((a,b)=>(b[sortCol]-a[sortCol])*sortDir).forEach(t=>appendStandRow(t,body,!!divLeaders[t.abbr]));
}

function appendStandRow(t,body,isLeader) {
  const clr=COLORS[t.abbr]||'#334155';
  const pctStr='.'+String(Math.round(t.pct*1000)).padStart(3,'0');
  const pc=t.pwr>=60?'pwr-hi':t.pwr>=45?'pwr-md':'pwr-lo';
  const formHtml=(t.form||[]).map(v=>`<span style="font-family:var(--mono);font-size:10px;color:${v?'var(--green)':'var(--accent2)'}">${v?'W':'L'}</span>`).join(' ');
  const sc=t.streak[0]==='W'?'var(--green)':'var(--accent2)';
  const tr=document.createElement('tr'); if(isLeader)tr.className='div-leader';
  tr.innerHTML=`
    <td><span class="st-abbr" style="color:${clr}">${t.abbr}</span><span class="st-name">${(t.name||'').split(' ').slice(-1)[0]}</span></td>
    <td class="st-mono"><b>${t.w}</b></td><td class="st-mono">${t.l}</td>
    <td class="st-mono">${pctStr}<span class="pct-bar" style="width:${Math.round(t.pct*50)}px;background:${clr}"></span></td>
    <td><span class="pwr-score ${pc}">${t.pwr}</span></td>
    <td class="st-mono">${Math.round(t.pct*100)}%</td>
    <td class="st-mono" style="color:${t.rdiff>=0?'var(--green)':'var(--accent2)'}">${t.rdiff>=0?'+':''}${t.rdiff}</td>
    <td>${formHtml}</td>
    <td style="font-family:var(--mono);font-size:11px;color:${sc}">${t.streak}</td>`;
  body.appendChild(tr);
}


// ============================================================
// §9  ACCURACY LOG
// ============================================================

function renderAccuracy() {
  const body=document.getElementById('accBody');
  if (!body) return;
  const total=RECENT_RESULTS.length, correct=RECENT_RESULTS.filter(r=>r.correct).length;
  const strong=RECENT_RESULTS.filter(r=>r.conf==='STRONG');
  const likely=RECENT_RESULTS.filter(r=>r.conf==='LIKELY');
  const tossup=RECENT_RESULTS.filter(r=>r.conf==='TOSS-UP');
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('acc-overall',(correct/total*100).toFixed(1)+'%');
  set('acc-strong', strong.length?(strong.filter(r=>r.correct).length/strong.length*100).toFixed(1)+'%':'—');
  set('acc-likely', likely.length?(likely.filter(r=>r.correct).length/likely.length*100).toFixed(1)+'%':'—');
  set('acc-tossup', tossup.length?(tossup.filter(r=>r.correct).length/tossup.length*100).toFixed(1)+'%':'—');
  set('acc-overall-sub',`${correct} of ${total} correct picks`);
  set('acc-strong-sub', `${strong.filter(r=>r.correct).length} of ${strong.length} (>70% prob)`);
  set('acc-likely-sub', `${likely.filter(r=>r.correct).length} of ${likely.length} (60-70% prob)`);
  set('acc-tossup-sub', `${tossup.filter(r=>r.correct).length} of ${tossup.length} (<60% prob)`);
  body.innerHTML=RECENT_RESULTS.map(r=>{
    const cc=r.conf==='STRONG'?'conf-s2':r.conf==='LIKELY'?'conf-l2':'conf-t2';
    return `<tr>
      <td class="acc-date">${r.date}</td>
      <td style="font-family:var(--mono);font-size:11px"><span style="color:${COLORS[r.away]||'#555'}">${r.away}</span><span style="color:var(--dim)"> @ </span><span style="color:${COLORS[r.home]||'#555'}">${r.home}</span><span style="color:var(--dim);margin-left:6px">${r.awayS}–${r.homeS}</span></td>
      <td style="font-weight:600;color:${COLORS[r.modelPick]||'#555'}">${r.modelPick}</td>
      <td style="font-family:var(--mono)">${r.prob}%</td>
      <td class="${cc}" style="font-family:var(--mono);font-size:10px">${r.conf}</td>
      <td style="font-weight:600;color:${COLORS[r.actual]||'#555'}">${r.actual}</td>
      <td class="${r.correct?'result-w':'result-l'}">${r.correct?'✓ YES':'✗ NO'}</td>
    </tr>`;
  }).join('');
}


// ============================================================
// §10  KPIs
// ============================================================

function updateKPIs() {
  const sunSched=SCHEDULED.filter(g=>g.day==='sun');
  const probs=sunSched.map(g=>advancedProb(g.home,g.away));
  const edges=probs.map(p=>Math.max(p,1-p));
  const bestEdge=probs.length?Math.round(Math.max(...edges)*100):0;
  const bestGame=sunSched.find(g=>{const p=advancedProb(g.home,g.away);return Math.round(Math.max(p,1-p)*100)===bestEdge;});
  const avg=probs.length?Math.round(edges.reduce((a,e)=>a+e,0)/probs.length*100):0;
  const strong=probs.filter(p=>Math.max(p,1-p)>0.70).length;
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('kpi-games',LIVE_GAMES.length+sunSched.length);
  set('kpi-games-sub',`${LIVE_GAMES.length} live · ${sunSched.length} upcoming today`);
  set('kpi-edge',bestEdge+'%');
  if(bestGame){const p=advancedProb(bestGame.home,bestGame.away);set('kpi-edge-sub',`${p>=.5?bestGame.home:bestGame.away} vs ${p>=.5?bestGame.away:bestGame.home}`);}
  set('kpi-avg',avg+'%');
  set('kpi-strong',strong);
  set('liveCount',LIVE_GAMES.length);
}


// ============================================================
// §11  TABS
// ============================================================

function showTab(name) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+name)?.classList.add('active');
  const idx=['predictions','live','model','standings','accuracy'].indexOf(name);
  document.querySelectorAll('.tab')[idx]?.classList.add('active');
}


// ============================================================
// §12  RENDER ALL
// ============================================================

function renderAll() {
  // Predictions tab — today=Sun, tomorrow=Mon, day after=Tue
  const todayEl=document.getElementById('predGames');
  const tomorrowEl=document.getElementById('sunGames');
  const dayAfterEl=document.getElementById('monGames');
  if(todayEl)   {todayEl.innerHTML='';   SCHEDULED.filter(g=>g.day==='sun').forEach(g=>renderCard(g,todayEl));}
  if(tomorrowEl){tomorrowEl.innerHTML='';SCHEDULED.filter(g=>g.day==='mon').forEach(g=>renderCard(g,tomorrowEl));}
  if(dayAfterEl){dayAfterEl.innerHTML='';SCHEDULED.filter(g=>g.day==='tue').forEach(g=>renderCard(g,dayAfterEl));}

  // Live tab
  const liveEl=document.getElementById('liveGamesGrid');
  const finEl=document.getElementById('finishedGames');
  if(liveEl){liveEl.innerHTML='';LIVE_GAMES.forEach(g=>renderCard(g,liveEl));}
  if(finEl){
    finEl.innerHTML='';
    RECENT_RESULTS.filter(r=>r.date==='Sat Apr 11').slice(0,6).forEach(r=>{
      renderCard({id:'f_'+r.home+r.away,home:r.home,away:r.away,time:r.date,status:'closed',hs:r.homeS,as:r.awayS},finEl);
    });
  }

  // Model tab
  const ddEl=document.getElementById('liveDeepDive');
  if(ddEl){ddEl.innerHTML='';LIVE_GAMES.filter(g=>g.stats?.home?.era).forEach(g=>renderLiveDeepDive(g));}
  renderPowerRankings();
  renderStandingsTable();
  renderAccuracy();
  updateKPIs();
}


// ============================================================
// §13  AUTO-REFRESH
// ============================================================

const REFRESH_INTERVAL=60;
let secs=REFRESH_INTERVAL;

function flash() {
  const el=document.createElement('div'); el.className='flash-overlay';
  document.body.appendChild(el); setTimeout(()=>el.remove(),700);
}
function doRefresh() {
  flash(); renderAll(); secs=REFRESH_INTERVAL;
  const chip=document.getElementById('lastRefreshChip');
  const t=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  if(chip){chip.textContent='Updated '+t;chip.style.color='var(--green)';setTimeout(()=>{chip.style.color='';},2000);}
}
function manualRefresh() {
  const btn=document.getElementById('manualRefreshBtn');
  if(btn){btn.textContent='↻ Refreshing…';setTimeout(()=>{btn.textContent='↺ Refresh';},1000);}
  secs=0;
}
setInterval(()=>{
  secs--;
  const cd=document.getElementById('countdown'), fill=document.getElementById('refreshFill');
  if(cd) cd.textContent=secs<=0?'…':secs;
  if(fill) fill.style.width=(Math.max(0,secs/REFRESH_INTERVAL)*100)+'%';
  if(secs<=0) doRefresh();
},1000);


// ============================================================
// §14  BOOT
// ============================================================

// Patch header + section labels to today's date
const _hdr=document.querySelector('.header-left p');
if(_hdr) _hdr.textContent='ADVANCED AI PREDICTION MODEL · 2026 SEASON · SUN APR 12';
const _shs=document.querySelectorAll('.sh');
if(_shs[0]) _shs[0].innerHTML="Today's Predictions — Sun Apr 12 <span></span>";
if(_shs[1]) _shs[1].innerHTML="Tomorrow — Mon Apr 13 <span></span>";
if(_shs[2]) _shs[2].innerHTML="Tuesday Preview — Apr 14 <span></span>";

// Inject spin keyframe
const _st=document.createElement('style');
_st.textContent='@keyframes spin{to{transform:rotate(360deg)}}';
document.head.appendChild(_st);

renderAll();
