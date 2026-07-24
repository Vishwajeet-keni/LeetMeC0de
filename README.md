# LeetMeC0de [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A personal Chrome extension that syncs accepted LeetCode solutions straight to your own GitHub repository — built as a small, auditable alternative to LeetHub and LeetSync.

> **Note:** This is a personal tool, not a general-purpose sync platform — no OAuth app, no hosted backend, no config-file format beyond the extension's own Settings page. "Configuring" it means editing values in the Settings UI.

---

## 🎯 Overview
`LeetMeC0de` is a **Manifest V3 Chrome extension** that automatically detects when you solve a problem on LeetCode and commits your solution to GitHub. It's built from simple, auditable components:
- **Content script** (`leetcode-detector.js`) — runs on `leetcode.com`
- **Injected script** (`injected.js`) — patches fetch to watch submissions in the page context
- **Background service worker** (`background.js`) — handles GitHub API calls and commits
- **UI** (`popup.html`, `options.html`) — settings and status display

**Compatibility is narrow by design:** the extension is built directly against LeetCode's current endpoint shapes and GraphQL schema. If LeetCode significantly redesigns their submission flow or GraphQL, this extension will need updates.

---

## ✨ Features
- 🔄 **Auto-detect Accepted verdicts** — watches your submissions on LeetCode and triggers a push on success
- 📁 **Smart folder organization** — organize solutions into `Easy/`, `Medium/`, `Hard/` folders (or keep flat). Difficulty is fetched live via LeetCode's public GraphQL
- 📝 **Header comments** — each committed file gets a small header with runtime, memory, and sync timestamp
- 🔐 **Fine-grained tokens only** — uses a GitHub Personal Access Token scoped to a single repository
- 🧩 **Zero dependencies** — plain JS/HTML/CSS, no build step, no bundler, no Node — just code you can read and audit
- 🎨 **Catppuccin Mocha theme** — modern, dark-mode UI in the popup and settings page

---

## 🛠️ Built With

| Component | Purpose |
|-----------|---------|
| **manifest.json** | Manifest V3 config — permissions, content scripts, background worker |
| **background.js** | Service worker — GitHub REST API calls, path building, commit logic |
| **leetcode-detector.js** | Content script — bridges page context and extension |
| **injected.js** | Page-context script — patches fetch, polls for verdicts, fetches metadata |
| **popup.html/js/css** | Toolbar popup — connection status, last sync, enable/disable toggle |
| **options.html/js/css** | Settings page — token, owner, repo, branch, preferences |

---

## 🚀 Quick Start

### Prerequisites
- **Chromium-based browser** (Chrome, Brave, Edge, etc.) with Developer mode
- **GitHub account** with a repository to hold your solutions
- **GitHub fine-grained Personal Access Token**:
  - Scoped to your solutions repository only
  - Permission: **Contents: Read and write**
  - ⚠️ **Never commit this token to version control**

**No other dependencies** — no Node, no npm, no build tools needed.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Vishwajeet-keni/LeetMeC0de.git
   cd LeetMeC0de
   ```

2. **Load as unpacked extension:**
   - Open `chrome://extensions`
   - Enable Developer mode (toggle in top-right)
   - Click Load unpacked → select the cloned folder

3. **Configure the extension:**
   - Click the LeetMeC0de icon in your toolbar → Open Settings
   - Fill in:
     - Token: Your GitHub fine-grained PAT
     - Owner: Your GitHub username
     - Repo: Your solutions repository name
     - Branch: Usually main
   - Click Test Connection → confirm ✔ Connected
   - Click Save

4. **Start solving:**
   - Go to any LeetCode problem
   - Write and submit your solution
   - On Accepted, the extension automatically commits to your repo
   - Check the background service worker logs for details (`chrome://extensions` → LeetMeC0de → "service worker")

---

## ⚙️ Configuration

All settings are managed through the extension's Settings page (backed by `chrome.storage.local`):

### GitHub Access
- **Token:** Your fine-grained Personal Access Token
- **Owner:** Your GitHub username
- **Repo:** Target repository name
- **Branch:** Target branch (default: main)

### Preferences
- **Folder structure:** Choose between:
  - By difficulty (default) — solutions organized as `Easy/`, `Medium/`, `Hard/`
  - Flat — all solutions in the root
- **Include README:** (reserved for future use) Toggle to include problem statements in README.md files per problem

### Language Extensions
The extension supports these languages out of the box:
Python, Java, C, C++, C#, JavaScript, TypeScript, PHP, Swift, Kotlin, Dart, Go, Ruby, Scala, Rust, Racket, Erlang, Elixir

To add a new language, edit `EXT_BY_LANG` in `background.js`:
```javascript
const EXT_BY_LANG = {
  python: 'py', python3: 'py',
  // ... existing mappings ...
  newlang: 'ext'
};
```

---

## 📊 Data Flow

