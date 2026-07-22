# LeetMeC0de [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A personal Chrome extension that syncs accepted LeetCode solutions straight to your own GitHub repository — built as a small, auditable alternative to LeetHub and LeetSync.

> **Note:** This is a personal tool, not a general-purpose sync platform — no OAuth app, no hosted backend, no config-file format beyond the extension's own Settings page. "Configuring" it means editing the plain JS files directly if you want to change behavior beyond what Settings exposes.

---

## Overview

`LeetMeC0de` is a Manifest V3 Chrome extension made of a content script (runs on `leetcode.com`), a page-context injected script (watches your own submissions), and a background service worker (talks to GitHub's REST API). There's no third-party server in the loop — your browser calls `api.github.com` directly, using a GitHub Personal Access Token you generate and scope yourself.

**Compatibility is narrow by design:** built specifically against LeetCode's current submit/check/GraphQL endpoint shapes. See [Compatibility](#compatibility) for exactly what could break if LeetCode changes their frontend.

---

## Features

- 🔄 Detects an **Accepted** verdict on LeetCode and pushes the solution file to GitHub automatically
- 📁 Organizes solutions into `Easy/`, `Medium/`, `Hard/` folders (or flat, your choice) — difficulty is fetched live via LeetCode's public GraphQL endpoint
- 📝 Adds a small header comment to each committed file: runtime, memory, sync timestamp
- 🔐 Uses a fine-grained GitHub Personal Access Token scoped to a single repo — not a broad OAuth grant
- 🧩 No dependencies, no build step, no bundler — plain JS/HTML/CSS you can read top to bottom
- 🎨 Catppuccin Mocha themed popup and Settings page

---

## Built With

- **Platform:** Chrome Extension, Manifest V3
- **Background:** a classic (non-module) service worker — `background.js`
- **Content script:** `leetcode-detector.js`, injected into `https://leetcode.com/problems/*`
- **Page-context hook:** `injected.js`, loaded via `web_accessible_resources` to patch `window.fetch` inside the page's own JS context
- **Backing APIs:** GitHub REST API (`api.github.com/repos/.../contents/...`) and LeetCode's public GraphQL endpoint (`leetcode.com/graphql/`) for difficulty lookup

---

## Getting Started

### Prerequisites

**Required:**
- A Chromium-based browser (Chrome, Brave, etc.) with Developer mode available
- A GitHub account and a repo to hold your solutions
- A GitHub fine-grained Personal Access Token, scoped to that repo only, with **Contents: Read and write**

**No other tooling needed** — no Node, no package manager, no build step.

### Installation

Not published on the Chrome Web Store — install as unpacked:

```bash
git clone https://github.com/Vishwajeet-keni/LeetMeC0de.git
```

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the cloned folder

### Running

1. Click the LeetMeC0de icon → **Open Settings**
2. Fill in: Token, Owner (your GitHub username), Repo, Branch (usually `main`)
3. Click **Test Connection** → confirm `✔ Connected`
4. Save
5. Solve any problem on LeetCode. On **Accepted**, watch the background service worker console (`chrome://extensions` → LeetMeC0de → "service worker") for the sync log

---

## Configuration

There's no separate config file — almost everything is set via the Settings page, backed by `chrome.storage.local`:

- **Folder structure:** toggle "By difficulty" vs "Flat" in Settings — controlled by `config.folderStructure` in `background.js`
- **Include README per problem:** checkbox in Settings — currently reserved for future use (see [Roadmap](#roadmap))
- **File extension mapping:** `EXT_BY_LANG` in `background.js` maps LeetCode's language codes (`python3`, `cpp`, `golang`, etc.) to file extensions — edit this object directly to add a missing language
- **Commit message format:** built in `handleAcceptedSubmission()` in `background.js` — currently `"<slug> — <runtime>, <memory>"`

---

## Modules

| File | Role | Behavior |
|---|---|---|
| `manifest.json` | Extension manifest | Declares permissions, content script, background worker, popup, options page |
| `leetcode-detector.js` | Content script (isolated world) | Injects `injected.js` into the page; relays `postMessage` events to the background worker via `chrome.runtime.sendMessage` |
| `injected.js` | Page-context script | Patches `window.fetch` to watch `/submit/` calls; polls the result-check endpoint until a verdict; fetches difficulty via GraphQL |
| `background.js` | Service worker | Receives accepted-submission messages; builds the file path/content; commits to GitHub via the REST API |
| `popup.html/js/css` | Toolbar popup | Shows connection status, last-sync status, and an enable/disable toggle |
| `options.html/js/css` | Settings page | Token/owner/repo/branch fields, Test Connection button, folder-structure preference |

---

## Data flow

```
LeetCode page (fetch/XHR)
  → injected.js detects /submit/, captures code + language
  → injected.js polls /submissions/detail/<id>/check/ until state === 'SUCCESS'
  → on Accepted: injected.js fetches difficulty via leetcode.com/graphql/
  → postMessage → leetcode-detector.js
  → chrome.runtime.sendMessage → background.js
  → background.js builds path (Easy|Medium|Hard/<slug>/<slug>.<ext>)
  → GitHub REST API: GET contents (check for existing sha) → PUT contents (commit)
```

This is a **poll-and-detect** pattern throughout, not a push-based one — LeetCode doesn't expose a webhook or event stream for submission results, so `injected.js` actively re-checks the verdict endpoint every ~1.2s (up to 15 attempts) rather than waiting on a live push.

---

## Security model

- **No OAuth app, no middleman server.** Your browser calls `api.github.com` directly with a token only you hold.
- **You create and scope the token yourself** — a fine-grained PAT restricted to one repo, `Contents: Read and write` only.
- **Token storage:** `chrome.storage.local` — device-only, never synced across browsers, never sent anywhere but GitHub's API.
- **Minimal `host_permissions`:** `leetcode.com` and `api.github.com` only. No `<all_urls>`, no tabs/history/cookies access.
- **No dependencies.** Every file here is plain, unminified JS/HTML/CSS — read it before you trust it.

---

## Compatibility

**Short answer: current LeetCode frontend only.** Several pieces are tied directly to LeetCode's present implementation, not a stable public API.

**Hard blockers if LeetCode changes:**
- Submission detection depends on the exact URL shapes `/problems/<slug>/submit/` and `/submissions/detail/<id>/check/` — a LeetCode redesign that moves this to GraphQL (as they've done for some other endpoints) would silently break detection.
- Difficulty lookup depends on LeetCode's public, **undocumented** GraphQL schema (`question(titleSlug) { difficulty }`) — this endpoint can change shape without notice.

**Portable on their own:** the GitHub API layer in `background.js` (`getFile`, `upsertFile`) has no LeetCode-specific assumptions — it would work unchanged for syncing content from any source.

---

## Logging & Troubleshooting

**Nothing happens on submit** — open the LeetCode page's own DevTools console; confirm `window.__leetmec0de_lastSubmission` populates after clicking Submit. If it's `undefined`, the submit hook never fired — check the Network tab for the actual `/submit/` request URL and compare against the regex in `injected.js`.

**Detected as Accepted but nothing appears on GitHub** — open the background service worker console (`chrome://extensions` → LeetMeC0de → "service worker"). Confirm `[LeetMeC0de] Got message:` logs, then `handleAcceptedSubmission called with:`, then `Pushing to GitHub:`. If it stops there without `✅ Pushed successfully`, the thrown error (403 = token scope issue, 422 = path/encoding issue) will be in `❌ GitHub push failed:`.

**`Uncaught Error: Extension context invalidated`** — you reloaded the extension in `chrome://extensions` but didn't refresh the LeetCode tab afterward. The old content script is still bound to a now-dead extension context. Refresh the tab (or close and reopen it) after every extension reload.

**Folder structure shows `Unknown/<slug>` instead of `Easy/Medium/Hard`** — the GraphQL difficulty lookup either failed or hadn't resolved yet when the submission was committed. Check the service worker console for `🎯 Difficulty for <slug> = ...`; if it's missing or errors, LeetCode's GraphQL schema may have shifted.

**Test Connection fails** — double-check the fine-grained PAT's repository scope matches the exact `owner/repo` entered in Settings, and that its permission includes **Contents: Read and write**.

---

## Project Structure

```
LeetMeC0de/
├── manifest.json          # Manifest V3 config: permissions, content script, background worker
├── background.js          # Service worker — GitHub REST API calls, path building, commit logic
├── leetcode-detector.js   # Content script (isolated world) — bridges page and extension
├── injected.js            # Page-context script — fetch/XHR patching, verdict polling, difficulty lookup
├── popup.html
├── popup.js
├── popup.css
├── options.html
├── options.js
├── options.css
├── LICENSE
├── .gitignore
└── README.md
```

Everything is intentionally flat — no `lib/` or `content-scripts/` subfolders. An earlier version split things into subfolders with ES module imports, but that added path-mismatch failure modes for no real benefit at this size; flattening it removed an entire class of bugs.

---

## Roadmap

Real open items, not aspirational filler:
- **Per-problem `README.md` with the problem statement** — the Settings toggle exists but isn't wired up yet in this flat rewrite (it was present in an earlier, module-based version that queried full question content via GraphQL).
- **Retroactive re-organization** — solutions committed before the difficulty-folder fix landed (e.g. into a legacy `Solved/` or `Unknown/` folder) aren't moved automatically; this would need a one-off migration script.
- **Harden difficulty detection** — currently a single GraphQL call with no retry; a transient failure just falls back to `Unknown`.
- **Chrome Web Store listing** — currently install-as-unpacked only.

---

## Contributing

This is a personal tool, not a general framework — not actively seeking outside contributions, but feel free to fork and adapt.

---

## License

MIT License — see [LICENSE](LICENSE) for details.
Copyright (c) 2026 Vishwajeet Keni

---

## Acknowledgements

- [LeetCode](https://leetcode.com/) — the platform this syncs from
- [GitHub REST API](https://docs.github.com/en/rest) — the sync destination
- [Catppuccin](https://github.com/catppuccin/catppuccin) — color palette used in the popup/Settings UI