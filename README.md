# ScrollCut — Reels & Shorts Limiter

> Cut your scroll time. Keep your focus.

ScrollCut is a free Chrome extension that limits your daily time on Instagram Reels and YouTube Shorts. Set a limit, hit it, get blocked. No account. No data collected. No BS.

![ScrollCut](https://raw.githubusercontent.com/azimmadethat/scrollcut/main/docs/banner.png)

---

## Features

- **Daily time limits** — Set between 5 and 120 minutes per day
- **Separate tracking** — Instagram Reels and YouTube Shorts counted independently
- **Blocker screen** — Full-page block when you hit your limit
- **Your "why"** — Write a personal reminder that shows on the blocker
- **+5 min grace** — Consciously extend if you need a little more time
- **100% local** — All data stays on your device. Zero servers.
- **Free forever** — No account, no subscription, no catch

---

## Install

**[→ Add to Chrome](https://chrome.google.com/webstore/detail/scrollcut)**

Or load unpacked for development:

```bash
git clone https://github.com/azimmadethat/scrollcut.git
cd scrollcut
# Open chrome://extensions → Enable Developer mode → Load unpacked → select /extension folder
```

---

## How it works

1. Install the extension
2. Set your daily limit (e.g. 20 min)
3. Write your "why" — what you'd rather be doing
4. ScrollCut tracks silently in the background
5. When you hit your limit — full blocker appears
6. Your own words stare back at you

---

## Privacy

**We collect nothing.**

All data (your limit, usage time, "why" text) is stored locally using Chrome's storage API. It never leaves your browser. No analytics. No tracking. No third parties.

[→ Full Privacy Policy](https://azimmadethat.github.io/scrollcut)

---

## Repo structure

```
scrollcut/
├── extension/          ← Chrome extension source
│   ├── manifest.json
│   ├── content.js      ← Tracker + blocker logic
│   ├── background.js   ← Service worker
│   ├── popup.html/js   ← Extension popup UI
│   ├── onboarding.html ← First-run setup flow
│   └── icons/
├── docs/               ← GitHub Pages (privacy policy)
│   └── index.html
└── README.md
```

---

## Tech

- Manifest V3
- Vanilla JS — no frameworks, no dependencies
- Chrome Storage API (local only)
- Web Audio API (alert chime)
- Shadow DOM (blocker screen isolation)

---

## Screenshots

| Popup | Time's Up | Setup |
|-------|-----------|-------|
| ![](docs/ss1.png) | ![](docs/ss2.png) | ![](docs/ss3.png) |

---

## License

MIT — free to use, fork, and build on.

---

Built by [@azimmadethat](https://github.com/azimmadethat)
