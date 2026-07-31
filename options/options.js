document.addEventListener('DOMContentLoaded', async () => {
  const config = await chrome.storage.local.get(['token', 'owner', 'repo', 'branch', 'folderStructure', 'includeReadme']);
  document.getElementById('token').value = config.token || '';
  document.getElementById('owner').value = config.owner || '';
  document.getElementById('repo').value = config.repo || '';
  document.getElementById('branch').value = config.branch || 'main';
  document.getElementById('folderStructure').value = config.folderStructure || 'by-difficulty';
  document.getElementById('includeReadme').checked = config.includeReadme !== false;

  document.getElementById('testBtn').addEventListener('click', async () => {
    const token = document.getElementById('token').value.trim();
    const owner = document.getElementById('owner').value.trim();
    const repo = document.getElementById('repo').value.trim();
    const resultEl = document.getElementById('testResult');
    resultEl.textContent = 'Testing…';
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
      });
      if (res.ok) {
        resultEl.textContent = '✔ Connected';
        resultEl.style.color = '#a6e3a1';
      } else {
        throw new Error(`Status ${res.status}`);
      }
    } catch (err) {
      resultEl.textContent = `✘ ${err.message}`;
      resultEl.style.color = '#f38ba8';
    }
  });

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const update = {
      token: document.getElementById('token').value.trim(),
      owner: document.getElementById('owner').value.trim(),
      repo: document.getElementById('repo').value.trim(),
      branch: document.getElementById('branch').value.trim() || 'main',
      folderStructure: document.getElementById('folderStructure').value,
      includeReadme: document.getElementById('includeReadme').checked
    };
    await chrome.storage.local.set(update);
    const status = document.getElementById('saveStatus');
    status.textContent = 'Saved ✔';
    setTimeout(() => status.textContent = '', 2000);
  });
});