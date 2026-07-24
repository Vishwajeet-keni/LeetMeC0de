console.log('[LeetMeC0de] Service worker started');

const API_BASE = 'https://api.github.com';

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

async function upsertFile({ token, owner, repo, path, content, message, branch }) {
  const existing = await getFile({ token, owner, repo, path, branch });
  const body = { message, content: b64EncodeUnicode(content), branch };
  if (existing) body.sha = existing.sha;

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

async function setStatus(title, message) {
  await chrome.storage.local.set({ lastSyncStatus: { title, message, at: Date.now() } });
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
    await setStatus('Not configured', 'Open extension options to add your GitHub token and repo.');
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
    console.log('[LeetMeC0de] Pushing to GitHub:', codePath);
    await upsertFile({ ...config, path: codePath, content: fullContent, message: commitMessage });
    console.log('[LeetMeC0de] ✅ Pushed successfully');

    if (config.includeReadme) {
      const readmePath = `${basePath}/README.md`;
      const readmeContent = [
        `# ${payload.title || payload.slug}`,
        ``,
        `**Difficulty:** ${difficulty}`,
        ``,
        payload.problemContent || '_Problem statement unavailable._',
        ``
      ].join('\n');

      try {
        await upsertFile({
          ...config,
          path: readmePath,
          content: readmeContent,
          message: `Add problem statement for ${payload.slug}`
        });
        console.log('[LeetMeC0de] 📄 README written');
      } catch (err) {
        console.warn('[LeetMeC0de] README write failed (non-fatal):', err.message);
      }
    }

    await setStatus('Synced', `${payload.slug} pushed to ${config.owner}/${config.repo}`);
  } catch (err) {
    console.error('[LeetMeC0de] ❌ GitHub push failed:', err);
    await setStatus('Sync failed', err.message);
    throw err;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[LeetMeC0de] Got message:', message);

  if (message.type === 'SUBMISSION_ACCEPTED') {
    handleAcceptedSubmission(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async response
  }
});