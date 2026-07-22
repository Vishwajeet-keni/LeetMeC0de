(() => {
  console.log('[LeetMeC0de] Content script loaded');

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function () { this.remove(); };
  (document.head || document.documentElement).appendChild(script);

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'leetmec0de' || data.type !== 'SUBMISSION_ACCEPTED') return;

    console.log('[LeetMeC0de] 📤 Forwarding to background:', data.payload);
    chrome.runtime.sendMessage(
      { type: 'SUBMISSION_ACCEPTED', payload: data.payload },
      (response) => {
        console.log('[LeetMeC0de] Background responded:', response);
      }
    );
  });
})();