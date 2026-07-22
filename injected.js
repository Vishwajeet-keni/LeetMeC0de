// LeetMeC0de – capture submit, then self-poll for the verdict
(() => {
    function getSlugFromUrl(url) {
        const m = url.match(/\/problems\/([^\/]+)\//);
        return m ? m[1] : null;
    }

    async function getDifficultyForSlug(slug) {
        try {
            const res = await fetch('https://leetcode.com/graphql/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: `query questionDifficulty($titleSlug: String!) {
          question(titleSlug: $titleSlug) { difficulty }
        }`,
                    variables: { titleSlug: slug }
                })
            });
            const data = await res.json();
            const diff = data && data.data && data.data.question && data.data.question.difficulty;
            console.log('[LeetMeC0de] 🎯 Difficulty for', slug, '=', diff);
            return diff || 'Unknown';
        } catch (e) {
            console.warn('[LeetMeC0de] difficulty fetch failed', e);
            return 'Unknown';
        }
    }

    function sendToBackground(payload) {
        console.log('[LeetMeC0de] 📤 Sending accepted submission to content script:', payload);
        window.postMessage({ source: 'leetmec0de', type: 'SUBMISSION_ACCEPTED', payload }, '*');
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
                    difficulty: 'Unknown' // placeholder, filled in below once the fetch resolves
                };
                console.log('[LeetMeC0de] 📝 Submit captured:', window.__leetmec0de_lastSubmission);

                getDifficultyForSlug(slug).then((diff) => {
                    if (window.__leetmec0de_lastSubmission && window.__leetmec0de_lastSubmission.slug === slug) {
                        window.__leetmec0de_lastSubmission.difficulty = diff;
                    }
                });
            } catch (e) { }
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
            }).catch(() => { });
        }

        return response;
    };

    console.log('[LeetMeC0de] 🚀 Injected (poll-based verdict detection + difficulty capture)');
})();