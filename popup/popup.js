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
  if (history.length === 0) {
    historyEl.innerHTML = '<div class="history-empty">No syncs yet</div>';
  } else {
    historyEl.innerHTML = history.map((entry) => {
      const time = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const icon = entry.status === 'success' ? '✅' : '❌';
      const diffTag = entry.difficulty ? `<span class="diff-tag diff-${entry.difficulty}">${entry.difficulty}</span>` : '';
      return `
        <div class="history-item ${entry.status}">
          <div class="history-top">
            <span class="history-icon">${icon}</span>
            <span class="history-title">${entry.title || entry.slug}</span>
            ${diffTag}
          </div>
          <div class="history-meta">${entry.message || ''} · ${time}</div>
        </div>
      `;
    }).join('');
  }

  toggle.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ enabled: e.target.checked });
  });

  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});