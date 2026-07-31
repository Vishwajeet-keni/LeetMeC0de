document.addEventListener('DOMContentLoaded', async () => {
  const config = await chrome.storage.local.get(['token', 'owner', 'repo', 'enabled', 'lastSyncStatus']);
  const statusEl = document.getElementById('status');
  const toggle = document.getElementById('enabledToggle');
  const lastSyncEl = document.getElementById('lastSync');

  statusEl.textContent = (!config.token || !config.owner || !config.repo)
    ? 'Not configured – open Settings.'
    : `Connected to ${config.owner}/${config.repo}`;

  toggle.checked = config.enabled !== false;

  if (config.lastSyncStatus) {
    const time = new Date(config.lastSyncStatus.at).toLocaleTimeString();
    lastSyncEl.textContent = `${config.lastSyncStatus.title} — ${config.lastSyncStatus.message} (${time})`;
  }

  toggle.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ enabled: e.target.checked });
  });

  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});