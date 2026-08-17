console.log('[LeetMeC0de] Service worker started');

const API_BASE = 'https://api.github.com';
const MAX_HISTORY = 10;

const EXT_BY_LANG = {
  python: 'py', python3: 'py', java: 'java', c: 'c', cpp: 'cpp', 'c++': 'cpp',
  csharp: 'cs', javascript: 'js', typescript: 'ts', php: 'php', swift: 'swift',
  kotlin: 'kt', dart: 'dart', golang: 'go', ruby: 'rb', scala: 'scala',
  rust: 'rs', racket: 'rkt', erlang: 'erl', elixir: 'ex'
};

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

// LeetCode slugs are lowercase-kebab-case; difficulty is one of a fixed set.
// Anything else is untrusted input that must never reach a file path unchecked.
const SLUG_RE = /^[a-z0-9-]{1,120}$/;
const VALID_DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard', 'Unknown']);

function isSafePathSegment(segment) {
  return typeof segment === 'string' &&
    segment.length > 0 &&
    !segment.includes('/') &&
    !segment.includes('\\') &&
    segment !== '.' &&
    segment !== '..';
}

function validateSubmissionPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid submission payload');
  }
  if (typeof payload.slug !== 'string' || !SLUG_RE.test(payload.slug)) {
    throw new Error('Invalid or unexpected problem slug');
  }
  if (!isSafePathSegment(payload.slug)) {
    throw new Error('Unsafe problem slug');
  }
  const difficulty = payload.difficulty || 'Unknown';
  if (!VALID_DIFFICULTIES.has(difficulty) || !isSafePathSegment(difficulty)) {
    throw new Error('Invalid difficulty value');
  }
  if (typeof payload.code !== 'string' || payload.code.length === 0) {
    throw new Error('Missing submission code');
  }
  return true;
}

function b64EncodeUnicode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

