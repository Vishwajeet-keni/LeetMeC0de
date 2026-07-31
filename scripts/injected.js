// LeetMeC0de – capture submit, poll for verdict, fetch problem metadata
(() => {
  function getSlugFromUrl(url) {
    const m = url.match(/\/problems\/([^\/]+)\//);
    return m ? m[1] : null;
  }

  function stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
  }

  function sendToBackground(payload) {
    console.log('[LeetMeC0de] 📤 Sending accepted submission to content script:', payload);
    window.postMessage({ source: 'leetmec0de', type: 'SUBMISSION_ACCEPTED', payload }, '*');
  }

  async function getQuestionMetaForSlug(slug) {
    try {
      const res = await fetch('https://leetcode.com/graphql/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query questionMeta($titleSlug: String!) {
            question(titleSlug: $titleSlug) {
              title
              difficulty
              content
            }
          }`,
          variables: { titleSlug: slug }
        })
      });
      const data = await res.json();
      const q = data && data.data && data.data.question;
      if (!q) return { difficulty: 'Unknown', title: slug, content: '' };
      console.log('[LeetMeC0de] 🎯 Meta for', slug, '=', q.difficulty);
      return {
        difficulty: q.difficulty || 'Unknown',
        title: q.title || slug,
        content: stripHtml(q.content)
      };
    } catch (e) {
      console.warn('[LeetMeC0de] meta fetch failed', e);
      return { difficulty: 'Unknown', title: slug, content: '' };
    }
  }

  // Poll LeetCode's own check endpoint until we get a verdict.
  async function pollForVerdict(submissionId, submissionData) {
    const url = `https://leetcode.com/submissions/detail/${submissionId}/check/`;
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise((r) => setTimeout(r, 1200));
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) continue;
        const data = await res.json();
        console.log('[LeetMeC0de] 🔎 Poll result:', data);

        if (data.state === 'SUCCESS') {
          if (data.status_msg === 'Accepted') {
            sendToBackground({
              ...submissionData,
              submissionId,
              runtime: data.status_runtime,
              memory: data.status_memory
            });
          } else {
            console.log('[LeetMeC0de] ❌ Not accepted:', data.status_msg);
          }
          return; // stop polling either way — we have a final verdict
        }
        // state === 'PENDING' / 'STARTED' -> keep polling
      } catch (e) {
        console.warn('[LeetMeC0de] poll error', e);
      }
    }
    console.warn('[LeetMeC0de] gave up polling for verdict after 15 attempts');
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const [resource, config] = args;
    const url = typeof resource === 'string' ? resource : resource.url;

    if (url && /\/problems\/[^\/]+\/submit\/?$/.test(url) && config && config.body) {
      try {
        const body = JSON.parse(config.body);
        const slug = getSlugFromUrl(url);
        window.__leetmec0de_lastSubmission = {
          slug,
          lang: body.lang,
          code: body.typed_code,
          difficulty: 'Unknown',
          title: slug,
          problemContent: ''
        };
        console.log('[LeetMeC0de] 📝 Submit captured:', window.__leetmec0de_lastSubmission);

        getQuestionMetaForSlug(slug).then((meta) => {
          if (window.__leetmec0de_lastSubmission && window.__leetmec0de_lastSubmission.slug === slug) {
            window.__leetmec0de_lastSubmission.difficulty = meta.difficulty;
            window.__leetmec0de_lastSubmission.title = meta.title;
            window.__leetmec0de_lastSubmission.problemContent = meta.content;
          }
        });
      } catch (e) {}
    }

    const response = await originalFetch.apply(this, args);

    if (url && /\/problems\/[^\/]+\/submit\/?$/.test(url)) {
      response.clone().json().then((data) => {
        if (data && data.submission_id) {
          const last = window.__leetmec0de_lastSubmission;
          if (last) {
            console.log('[LeetMeC0de] 📋 Submission ID:', data.submission_id, '— starting poll');
            pollForVerdict(data.submission_id, last);
          }
        }
      }).catch(() => {});
    }

    return response;
  };

  console.log('[LeetMeC0de] 🚀 Injected (poll-based verdict detection + metadata capture)');
})();