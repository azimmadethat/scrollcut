// ScrollCut — Popup v10 (instant load, always-visible reason, smooth open/close)

const $ = id => document.getElementById(id);

function fmtHrMin(s) {
  return `${Math.floor(s/3600)}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}`;
}
function fmtMin(s) {
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
}
function lifeLost(m, lim) {
  if (!m)          return { msg:"You're doing great today.", bad:false };
  if (m < 5)       return { msg:`${m} min gone. Still recoverable.`, bad:false };
  if (m < 15)      return { msg:`${m} min of your life — on Reels.`, bad:false };
  if (m < lim*.5)  return { msg:`${m} min you can't get back.`, bad:false };
  if (m < lim)     return { msg:`Almost at your limit. Don't.`, bad:true };
  if (m < 60)      return { msg:`${m} min gone. That's real time.`, bad:true };
  if (m < 90)      return { msg:`1+ hour lost. A skill ungained.`, bad:true };
  if (m < 120)     return { msg:`${m} min — ${Math.round(m*365/60)}hrs/year.`, bad:true };
  return                  { msg:`${Math.floor(m/60)}h ${m%60}m. Is this your life?`, bad:true };
}

let dailyLimit = 30, enabled = true;

let _els = null;
function els() {
  if (_els) return _els;
  _els = {
    tog:      $('mainTog'),
    pwrLbl:   $('pwrLbl'),
    limVal:   $('limVal'),
    limitLbl: $('limitLabel'),
    limitUsd: $('limitUsed'),
    bigTime:  $('bigTime'),
    lifeLost: $('lifeLost'),
    igTime:   $('igTime'),
    ytTime:   $('ytTime'),
    fill:     $('progressFill'),
    pct:      $('progressPct'),
    commit:   $('commitInput'),
  };
  return _els;
}

function render(data) {
  const stats    = data.stats    || {};
  const settings = data.settings || {};
  const e        = els();

  dailyLimit = settings.dailyLimit || 30;
  enabled    = settings.enabled !== false;

  // Always show commit row — restore saved reason if any
  if (settings.commitReason && e.commit && !e.commit._userEditing) {
    e.commit.value = settings.commitReason;
  }

  e.tog.checked        = enabled;
  e.pwrLbl.textContent = enabled ? 'ON' : 'OFF';
  e.limVal.textContent = dailyLimit;
  e.limitLbl.textContent = `Limit: ${dailyLimit} min`;

  const ig   = stats.today?.instagram || 0;
  const yt   = stats.today?.youtube   || 0;
  const tot  = ig + yt;
  const mins = Math.floor(tot / 60);
  const pct  = tot / (dailyLimit * 60);

  e.limitUsd.textContent = `Used: ${mins} min today`;
  e.bigTime.textContent  = fmtHrMin(tot);
  e.bigTime.className    = 'hero-time' + (pct>=1?' over':pct>=.67?' warn':'');
  e.igTime.textContent   = fmtMin(ig);
  e.ytTime.textContent   = fmtMin(yt);

  const p = Math.min(100, pct*100);
  e.fill.style.width  = p + '%';
  e.fill.className    = 'progress-fill' + (pct>=1?' full':pct>=.67?' mid':'');
  e.pct.textContent   = `${Math.round(p)}% of daily limit`;

  const { msg, bad } = lifeLost(mins, dailyLimit);
  e.lifeLost.textContent = msg;
  e.lifeLost.className   = 'life-lost' + (bad?' bad':'');

  document.body.classList.toggle('is-off', !enabled);
}

// Load stats from background — called immediately on open
function load() {
  chrome.runtime.sendMessage({ type:'GET_STATS' }, data => {
    if (chrome.runtime.lastError || !data) return;
    render(data);
  });
}

function save() {
  const reason = els().commit?.value.trim() || '';
  chrome.runtime.sendMessage({
    type:'SAVE_SETTINGS',
    settings:{ dailyLimit, enabled, interventionAt:dailyLimit*60, commitReason:reason }
  });
}

function broadcast() {
  chrome.tabs.query({ active:true, currentWindow:true }, tabs => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id,
      { type:'SETTINGS_UPDATED', settings:{ dailyLimit, enabled } }
    ).catch(()=>{});
  });
}

// ── INSTANT load on popup open — no waiting for DOMContentLoaded ──
// Both storage (fast, local) and stats message fire immediately
chrome.storage.local.get(['settings'], res => {
  const s = res.settings || {};
  dailyLimit = s.dailyLimit || 30;
  enabled    = s.enabled !== false;
  const e    = els();

  // Pre-fill from storage before message round-trip completes
  e.tog.checked        = enabled;
  e.pwrLbl.textContent = enabled ? 'ON' : 'OFF';
  e.limVal.textContent = dailyLimit;
  e.limitLbl.textContent = `Limit: ${dailyLimit} min`;
  if (s.commitReason) e.commit.value = s.commitReason;
  document.body.classList.toggle('is-off', !enabled);
});

// Then get live stats immediately
load();

// Refresh every 4s while popup is open
let _interval = setInterval(load, 4000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearInterval(_interval); }
  else { load(); _interval = setInterval(load, 4000); }
});

// ── COMMIT INPUT — always visible, save on blur/change ──
const ci = $('commitInput');
if (ci) {
  ci.addEventListener('focus', () => { ci._userEditing = true; });
  ci.addEventListener('blur',  () => { ci._userEditing = false; save(); });
  ci.addEventListener('change', save);
}

// ── CONTROLS ──
$('mainTog').addEventListener('change', e => {
  enabled = e.target.checked;
  els().pwrLbl.textContent = enabled ? 'ON' : 'OFF';
  document.body.classList.toggle('is-off', !enabled);
  save(); broadcast();
});

$('limMinus').addEventListener('click', () => {
  if (dailyLimit <= 5) return;
  dailyLimit -= 5;
  els().limVal.textContent   = dailyLimit;
  els().limitLbl.textContent = `Limit: ${dailyLimit} min`;
  save();
});

$('limPlus').addEventListener('click', () => {
  if (dailyLimit >= 120) return;
  dailyLimit += 5;
  els().limVal.textContent   = dailyLimit;
  els().limitLbl.textContent = `Limit: ${dailyLimit} min`;
  save();
});

$('resetBtn').addEventListener('click', () => {
  const btn = $('resetBtn');
  if (btn._confirming) {
    btn._confirming = false;
    btn.querySelector('span') ? btn.querySelector('span').textContent = 'Reset today\'s time' : null;
    btn.style.color = '';
    chrome.runtime.sendMessage({ type:'RESET_TODAY' }, () => load());
    return;
  }
  btn._confirming = true;
  btn.style.color = '#ff3b3b';
  const orig = btn.innerHTML;
  btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg> Tap again to confirm';
  setTimeout(() => {
    if (btn._confirming) {
      btn._confirming = false;
      btn.innerHTML = orig;
      btn.style.color = '';
    }
  }, 3000);
});