async function getFile({ token, owner, repo, path, branch }) {
  const url = `${API_BASE}/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${branch}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// knownSha: pass the sha you already fetched to skip a redundant GET.
// - undefined  -> look it up (default, backward compatible)
// - null       -> known not to exist, skip lookup, create new file
// - a string   -> known sha, skip lookup, update existing file
async function upsertFile({ token, owner, repo, path, content, message, branch, knownSha }) {
  let sha = knownSha;
  if (sha === undefined) {
    const existing = await getFile({ token, owner, repo, path, branch });
    sha = existing ? existing.sha : null;
  }

  const body = { message, content: b64EncodeUnicode(content), branch };
  if (sha) body.sha = sha;

  const url = `${API_BASE}/repos/${owner}/${repo}/contents/${encodePath(path)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub write failed: ${res.status} ${errText}`);
  }
  return res.json();
}

async function getConfig() {
  const stored = await chrome.storage.local.get([
    'token', 'owner', 'repo', 'branch', 'folderStructure', 'includeReadme', 'enabled'
  ]);
  return {
    token: '', owner: '', repo: '', branch: 'main',
    folderStructure: 'by-difficulty', includeReadme: true, enabled: true,
    ...stored
  };
}

function buildHeaderComment(payload, ext, difficulty) {
  const commentStyles = { py: '#', rb: '#' };
  const marker = commentStyles[ext] || '//';
  return [
    `${marker} ${payload.title || payload.slug}`,
    `${marker} Difficulty: ${difficulty}`,
    `${marker} Runtime: ${payload.runtime || 'N/A'} | Memory: ${payload.memory || 'N/A'}`,
    `${marker} Synced via LeetMeC0de on ${new Date().toISOString()}`
  ].join('\n');
}

// Pushes one entry onto the sync history array, capped at MAX_HISTORY, newest first.
async function pushHistoryEntry(entry) {
  const { syncHistory = [] } = await chrome.storage.local.get('syncHistory');
  const updated = [{ ...entry, at: Date.now() }, ...syncHistory].slice(0, MAX_HISTORY);
  await chrome.storage.local.set({ syncHistory: updated });
  // Keep lastSyncStatus for backward compatibility with anything still reading it.
  await chrome.storage.local.set({ lastSyncStatus: { ...entry, at: Date.now() } });
}

async function handleAcceptedSubmission(payload) {
  console.log('[LeetMeC0de] handleAcceptedSubmission called with:', payload);
  const config = await getConfig();

  if (config.enabled === false) {
    console.log('[LeetMeC0de] Sync disabled, skipping');
    return;
  }
  if (!config.token || !config.owner || !config.repo) {
    console.warn('[LeetMeC0de] Not configured');
    await pushHistoryEntry({ slug: payload.slug, status: 'failed', title: 'Not configured', message: 'Open extension options to add your GitHub token and repo.' });
    return;
  }

  try {
    validateSubmissionPayload(payload);
  } catch (err) {
    console.error('[LeetMeC0de] ❌ Rejected suspicious submission payload:', err.message, payload);
    await pushHistoryEntry({ slug: typeof payload?.slug === 'string' ? payload.slug.slice(0, 60) : 'unknown', status: 'failed', title: 'Blocked', message: err.message });
    return;
  }

  const ext = EXT_BY_LANG[payload.lang] || 'txt';
  const folderName = payload.slug;
  const difficulty = payload.difficulty || 'Unknown';
  const basePath = config.folderStructure === 'flat'
    ? folderName
    : `${difficulty}/${folderName}`;
  const codePath = `${basePath}/${payload.slug}.${ext}`;

  const header = buildHeaderComment(payload, ext, difficulty);
  const fullContent = `${header}\n\n${payload.code}`;

  const commitMessage = `${payload.slug} — ${payload.runtime || 'N/A'}, ${payload.memory || 'N/A'}`;

  try {
    console.log('[LeetMeC0de] Checking existing file:', codePath);
    const existingCode = await getFile({ ...config, path: codePath });

    let skippedCode = false;
    if (existingCode && existingCode.content) {
      const existingDecoded = decodeURIComponent(escape(atob(existingCode.content.replace(/\n/g, ''))));
      // Strip everything up to and including the header block before comparing,
      // since the header always contains a fresh timestamp.
      const existingBody = existingDecoded.split('\n\n').slice(1).join('\n\n').trim();
      const newBody = payload.code.trim();
      if (existingBody === newBody) {
        console.log('[LeetMeC0de] ⏭️ Code unchanged, skipping commit');
        skippedCode = true;
      }
    }

    if (!skippedCode) {
      console.log('[LeetMeC0de] Pushing to GitHub:', codePath);
      await upsertFile({
        ...config,
        path: codePath,
        content: fullContent,
        message: commitMessage,
        knownSha: existingCode ? existingCode.sha : null
      });
      console.log('[LeetMeC0de] ✅ Pushed successfully');
    }

    if (config.includeReadme) {
      const readmePath = `${basePath}/README.md`;

      try {
        const existingReadme = await getFile({ ...config, path: readmePath });
        if (existingReadme) {
          console.log('[LeetMeC0de] 📄 README already exists, skipping (same problem, different language)');
        } else {
          const readmeContent = [
            `# ${payload.title || payload.slug}`,
            ``,
            `**Difficulty:** ${difficulty}`,
            ``,
            payload.problemContent || '_Problem statement unavailable._',
            ``
          ].join('\n');

          await upsertFile({
            ...config,
            path: readmePath,
            content: readmeContent,
            message: `Add problem statement for ${payload.slug}`,
            knownSha: null
          });
          console.log('[LeetMeC0de] 📄 README written');
        }
      } catch (err) {
        console.warn('[LeetMeC0de] README check/write failed (non-fatal):', err.message);
      }
    }

    await pushHistoryEntry({
      slug: payload.slug,
      title: payload.title || payload.slug,
      difficulty,
      status: 'success',
      message: skippedCode ? 'No changes — skipped' : `Pushed to ${config.owner}/${config.repo}`
    });
  } catch (err) {
    console.error('[LeetMeC0de] ❌ GitHub push failed:', err);
    await pushHistoryEntry({
      slug: payload.slug,
      title: payload.title || payload.slug,
      difficulty,
      status: 'failed',
      message: err.message
    });
    throw err;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[LeetMeC0de] Got message:', message);

  if (sender.id !== chrome.runtime.id) {
    console.warn('[LeetMeC0de] Ignoring message from unexpected sender:', sender.id);
    return false;
  }

  if (message.type === 'SUBMISSION_ACCEPTED') {
    handleAcceptedSubmission(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});