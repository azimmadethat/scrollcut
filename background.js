// ScrollCut — Background Service Worker v2

// ── On install / update ─────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  chrome.alarms.create('dailyReset', {
    when: getNextMidnight(),
    periodInMinutes: 24 * 60
  });

  chrome.storage.local.get(['stats', 'settings'], (data) => {
    // Always ensure stats object exists (never wipe it)
    if (!data.stats) {
      chrome.storage.local.set({
        stats: {
          today: { instagram:0, youtube:0 },
          yesterday: { instagram:0, youtube:0 },
          week: { instagram:0, youtube:0 },
          allTime: { instagram:0, youtube:0 },
          streak: 0,
          lastReset: getTodayKey()
        }
      });
    }

    const isNewInstall     = details.reason === 'install';
    const alreadyOnboarded = data.settings && data.settings.onboarded === true;

    if (isNewInstall && !alreadyOnboarded) {
      // Fresh install — open onboarding, don't touch settings
      chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
    } else {
      // Update or already set up — inject into open tabs
      injectIntoExistingTabs();
    }
  });
});

// ── On Chrome startup — only reset if it's a new day ───────────
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['stats'], (data) => {
    const stats = data.stats || {};
    const today = getTodayKey();
    // Only wipe today's count if we're on a new day
    if (stats.lastReset !== today) {
      stats.today     = { instagram:0, youtube:0 };
      stats.lastReset = today;
      chrome.storage.local.set({ stats });
    }
  });
  injectIntoExistingTabs();
});

// ── Uninstall URL — add your own URL here when ready ────────────
// chrome.runtime.setUninstallURL('https://your-domain.com/goodbye');

function injectIntoExistingTabs() {
  const targets = ['*://*.instagram.com/*', '*://*.youtube.com/*'];
  chrome.tabs.query({ url: targets }, (tabs) => {
    for (const tab of tabs) {
      // Check if already injected before injecting again
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.__reelTrackerLoaded === true
      }).then(results => {
        if (!results?.[0]?.result) {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          }).catch(() => {});
        }
      }).catch(() => {});
    }
  });
}

// ── Daily midnight reset ─────────────────────────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyReset') {
    chrome.storage.local.get(['stats', 'settings'], (data) => {
      const stats    = data.stats    || {};
      const settings = data.settings || { dailyLimit:30 };
      const todayTotal = (stats.today?.instagram || 0) + (stats.today?.youtube || 0);
      const limitSecs  = (settings.dailyLimit || 30) * 60;
      const wasActiveToday = todayTotal > 0;

      let streak = stats.streak || 0;
      // Only update streak if user was actually active today
      if (wasActiveToday) {
        streak = (todayTotal <= limitSecs) ? streak + 1 : 0;
      }
      // If not active, keep streak as-is (don't reward inactivity, don't punish either)

      chrome.storage.local.set({
        stats: {
          today:     { instagram:0, youtube:0 },
          yesterday: { instagram: stats.today?.instagram || 0, youtube: stats.today?.youtube || 0 },
          week: {
            instagram: (stats.week?.instagram || 0) + (stats.today?.instagram || 0),
            youtube:   (stats.week?.youtube   || 0) + (stats.today?.youtube   || 0)
          },
          allTime: {
            instagram: (stats.allTime?.instagram || 0) + (stats.today?.instagram || 0),
            youtube:   (stats.allTime?.youtube   || 0) + (stats.today?.youtube   || 0)
          },
          streak,
          lastReset: getTodayKey()
        }
      });
    });
  }
});

// ── Message handler ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ADD_TIME') {
    chrome.storage.local.get(['stats'], (data) => {
      const stats = data.stats || {
        today: { instagram:0, youtube:0 },
        week:  { instagram:0, youtube:0 },
        allTime: { instagram:0, youtube:0 },
        yesterday: { instagram:0, youtube:0 },
        streak: 0
      };
      const p = msg.platform;
      stats.today[p]   = (stats.today[p]   || 0) + msg.seconds;
      stats.week[p]    = (stats.week[p]    || 0) + msg.seconds;
      stats.allTime[p] = (stats.allTime[p] || 0) + msg.seconds;
      chrome.storage.local.set({ stats });
      sendResponse({ success:true, stats });
    });
    return true;
  }

  if (msg.type === 'GET_STATS') {
    chrome.storage.local.get(['stats', 'settings'], (data) => {
      sendResponse(data);
    });
    return true;
  }

  if (msg.type === 'SAVE_SETTINGS') {
    // Merge into existing settings so onboarded flag is never lost
    chrome.storage.local.get(['settings'], (data) => {
      const existing = data.settings || {};
      const merged   = { ...existing, ...msg.settings };
      chrome.storage.local.set({ settings: merged }, () => {
        // Broadcast to all open IG/YT tabs so commitReason etc stay in sync
        chrome.tabs.query({ url: ['*://*.instagram.com/*', '*://*.youtube.com/*'] }, (tabs) => {
          for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, { type:'SETTINGS_UPDATED', settings: merged }).catch(() => {});
          }
        });
        sendResponse({ ok:true });
      });
    });
    return true;
  }

  if (msg.type === 'CLOSE_TAB') {
    if (sender.tab?.id) chrome.tabs.remove(sender.tab.id);
    return;
  }

  if (msg.type === 'RESUME_ALL_TABS') {
    // Notify all IG/YT tabs to unfreeze
    chrome.tabs.query({ url: ['*://*.instagram.com/*', '*://*.youtube.com/*'] }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id !== sender.tab?.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings: {} }).catch(() => {});
        }
      }
    });
    return;
  }

  if (msg.type === 'RESET_TODAY') {
    chrome.storage.local.get(['stats'], (data) => {
      const stats = data.stats || {};
      stats.today = { instagram:0, youtube:0 };
      chrome.storage.local.set({ stats }, () => sendResponse({ ok:true }));
    });
    return true;
  }
});

function getNextMidnight() {
  const now = new Date();
  const m   = new Date(now);
  m.setHours(24, 0, 0, 0);
  return m.getTime();
}

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}
