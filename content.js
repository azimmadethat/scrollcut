// ScrollCut Content Script v9
if (!window.__reelTrackerLoaded && window.self === window.top) {
window.__reelTrackerLoaded = true;

(function () {
  'use strict';

  const IS_IG = location.hostname.includes('instagram.com');
  const IS_YT = location.hostname.includes('youtube.com');
  const PLAT  = IS_IG ? 'instagram' : 'youtube';

  let isWatching    = false;
  let tickInterval  = null;
  let todaySeconds  = 0; // this platform only (IG or YT separately)
  let frozenSeconds = null;
  let settings      = { dailyLimit:30, enabled:true };
  let limitShown    = false;
  let shadowHost    = null;
  let initialized   = false;
  let hiddenAt      = null; // timestamp when tab was hidden while video was playing
  let wasPlayingBeforeHide = false; // was video playing when we hid

  // Track the single video that was playing when we froze
  let pausedVideo   = null;

  function onTarget() {
    const p = location.pathname;
    if (IS_YT) return p.startsWith('/shorts');
    if (IS_IG) return p.startsWith('/reels') || p.startsWith('/reel/') || p === '/';
    return false;
  }

  // Pause only the currently active video, remember it
  function pauseActiveVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    const playing = videos.find(v => !v.paused && !v.ended);
    if (playing) {
      pausedVideo = playing;
    } else if (videos.length > 0) {
      pausedVideo = videos[0];
    }
    // Pause AND mute ALL videos — no background audio leaking through blocker
    videos.forEach(v => { try { v.pause(); v.muted = true; } catch(e){} });
  }

  // Keep everything paused and muted while blocker is active
  function pauseAll() {
    document.querySelectorAll('video').forEach(v => { try { v.pause(); v.muted = true; } catch(e){} });
  }

  // Resume only the video we paused — unmute it too
  function resumePausedVideo() {
    if (pausedVideo) {
      try { pausedVideo.muted = false; pausedVideo.play(); } catch(e){}
      pausedVideo = null;
    }
  }

  function startTracking() {
    if (isWatching || !settings.enabled || !initialized) return;
    isWatching = true;
    tickInterval = setInterval(() => {
      if (!onTarget() || !settings.enabled) { stopTracking(); return; }
      if (document.hidden) return;
      if (frozenSeconds !== null) return;
      todaySeconds += 5;
      chrome.runtime.sendMessage({ type:'ADD_TIME', platform:PLAT, seconds:5 }, ()=>{ if(chrome.runtime.lastError){} });
      checkIntervene();
    }, 5000);
  }

  function stopTracking() {
    if (!isWatching) return;
    isWatching = false;
    clearInterval(tickInterval);
    tickInterval = null;
  }

  let lastHref = location.href;
  function onNav() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    stopTracking();
    // If limit was already hit and they navigate within the same SPA, re-show blocker
    if (limitShown && frozenSeconds !== null && onTarget()) {
      setTimeout(() => { pauseActiveVideo(); showBlocker(); }, 800);
      return;
    }
    if (onTarget()) setTimeout(startTracking, 1200);
  }

  ['pushState','replaceState'].forEach(fn => {
    const orig = history[fn].bind(history);
    history[fn] = (...a) => { orig(...a); setTimeout(onNav, 150); };
  });
  window.addEventListener('popstate', () => setTimeout(onNav, 150));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Note if video was playing when user switched away
      const anyPlaying = Array.from(document.querySelectorAll('video')).some(v => !v.paused && !v.ended);
      wasPlayingBeforeHide = anyPlaying || isWatching;
      if (wasPlayingBeforeHide) {
        hiddenAt = Date.now(); // start wall-clock timer
      }
      stopTracking();
    } else {
      // Tab visible again — if video was playing before, add elapsed time
      if (wasPlayingBeforeHide && hiddenAt !== null && frozenSeconds === null) {
        const rawElapsed = Math.floor((Date.now() - hiddenAt) / 1000);
        // Cap at 30 min — laptop sleep / long away sessions shouldn't dump huge time
        const elapsedSecs = Math.min(rawElapsed, 30 * 60);
        if (elapsedSecs > 0) {
          todaySeconds += elapsedSecs;
          chrome.runtime.sendMessage({ type:'ADD_TIME', platform:PLAT, seconds:elapsedSecs }, ()=>{ if(chrome.runtime.lastError){} });
          checkIntervene();
        }
      }
      hiddenAt = null;
      wasPlayingBeforeHide = false;
      if (settings.enabled && onTarget() && initialized) startTracking();
    }
  });

  if (IS_IG) {
    document.addEventListener('play', (e) => {
      if (e.target.tagName === 'VIDEO' && onTarget()) {
        // If limit is frozen, keep pausing it
        if (frozenSeconds !== null) { try { e.target.pause(); } catch(err){} return; }
        startTracking();
      }
    }, true);
  }

  setInterval(() => {
    onNav();
    if (!settings.enabled)                                        { stopTracking(); return; }
    if (onTarget() && !isWatching && initialized && !document.hidden) startTracking();
    if ((!onTarget() || document.hidden) && isWatching)              stopTracking();
  }, 1000);

  function checkIntervene() {
    const limitAt = (settings.dailyLimit || 30) * 60;
    if (todaySeconds >= limitAt && !limitShown) {
      limitShown    = true;
      frozenSeconds = todaySeconds;
      pauseActiveVideo();
      showBlocker();
    }
  }

  // ── Sound: calm but urgent — three-tone descending chime ────────
  // Sounds like a mindfulness bell, not a fire alarm. Loops softly.
  let _alertCtx   = null;
  let _alertTimer = null;

  function playAlertSound() {
    stopAlertSound();
    try {
      _alertCtx = new (window.AudioContext || window.webkitAudioContext)();
      _chime();
    } catch(e) {}
  }

  function _chime() {
    if (!_alertCtx) return;
    try {
      // Three descending bell-like tones: awareness, not panic
      // Using triangle wave for a softer, bell-like quality
      const tones = [
        { freq:523.25, t:0,    dur:1.2, vol:0.22 },  // C5
        { freq:392.00, t:0.45, dur:1.0, vol:0.18 },  // G4
        { freq:329.63, t:0.85, dur:1.4, vol:0.14 },  // E4
      ];
      const now = _alertCtx.currentTime;
      tones.forEach(({ freq, t, dur, vol }) => {
        const osc  = _alertCtx.createOscillator();
        const gain = _alertCtx.createGain();
        osc.connect(gain);
        gain.connect(_alertCtx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + t);
        // Bell envelope: fast attack, long decay
        gain.gain.setValueAtTime(0, now + t);
        gain.gain.linearRampToValueAtTime(vol, now + t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t + dur);
        osc.start(now + t);
        osc.stop(now + t + dur + 0.05);
      });
      // Repeat every 3.5 seconds — present but not overwhelming
      _alertTimer = setTimeout(_chime, 3500);
    } catch(e) {}
  }

  function stopAlertSound() {
    if (_alertTimer) { clearTimeout(_alertTimer); _alertTimer = null; }
    if (_alertCtx)   { try { _alertCtx.close(); } catch(e){} _alertCtx = null; }
  }

  function showBlocker() {
    removeBlocker();
    chrome.runtime.sendMessage({ type:'GET_STATS' }, (data) => {
      const reason = data?.settings?.commitReason || '';
      _buildBlocker(reason);
    });
  }

  function _buildBlocker(commitReason) {
    const limit       = settings.dailyLimit || 30;
    const displayMins = Math.floor((frozenSeconds ?? todaySeconds) / 60);

    const lines = [
      { top:`Time's up.`,             sub:`You gave Reels ${displayMins} minutes today. That's enough.` },
      { top:`${displayMins} minutes.`,sub:`Every minute here is a minute not building your future.` },
      { top:`Your limit. Your rules.`,sub:`You set ${limit} min. You've hit it. Respect yourself.` },
    ];
    const { top, sub } = lines[Math.floor(Math.random() * lines.length)];

    shadowHost = document.createElement('div');
    shadowHost.id = 'rt-host';
    Object.assign(shadowHost.style, {
      position:'fixed', top:'0', left:'0',
      width:'100vw', height:'100vh',
      zIndex:'2147483647', pointerEvents:'all',
    });

    const shadow = shadowHost.attachShadow({ mode:'open' });

    shadow.innerHTML = `
      <style>
        * { box-sizing:border-box; margin:0; padding:0; }
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Unbounded:wght@700;900&family=DM+Sans:wght@300;400;500&display=swap');
        /* Fallback if fonts blocked */

        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translate3d(0,28px,0)} to{opacity:1;transform:translate3d(0,0,0)} }
        @keyframes ringPulse {
          0%,100% { box-shadow:0 0 0 0 rgba(255,59,59,0); }
          50%     { box-shadow:0 0 60px 12px rgba(255,59,59,0.1); }
        }
        @keyframes swipeAnim {
          0%   { transform:translateX(0px); opacity:0.5; }
          45%  { transform:translateX(22px); opacity:1; }
          65%  { transform:translateX(22px); opacity:1; }
          100% { transform:translateX(0px); opacity:0.5; }
        }
        @keyframes dotPulse {
          0%,100% { opacity:0.2; transform:scale(0.7); }
          50%     { opacity:1;   transform:scale(1); }
        }
        @keyframes reasonIn {
          from { opacity:0; transform:translateY(8px) scale(0.97); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }

        .wrap {
          position:fixed; inset:0;
          background:rgba(3,3,5,0.96);
          backdrop-filter:blur(32px) saturate(0.4);
          display:flex; align-items:center; justify-content:center;
          font-family:'DM Sans',-apple-system,sans-serif;
          animation:fadeIn 0.4s ease;
        }

        .card {
          max-width:310px; width:90vw;
          text-align:center;
          animation:slideUp 0.55s cubic-bezier(0.22,1,0.36,1) 0.08s both;
        }

        /* ── TIME RING ── */
        .time-ring {
          width:136px; height:136px;
          border-radius:50%;
          border:1px solid rgba(255,59,59,0.15);
          background:radial-gradient(circle, rgba(255,59,59,0.07) 0%, transparent 70%);
          display:flex; flex-direction:column;
          align-items:center; justify-content:center;
          margin:0 auto 2rem;
          animation:ringPulse 2.8s ease-in-out infinite;
        }
        .time-num {
          font-family:'Unbounded',sans-serif;
          font-weight:900;
          font-size:clamp(2.8rem,12vw,4rem);
          line-height:1;
          color:#ff3b3b;
          letter-spacing:-0.05em;
        }
        .time-unit {
          font-family:'DM Mono',monospace;
          font-size:0.55rem;
          letter-spacing:0.22em;
          text-transform:uppercase;
          color:#666;
          margin-top:6px;
        }

        /* ── HEADLINE ── */
        .top-text {
          font-family:'Unbounded',sans-serif;
          font-size:clamp(1.4rem,5.5vw,1.8rem);
          font-weight:900;
          color:#fff;
          line-height:1.1;
          letter-spacing:-0.03em;
          margin-bottom:0.55rem;
        }
        .sub-text {
          font-size:0.84rem;
          color:#666;
          line-height:1.6;
          margin-bottom:2rem;
          font-weight:300;
          max-width:100%;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }

        /* ── COMMIT REASON — hero moment ── */
        .commit-reason {
          margin-bottom:1.8rem;
          padding:1.1rem 1.25rem;
          border-radius:14px;
          background:rgba(255,255,255,0.04);
          border:1px solid rgba(255,255,255,0.08);
          text-align:left;
          animation:reasonIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.2s both;
        }
        .commit-text {
          font-family:'Unbounded',sans-serif;
          font-size:clamp(0.9rem,3.5vw,1.1rem);
          font-weight:900;
          color:#fff;
          line-height:1.3;
          letter-spacing:-0.02em;
        }

        /* ── PRIMARY BUTTON ── */
        .btn-main {
          display:block; width:100%;
          padding:1.05rem 1.2rem;
          background:linear-gradient(135deg,#ff3b3b,#ff6b00);
          border:none; border-radius:14px;
          color:#fff; font-weight:600; font-size:0.9rem;
          cursor:pointer; font-family:inherit;
          letter-spacing:0.01em;
          transition:opacity 0.15s, transform 0.12s;
          margin-bottom:1rem;
          box-shadow:0 4px 24px rgba(255,59,59,0.25);
          text-align:center;
        }
        .btn-main:hover { opacity:0.9; transform:translateY(-1px); }
        .btn-main:active { transform:scale(0.98); }

        /* ── SWIPE SECTION ── */
        .swipe-section { margin-top:0.4rem; }

        .swipe-label-row {
          display:flex; align-items:center; justify-content:center; gap:0.5rem;
          margin-bottom:0.6rem;
        }
        .swipe-label-text {
          font-family:'DM Mono',monospace;
          font-size:0.58rem;
          letter-spacing:0.18em;
          text-transform:uppercase;
          color:#666;
        }
        .dots { display:flex; gap:3px; align-items:center; }
        .dots span {
          width:4px; height:4px; border-radius:50%;
          background:#555; display:block;
          animation:dotPulse 1.2s ease-in-out infinite;
        }
        .dots span:nth-child(2) { animation-delay:0.2s; }
        .dots span:nth-child(3) { animation-delay:0.4s; }

        .swipe-track {
          position:relative; width:100%; height:52px;
          background:#0a0a0c;
          border-radius:100px;
          border:1px solid #2a2a2e;
          overflow:hidden;
          cursor:grab; user-select:none; touch-action:none;
        }
        .swipe-track:active { cursor:grabbing; }

        .swipe-fill {
          position:absolute; left:0; top:0; bottom:0;
          width:52px;
          background:linear-gradient(90deg,rgba(255,59,59,0.12),transparent);
          border-radius:100px; pointer-events:none;
        }

        .swipe-thumb {
          position:absolute; left:4px; top:4px;
          width:44px; height:44px;
          background:#161618;
          border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          z-index:2;
          border:1px solid #2a2a2e;
          animation:swipeAnim 2s ease-in-out infinite;
          will-change:transform;
        }
        .swipe-thumb.dragging { animation:none; }
        .swipe-thumb svg { pointer-events:none; }

        .swipe-text {
          position:absolute; inset:0;
          display:flex; align-items:center; justify-content:center;
          font-size:0.62rem; letter-spacing:0.18em;
          text-transform:uppercase;
          color:#888;
          pointer-events:none;
          font-family:'DM Mono',monospace;
          padding-left:58px;
          font-weight:500;
        }

        /* ── COUNTDOWN ── */
        .countdown {
          margin-top:0.55rem;
          font-family:'DM Mono',monospace;
          font-size:0.58rem; letter-spacing:0.12em;
          color:#666; text-align:center;
          text-transform:uppercase;
        }
        .countdown span { color:#999; }
      </style>

      <div class="wrap">
        <div class="card">

          <div class="time-ring">
            <div class="time-num">${displayMins}</div>
            <div class="time-unit">min used</div>
          </div>

          <div class="top-text">${top}</div>
          <p class="sub-text">${sub}</p>

          ${commitReason ? `
          <div class="commit-reason">
            <div class="commit-text">${commitReason}</div>
          </div>` : ''}

          <button class="btn-main" id="rt-go">I'm done for today</button>

          <div class="swipe-section" id="rt-swipe-wrap" style="opacity:0;pointer-events:none;transition:opacity 0.6s ease;">
            <div class="swipe-label-row">
              <div class="dots"><span></span><span></span><span></span></div>
              <span class="swipe-label-text">or keep watching</span>
              <div class="dots"><span></span><span></span><span></span></div>
            </div>
            <div class="swipe-track" id="rt-track">
              <div class="swipe-fill" id="rt-fill"></div>
              <div class="swipe-thumb" id="rt-thumb">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
              <div class="swipe-text">5 more minutes</div>
            </div>
          </div>

          <div class="countdown" id="rt-cd">available in <span id="rt-secs">5</span>s</div>

        </div>
      </div>`;

    // Done button
    shadow.getElementById('rt-go').addEventListener('click', () => {
      stopAlertSound();
      removeBlocker();
      stopTracking();
      // Ask background to close this tab — works regardless of how the tab was opened
      chrome.runtime.sendMessage({ type: 'CLOSE_TAB' });
    });

    // Swipe logic
    (function() {
      const track = shadow.getElementById('rt-track');
      const thumb = shadow.getElementById('rt-thumb');
      const fill  = shadow.getElementById('rt-fill');
      const txt   = shadow.querySelector('.swipe-text');
      const THUMB = 46, PAD = 4, THRESH = 0.76;
      let dragging = false, startX = 0, done = false;

      function maxX() { return track.getBoundingClientRect().width - THUMB - PAD * 2; }

      function onStart(e) {
        if (done) return;
        const cx = e.touches ? e.touches[0].clientX : e.clientX;
        const r  = thumb.getBoundingClientRect();
        if (cx < r.left - 16 || cx > r.right + 16) return;
        dragging = true;
        thumb.classList.add('dragging');
        startX = cx - (parseFloat(thumb.style.left) || PAD);
      }

      function onMove(e) {
        if (!dragging) return;
        e.preventDefault(); e.stopPropagation();
        const cx = e.touches ? e.touches[0].clientX : e.clientX;
        const mx = maxX();
        const left = Math.max(PAD, Math.min(cx - startX, mx + PAD));
        thumb.style.left = left + 'px';
        const p = (left - PAD) / mx;
        fill.style.width = (left + THUMB) + 'px';
        fill.style.background = `linear-gradient(90deg,rgba(255,59,59,${0.18+p*0.42}),transparent)`;
        const r2 = Math.round(28+(255-28)*p), g2 = Math.round(28+(59-28)*p), b2 = Math.round(30+(59-30)*p);
        thumb.style.background = `rgb(${r2},${g2},${b2})`;
        thumb.querySelector('svg').style.opacity = 0.6 + p*0.4;
        txt.style.opacity = Math.max(0, 1 - p * 2.2);
        if (p >= THRESH) complete();
      }

      function onEnd() {
        if (!dragging || done) return;
        dragging = false;
        thumb.classList.remove('dragging');
        thumb.style.transition = 'left 0.38s cubic-bezier(0.34,1.56,0.64,1),background 0.3s';
        fill.style.transition  = 'width 0.38s cubic-bezier(0.34,1.56,0.64,1)';
        thumb.style.left = PAD + 'px';
        fill.style.width = (THUMB + PAD) + 'px';
        thumb.style.background = '';
        thumb.querySelector('svg').style.opacity = 1;
        txt.style.opacity = 1;
        setTimeout(() => { thumb.style.transition=''; fill.style.transition=''; }, 400);
      }

      function complete() {
        if (done) return;
        done = true; dragging = false;
        thumb.style.left = (maxX() + PAD) + 'px';
        thumb.style.background = '#ff3b3b';
        txt.style.opacity = 0;
        setTimeout(() => {
          frozenSeconds = null;
          stopAlertSound();
          removeBlocker();
          // Resume only the single video we paused — no audio chaos
          resumePausedVideo();
          // Re-arm after 5 minutes
          setTimeout(() => { limitShown = false; }, 5 * 60 * 1000);
        }, 320);
      }

      track.addEventListener('mousedown',  onStart);
      track.addEventListener('touchstart', onStart, { passive:false });
      shadow.addEventListener('mousemove',  onMove);
      shadow.addEventListener('touchmove',  onMove, { passive:false });
      shadow.addEventListener('mouseup',    onEnd);
      shadow.addEventListener('touchend',   onEnd);
    })();

    document.documentElement.appendChild(shadowHost);
    playAlertSound();

    // 5s countdown then reveal swipe
    let secsLeft  = 5;
    const secsEl  = shadow.getElementById('rt-secs');
    const swpWrap = shadow.getElementById('rt-swipe-wrap');
    const cdEl    = shadow.getElementById('rt-cd');

    const cdTimer = setInterval(() => {
      secsLeft--;
      if (secsEl) secsEl.textContent = secsLeft;
      if (secsLeft <= 0) {
        clearInterval(cdTimer);
        if (swpWrap) { swpWrap.style.opacity='1'; swpWrap.style.pointerEvents='all'; }
        if (cdEl)    cdEl.style.display = 'none';
      }
    }, 1000);

    // Keep video paused while blocker visible
    const kp = setInterval(() => {
      if (!shadowHost) { clearInterval(kp); clearInterval(cdTimer); return; }
      pauseAll();
    }, 500);
  }

  function removeBlocker() {
    shadowHost?.remove(); shadowHost = null;
    document.getElementById('rt-host')?.remove();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SETTINGS_UPDATED') {
      settings = { ...settings, ...msg.settings };
      if (!settings.enabled) { stopTracking(); removeBlocker(); }
      else if (onTarget() && initialized) startTracking();
    }
  });

  function init() {
    chrome.runtime.sendMessage({ type:'GET_STATS' }, (data) => {
      if (chrome.runtime.lastError) return;
      if (!data?.settings?.onboarded) return;
      if (data?.settings) settings = { ...settings, ...data.settings };
      if (data?.stats) {
        todaySeconds = (data.stats.today?.[PLAT] || 0);
      }
      initialized = true;
      // If we reload and limit was already hit this session, re-show blocker
      const limitAt = (settings.dailyLimit || 30) * 60;
      if (todaySeconds >= limitAt && onTarget() && settings.enabled) {
        // Small delay so page finishes loading
        setTimeout(() => {
          if (!limitShown) {
            limitShown    = true;
            frozenSeconds = todaySeconds;
            pauseActiveVideo();
            showBlocker();
          }
        }, 2000);
      } else if (settings.enabled && onTarget()) {
        setTimeout(startTracking, 1500);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
} // end guard