```text
LeetCode page (fetch intercept)
  ↓
injected.js patches window.fetch
  ├→ Captures /submit/ POST: code + language
  ├→ Polls /submissions/detail/<id>/check/ for verdict
  ├→ On Accepted: Fetches difficulty via LeetCode GraphQL
  ↓
postMessage → leetcode-detector.js (content script)
  ↓
chrome.runtime.sendMessage → background.js (service worker)
  ├→ Builds file path: Easy|Medium|Hard/<slug>/<slug>.<ext>
  ├→ Checks for existing file on GitHub (GET)
  ├→ Commits new/updated file (PUT)
  └→ Optionally commits README (if enabled)
```
This is a poll-and-detect pattern — LeetCode doesn't expose webhooks for submission results, so the extension actively re-checks the verdict endpoint every 1.2 seconds for up to 15 attempts.

---

## 🔒 Security Model

- No OAuth, no middleman server. Your browser calls `api.github.com` directly with your token.
- You control the token scope — a fine-grained PAT restricted to one repo, Contents permission only.
- Token storage: `chrome.storage.local` — device-only, never synced, never sent anywhere but GitHub's API.
- Minimal permissions: `leetcode.com` and `api.github.com` only. No `<all_urls>`, no tabs/history/cookies access.
- Auditable code — every file is plain, unminified JS/HTML/CSS. Read it before you trust it.

---

## ⚠️ Compatibility

Short answer: works with current LeetCode frontend only.

**Hard blockers (if LeetCode changes):**
- Submission detection depends on exact URL shapes:
  - `/problems/<slug>/submit/`
  - `/submissions/detail/<id>/check/`
  If LeetCode migrates submission handling to GraphQL or changes these paths, the extension won't detect submissions.
- Difficulty lookup depends on LeetCode's public, undocumented GraphQL schema (`question(titleSlug) { difficulty }`). This can change without notice.

**Portable components:**
- The GitHub API layer (`getFile`, `upsertFile` in `background.js`) has no LeetCode-specific assumptions — it could sync content from any source.

---

## 🧪 Logging & Troubleshooting

**Nothing happens on submit**
- Open LeetCode's DevTools console (F12)
- Look for `[LeetMeC0de]` log messages
- Check that `window.__leetmec0de_lastSubmission` populates after clicking Submit
- If undefined, the fetch hook didn't fire — possible LeetCode page redesign

**Detected as Accepted but nothing on GitHub**
- Open the extension's service worker console:
  `chrome://extensions` → LeetMeC0de → Details → Inspect views: service worker
- Look for `[LeetMeC0de] Got message:` and `[LeetMeC0de] ✅ Pushed successfully`
- If you see an error, check the GitHub API response (token scope, repo access, branch name)

**"Uncaught Error: Extension context invalidated"**
- You reloaded the extension in `chrome://extensions` but didn't refresh the LeetCode tab
- Fix: Reload the LeetCode page (Ctrl+R or Cmd+R) after reloading the extension

**Folder shows Unknown/ instead of Easy/Medium/Hard**
- The GraphQL difficulty lookup either failed or was slow when the submission was committed
- Check: Service worker logs for GraphQL fetch errors
- Note: This is non-fatal; the solution still commits, just to `Unknown/`

**Test Connection fails**
- Double-check the fine-grained PAT's repository scope matches the exact owner/repo you entered
- Confirm the token permission includes Contents: Read and write
- Try re-creating the token if it's old

---

## 📁 Project Structure

```text
LeetMeC0de/
├── manifest.json          # Manifest V3 config
├── background.js          # Service worker — GitHub API + commit logic
├── leetcode-detector.js   # Content script (isolated world)
├── injected.js            # Page-context script (fetch patching)
├── popup.html/js/css      # Toolbar popup UI
├── options.html/js/css    # Settings page UI
├── LICENSE                # MIT License
├── .gitignore
└── README.md
```
The project is intentionally flat — no `lib/` or `src/` subdirectories. An earlier ES6-module version had path-mismatch issues in Manifest V3; the flat structure sidesteps that.

---

## 🗺️ Roadmap

Real, open items (not aspirational):
- Per-problem README.md with problem statement — the UI toggle exists but isn't wired yet (reserved for future implementation)
- Retroactive re-organization — legacy solutions in `Solved/` or `Unknown/` folders aren't auto-moved; would need a migration script
- Harden difficulty detection — currently one GraphQL call with no retry; transient failures fall back to Unknown
- Chrome Web Store listing — currently install-as-unpacked only

---

## 🤝 Contributing
This is a personal tool, not actively seeking outside contributions. Feel free to fork and adapt for your own use.

---

## 📄 License
MIT License — Copyright (c) 2026 Vishwajeet Keni

---

## 🙏 Acknowledgements
- LeetCode — the platform this syncs from
- GitHub REST API — the sync destination
- Catppuccin — color palette for UI
