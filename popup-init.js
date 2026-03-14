// popup-init.js — instant boot, no DOMContentLoaded delay

// Check onboarding status immediately via storage
chrome.storage.local.get(['settings'], res => {
  const s = res.settings || {};
  if (s.onboarded !== true) {
    const prompt = document.getElementById('setupPrompt');
    if (prompt) prompt.style.display = 'block';
  }
});

// Wire up buttons — safe to do before DOMContentLoaded since
// this script is deferred by being at end of <body>
document.getElementById('openOnboardingBtn')?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
});

document.getElementById('launchIG')?.addEventListener('click', () => {
  chrome.tabs.create({ url:'https://www.instagram.com/reels/' });
  window.close();
});

document.getElementById('launchYT')?.addEventListener('click', () => {
  chrome.tabs.create({ url:'https://www.youtube.com/shorts' });
  window.close();
});
