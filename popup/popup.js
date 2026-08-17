document.addEventListener('DOMContentLoaded', async () => {
  const config = await chrome.storage.local.get(['token', 'owner', 'repo', 'enabled', 'syncHistory']);
  const statusEl = document.getElementById('status');
  const toggle = document.getElementById('enabledToggle');
  const historyEl = document.getElementById('history');

  statusEl.textContent = (!config.token || !config.owner || !config.repo)
    ? 'Not configured – open Settings.'
    : `Connected to ${config.owner}/${config.repo}`;

  toggle.checked = config.enabled !== false;

  const history = config.syncHistory || [];
  historyEl.innerHTML = '';
  if (history.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'No syncs yet';
    historyEl.appendChild(empty);
  } else {
    // Built entirely with DOM APIs (not innerHTML) so untrusted fields
    // (title/message/difficulty, which originate from page-provided
    // submission data) can never be interpreted as markup/script.
    const ALLOWED_DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard', 'Unknown']);
    history.forEach((entry) => {
      const time = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const icon = entry.status === 'success' ? '✅' : '❌';

      const item = document.createElement('div');
      item.className = `history-item ${entry.status === 'success' ? 'success' : 'failed'}`;

      const top = document.createElement('div');
      top.className = 'history-top';

      const iconEl = document.createElement('span');
      iconEl.className = 'history-icon';
      iconEl.textContent = icon;
      top.appendChild(iconEl);

      const titleEl = document.createElement('span');
      titleEl.className = 'history-title';
      titleEl.textContent = entry.title || entry.slug || 'Unknown problem';
      top.appendChild(titleEl);

      if (entry.difficulty && ALLOWED_DIFFICULTIES.has(entry.difficulty)) {
        const diffTag = document.createElement('span');
        diffTag.className = `diff-tag diff-${entry.difficulty}`;
        diffTag.textContent = entry.difficulty;
        top.appendChild(diffTag);
      }

      const meta = document.createElement('div');
      meta.className = 'history-meta';
      meta.textContent = `${entry.message || ''} · ${time}`;

      item.appendChild(top);
      item.appendChild(meta);
      historyEl.appendChild(item);
    });
  }

  toggle.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ enabled: e.target.checked });
  });

  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});