// onboarding.js — ScrollCut 6-screen setup (CSP compliant)
let limitVal = 15;
let pinCheckInterval = null;

function adjustLimit(delta) {
  limitVal = Math.max(5, Math.min(120, limitVal + delta));
  const num = document.getElementById('pickNum');
  num.textContent = limitVal;
  num.style.color = limitVal <= 15 ? '#00c97a' : limitVal <= 30 ? '#f0f0f0' : limitVal <= 60 ? '#ff6b00' : '#ff3b3b';
  syncPresets();
}

function syncPresets() {
  document.querySelectorAll('.preset').forEach(p => {
    p.classList.toggle('selected', parseInt(p.dataset.val) === limitVal);
  });
}

function goTo(n) {
  // Hide all screens hard — prevent any flash of content
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
    s.style.opacity = '0';
  });

  // Show target: force a reflow between hiding and animating
  // so the browser sees opacity:0 before the animation fires
  const target = document.getElementById('s' + n);
  target.style.display = 'block';
  target.style.opacity = '0';
  void target.offsetWidth; // trigger reflow
  target.classList.add('active');

  // Step dots
  ['dot1','dot2','dot3','dot4','dot5','dot6'].forEach((id, i) => {
    const dot = document.getElementById(id);
    if (!dot) return;
    dot.classList.remove('active', 'done');
    if (i + 1 === n) dot.classList.add('active');
    else if (i + 1 < n) dot.classList.add('done');
  });

  window.scrollTo({ top:0, behavior:'smooth' });

  if (n === 4) startPinDetection();
  else stopPinDetection();
}

function finish(skip) {
  const reason = skip ? '' : document.getElementById('reasonInput').value.trim();
  chrome.storage.local.set({
    settings: {
      dailyLimit: limitVal,
      enabled: true,
      interventionAt: limitVal,
      commitReason: reason,
      onboarded: true
    }
  }, () => {
    document.getElementById('limitDisplay').textContent = limitVal;
    goTo(4);
  });
}

// ── Real-time pin detection ──────────────────────────────────────
// Chrome API: chrome.action.getUserSettings() returns {isOnToolbar: bool}
// Polls every 800ms — enables Continue button the moment they pin it
function startPinDetection() {
  stopPinDetection();
  checkPinned(); // immediate check
  pinCheckInterval = setInterval(checkPinned, 800);
}

function stopPinDetection() {
  if (pinCheckInterval) { clearInterval(pinCheckInterval); pinCheckInterval = null; }
}

function checkPinned() {
  if (!chrome.action || !chrome.action.getUserSettings) return;
  chrome.action.getUserSettings(settings => {
    const isPinned = settings && settings.isOnToolbar;
    const statusEl = document.getElementById('pinStatus');
    const dotEl = document.getElementById('pinDot');
    const textEl = document.getElementById('pinStatusText');
    const btnEl = document.getElementById('btnPinDone');
    if (!statusEl) return;

    if (isPinned) {
      statusEl.classList.add('detected');
      dotEl && (dotEl.style.background = '#00c97a');
      textEl && (textEl.textContent = '📌 Pinned! You\'re ready to continue.');
      if (btnEl) { btnEl.disabled = false; }
      stopPinDetection(); // stop polling once detected
    } else {
      statusEl.classList.remove('detected');
      dotEl && (dotEl.style.background = '#333');
      textEl && (textEl.textContent = 'Waiting for you to pin the extension...');
      if (btnEl) { btnEl.disabled = true; }
    }
  });
}

function goToPlatform(url) {
  document.getElementById('limitFinal').textContent = limitVal;
  const card = document.getElementById('summaryCard');
  if (card) {
    card.innerHTML = `
      <div class="summary-row">
        <span class="summary-key">Destination</span>
        <span class="summary-val" style="font-size:0.75rem;font-family:'DM Sans'">${url.includes('instagram') ? 'Instagram Reels' : 'YouTube Shorts'}</span>
      </div>
      <div class="summary-row">
        <span class="summary-key">Limit</span>
        <span class="summary-val red">${limitVal} min</span>
      </div>
      <div class="summary-row">
        <span class="summary-key">Timer</span>
        <span class="summary-val" style="color:#00c97a">Started ✓</span>
      </div>`;
  }
  goTo(6);
  setTimeout(() => { window.location.href = url; }, 1200);
}

document.addEventListener('DOMContentLoaded', () => {
  // Nav
  document.getElementById('btnS1Next').addEventListener('click', () => goTo(2));
  document.getElementById('btnS2Next').addEventListener('click', () => goTo(3));
  document.getElementById('btnS3Next').addEventListener('click', () => finish(false));
  document.getElementById('btnS3Skip').addEventListener('click', () => finish(true));
  document.getElementById('btnPinDone').addEventListener('click', () => { stopPinDetection(); goTo(5); document.getElementById('limitDisplay').textContent = limitVal; });
  document.getElementById('btnPinSkip').addEventListener('click', () => { stopPinDetection(); goTo(5); document.getElementById('limitDisplay').textContent = limitVal; });

  // Platforms
  document.getElementById('btnIG').addEventListener('click', () => goToPlatform('https://www.instagram.com/reels/'));
  document.getElementById('btnYT').addEventListener('click', () => goToPlatform('https://www.youtube.com/shorts'));
  document.getElementById('btnJustClose').addEventListener('click', () => window.close());

  // Limit
  document.getElementById('decBtn').addEventListener('click', () => adjustLimit(-5));
  document.getElementById('incBtn').addEventListener('click', () => adjustLimit(5));
  document.querySelectorAll('.preset').forEach(p => {
    p.addEventListener('click', () => {
      limitVal = parseInt(p.dataset.val);
      document.getElementById('pickNum').textContent = limitVal;
      document.getElementById('pickNum').style.color = limitVal <= 15 ? '#00c97a' : limitVal <= 30 ? '#f0f0f0' : limitVal <= 60 ? '#ff6b00' : '#ff3b3b';
      syncPresets();
    });
  });

  syncPresets();
});
