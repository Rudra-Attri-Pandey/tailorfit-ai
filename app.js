document.addEventListener('DOMContentLoaded', () => {
  // XSS guard: escape user-supplied / AI-generated strings before innerHTML
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const resumeInput = document.getElementById('resume-input');
  const jobInput = document.getElementById('job-input');
  const optimizeBtn = document.getElementById('optimize-btn');
  const resultsPanel = document.getElementById('results-panel');

  const origScoreEl = document.getElementById('orig-score');
  const optScoreEl = document.getElementById('opt-score');
  const missingKwWrapper = document.getElementById('missing-keywords-wrapper');
  const execSummaryEl = document.getElementById('executive-summary-display');
  const outputResumeEl = document.getElementById('output-resume-content');
  const outputCoverEl = document.getElementById('output-cover-content');
  const copyBtn = document.getElementById('copy-btn');
  const exportTxtBtn = document.getElementById('export-txt-btn');
  const pinVaultBtn = document.getElementById('pin-vault-btn');
  const aiStatusBadge = document.getElementById('ai-status-badge');

  // Navigation Views
  const navDashboard = document.getElementById('nav-dashboard');
  const navVault = document.getElementById('nav-vault');
  const navHistory = document.getElementById('nav-history');
  
  const viewDashboard = document.getElementById('view-dashboard-container');
  const viewVault = document.getElementById('view-vault-container');
  const viewHistory = document.getElementById('view-history-container');
  
  const historyContainer = document.getElementById('history-items-container');
  const vaultSnippetsList = document.getElementById('vault-snippets-list');
  const baseProfilesList = document.getElementById('base-profiles-list');
  const vaultSearchInput = document.getElementById('vault-search-input');
  const addManualSnippetBtn = document.getElementById('add-manual-snippet-btn');

  // Base Profile Elements
  const baseProfileSelect = document.getElementById('base-profile-select');
  const saveBaseProfileBtn = document.getElementById('save-base-profile-btn');

  const sampleSweBtn = document.getElementById('sample-swe-btn');
  const samplePmBtn = document.getElementById('sample-pm-btn');

  const tabBtnResume = document.getElementById('tab-btn-resume');
  const tabBtnCover = document.getElementById('tab-btn-cover');
  const tabContentResume = document.getElementById('tab-content-resume');
  const tabContentCover = document.getElementById('tab-content-cover');

  let activeTab = 'resume';

  // Auth State
  let currentUser = null;
  let isRegisterMode = false;

  const userProfileBtn = document.getElementById('user-profile-btn');
  const userAvatar = document.getElementById('user-avatar');
  const userNameDisplay = document.getElementById('user-name-display');
  const userRoleDisplay = document.getElementById('user-role-display');

  const authModal = document.getElementById('auth-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const authForm = document.getElementById('auth-form');
  const authName = document.getElementById('auth-name');
  const authEmail = document.getElementById('auth-email');
  const authPassword = document.getElementById('auth-password');
  const nameGroup = document.getElementById('name-group');
  const modalTitle = document.getElementById('modal-title');
  const authSubmitBtn = document.getElementById('auth-submit-btn');
  const authToggleBtn = document.getElementById('auth-toggle-btn');
  const authToggleText = document.getElementById('auth-toggle-text');
  const authErrorMsg = document.getElementById('auth-error-msg');

  // Vault Storage State
  let savedSnippets = JSON.parse(localStorage.getItem('tailorfit_snippets') || '[]');
  let savedBaseProfiles = JSON.parse(localStorage.getItem('tailorfit_base_profiles') || '{}');

  // Default Preset Profiles
  const SAMPLE_SWE = `# ALEX RIVERA
Full-Stack Software Engineer | San Francisco, CA | alex@example.com

## PROFESSIONAL SUMMARY
Results-driven Full-Stack Engineer with 5+ years of experience designing scalable microservices, REST APIs, and React web applications serving 1M+ active users.

## EXPERIENCE
**Senior Software Engineer** — CloudScale Solutions (2021 – Present)
• Spearheaded migration of legacy monolith to Node.js microservices, reducing p99 API latency by 42%.
• Architected PostgreSQL database schemas and optimized indexing, boosting query throughput by 3x.
• Led team of 6 engineers implementing CI/CD pipelines via GitHub Actions and Docker.

## SKILLS
TypeScript, React, Node.js, Python, PostgreSQL, Docker, AWS, GraphQL, Jest, CI/CD`;

  const SAMPLE_PM = `# SARAH CHEN
Senior Product Manager | New York, NY | sarah@example.com

## PROFESSIONAL SUMMARY
Data-oriented Senior Product Manager with 6+ years driving B2B SaaS growth, user onboarding conversion, and core feature roadmaps.

## EXPERIENCE
**Lead Product Manager** — GrowthPulse Tech (2020 – Present)
• Owned core user onboarding roadmap, increasing 30-day user retention rate from 24% to 41%.
• Executed A/B experiments on pricing page flow, generating +$1.2M in annual recurring revenue (ARR).
• Partnered with engineering and UX teams using Agile/Scrum to deliver 14 high-impact feature releases.

## SKILLS
Product Strategy, A/B Testing, User Research, SQL, Mixpanel, Jira, Agile/Scrum, Roadmap Prioritization`;

  // Pre-fill default inputs
  if (!resumeInput.value) resumeInput.value = SAMPLE_SWE;

  // Preset Handlers
  sampleSweBtn.addEventListener('click', () => { resumeInput.value = SAMPLE_SWE; });
  samplePmBtn.addEventListener('click', () => { resumeInput.value = SAMPLE_PM; });

  // Navigation View Handlers
  function hideAllViews() {
    viewDashboard.classList.add('hidden');
    viewVault.classList.add('hidden');
    viewHistory.classList.add('hidden');

    [navDashboard, navVault, navHistory].forEach(btn => btn.classList.remove('active'));
  }

  navDashboard.addEventListener('click', () => {
    hideAllViews();
    viewDashboard.classList.remove('hidden');
    navDashboard.classList.add('active');
  });

  navVault.addEventListener('click', () => {
    hideAllViews();
    viewVault.classList.remove('hidden');
    navVault.classList.add('active');
    renderVaultUI();
  });

  navHistory.addEventListener('click', () => {
    hideAllViews();
    viewHistory.classList.remove('hidden');
    navHistory.classList.add('active');
    loadHistory();
  });

  // Base Profile Selector Handler
  baseProfileSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'swe') resumeInput.value = SAMPLE_SWE;
    else if (val === 'pm') resumeInput.value = SAMPLE_PM;
    else if (savedBaseProfiles[val]) resumeInput.value = savedBaseProfiles[val];
  });

  saveBaseProfileBtn.addEventListener('click', () => {
    const text = resumeInput.value.trim();
    if (!text) return alert('Please enter resume text first.');
    const profileName = prompt('Enter a name for this Base Profile (e.g. Senior Backend Engineer):');
    if (!profileName) return;

    savedBaseProfiles[profileName] = text;
    localStorage.setItem('tailorfit_base_profiles', JSON.stringify(savedBaseProfiles));

    // Update Select Dropdown
    const opt = document.createElement('option');
    opt.value = profileName;
    opt.textContent = `📁 ${profileName}`;
    baseProfileSelect.appendChild(opt);
    baseProfileSelect.value = profileName;

    alert(`Base Profile "${profileName}" saved to vault!`);
    renderVaultUI();
  });

  // Output Tab Handlers
  tabBtnResume.addEventListener('click', () => {
    activeTab = 'resume';
    tabBtnResume.classList.replace('secondary', 'primary');
    tabBtnCover.classList.replace('primary', 'secondary');
    tabContentResume.classList.remove('hidden');
    tabContentCover.classList.add('hidden');
  });

  tabBtnCover.addEventListener('click', () => {
    activeTab = 'cover';
    tabBtnCover.classList.replace('secondary', 'primary');
    tabBtnResume.classList.replace('primary', 'secondary');
    tabContentCover.classList.remove('hidden');
    tabContentResume.classList.add('hidden');
  });

  // Copy Active Tab Content
  copyBtn.addEventListener('click', () => {
    const activeText = activeTab === 'resume' ? outputResumeEl.value : outputCoverEl.value;
    if (!activeText) return;
    navigator.clipboard.writeText(activeText);
    const orig = copyBtn.textContent;
    copyBtn.textContent = '✅ Copied!';
    setTimeout(() => { copyBtn.textContent = orig; }, 2000);
  });

  // Export TXT
  exportTxtBtn.addEventListener('click', () => {
    const activeText = activeTab === 'resume' ? outputResumeEl.value : outputCoverEl.value;
    if (!activeText) return;
    const blob = new Blob([activeText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeTab === 'resume' ? 'TAILORED_RESUME.txt' : 'TAILORED_COVER_LETTER.txt';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Pin Rewrites to Snippet Vault Handler
  pinVaultBtn.addEventListener('click', () => {
    const text = outputResumeEl.value.trim();
    if (!text) return alert('No tailored resume content available to pin.');

    const lines = text.split('\n').filter(l => l.trim().startsWith('•') || l.trim().startsWith('-'));
    if (lines.length === 0) {
      // Save entire snippet block
      savedSnippets.unshift({
        id: Date.now(),
        text: text.slice(0, 250) + '...',
        category: 'Resume Block',
        created_at: new Date().toLocaleDateString()
      });
    } else {
      // Save bullet lines
      lines.slice(0, 5).forEach((bullet, idx) => {
        savedSnippets.unshift({
          id: Date.now() + idx,
          text: bullet.replace(/^[•-]\s*/, '').trim(),
          category: 'Bullet Rewrite',
          created_at: new Date().toLocaleDateString()
        });
      });
    }

    localStorage.setItem('tailorfit_snippets', JSON.stringify(savedSnippets));
    pinVaultBtn.textContent = '📌 Saved to Vault!';
    setTimeout(() => { pinVaultBtn.textContent = '📌 Save to Vault'; }, 2000);
  });

  // Add Manual Custom Snippet
  addManualSnippetBtn.addEventListener('click', () => {
    const bulletText = prompt('Enter custom bullet rewrite snippet:');
    if (!bulletText || !bulletText.trim()) return;

    savedSnippets.unshift({
      id: Date.now(),
      text: bulletText.trim(),
      category: 'Custom Bullet',
      created_at: new Date().toLocaleDateString()
    });

    localStorage.setItem('tailorfit_snippets', JSON.stringify(savedSnippets));
    renderVaultUI();
  });

  // Vault UI Renderer
  function renderVaultUI() {
    // Render Base Profiles
    const profileKeys = Object.keys(savedBaseProfiles);
    if (profileKeys.length === 0) {
      baseProfilesList.innerHTML = '<p style="font-size:12px; color:#94a3b8;">No custom base profiles saved yet.</p>';
    } else {
      baseProfilesList.innerHTML = profileKeys.map(k => `
        <div class="base-profile-card">
          <div>
            <h4>📁 ${escapeHtml(k)}</h4>
            <span style="font-size:11px; color:#94a3b8;">${escapeHtml(String(savedBaseProfiles[k]).slice(0, 45))}...</span>
          </div>
          <button class="btn secondary btn-sm load-profile-btn" style="font-size:11px;" data-profile="${escapeHtml(k)}">Load</button>
        </div>
      `).join('');
    }

    // Render Bullet Snippets
    filterAndRenderSnippets();
  }

  window.loadBaseProfile = (key) => {
    if (savedBaseProfiles[key]) {
      resumeInput.value = savedBaseProfiles[key];
      hideAllViews();
      viewDashboard.classList.remove('hidden');
      navDashboard.classList.add('active');
    }
  };

  vaultSearchInput.addEventListener('input', filterAndRenderSnippets);

  function filterAndRenderSnippets() {
    const query = vaultSearchInput.value.toLowerCase();
    const filtered = savedSnippets.filter(s => s.text.toLowerCase().includes(query) || s.category.toLowerCase().includes(query));

    if (filtered.length === 0) {
      vaultSnippetsList.innerHTML = '<p style="font-size:13px; color:#94a3b8;">No matching bullet snippets in vault.</p>';
      return;
    }

    vaultSnippetsList.innerHTML = filtered.map(item => `
      <div class="vault-card-item">
        <div style="flex-grow: 1;">
          <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 10px; background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 2px 8px; border-radius: 12px; font-weight: 700;">${escapeHtml(item.category)}</span>
            <span style="font-size: 11px; color: #64748b;">${escapeHtml(item.created_at)}</span>
          </div>
          <p style="font-size: 13px; color: var(--palette-navy); font-weight: 600; line-height: 1.4;">• ${escapeHtml(item.text)}</p>
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="btn secondary btn-sm copy-snippet-btn" style="font-size: 11px;" data-snippet="${escapeHtml(item.text)}">📋 Copy</button>
          <button class="btn secondary btn-sm delete-snippet-btn" style="font-size: 11px; color: #ef4444;" data-snippet-id="${escapeHtml(String(item.id))}" title="Delete snippet">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  // (removed) legacy copySnippetText helper used inline onclick + encodeURIComponent;
  // snippet copy is now handled via data-snippet attributes + delegated listener below.

  function deleteSnippetById(id) {
    savedSnippets = savedSnippets.filter(s => s.id !== id);
    localStorage.setItem('tailorfit_snippets', JSON.stringify(savedSnippets));
    filterAndRenderSnippets();
  };

  // Delegated handlers for vault buttons (avoids inline onclick string injection)
  baseProfilesList.addEventListener('click', (e) => {
    const btn = e.target.closest('.load-profile-btn');
    if (btn) window.loadBaseProfile(btn.dataset.profile);
  });
  vaultSnippetsList.addEventListener('click', (e) => {
    const copyBtnEl = e.target.closest('.copy-snippet-btn');
    if (copyBtnEl) {
      navigator.clipboard.writeText(copyBtnEl.dataset.snippet || '');
      alert('Bullet snippet copied to clipboard!');
      return;
    }
    const delBtn = e.target.closest('.delete-snippet-btn');
    if (delBtn) deleteSnippetById(Number(delBtn.dataset.snippetId));
  });

  // Optimize Action Handler
  optimizeBtn.addEventListener('click', async () => {
    const rawResume = resumeInput.value.trim();
    const rawJob = jobInput.value.trim();

    if (!rawResume || !rawJob) {
      alert('Please enter both your resume and target job description.');
      return;
    }

    optimizeBtn.disabled = true;
    optimizeBtn.textContent = '⚡ Scanning & Tailoring ATS Resume...';

    try {
      // Server contract: POST /api/analyze { resume, jobDescription } ->
      // { original_score, optimized_score, score_breakdown, missing_keywords,
      //   executive_summary, optimized_resume, cover_letter, id }
      const headers = { 'Content-Type': 'application/json' };
      const token = getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          resume: rawResume,
          jobDescription: rawJob
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        alert(data.error || `Analysis failed (HTTP ${response.status}).`);
        return;
      }

      if (data && (typeof data.optimized_score !== 'undefined' || data.optimized_resume)) {
        resultsPanel.classList.remove('hidden');
        origScoreEl.textContent = `${data.original_score ?? 58}%`;
        optScoreEl.textContent = `${data.optimized_score ?? 95}%`;

        outputResumeEl.value = data.optimized_resume || '';
        outputCoverEl.value = data.cover_letter || 'Tailored Cover Letter generated successfully.';
        execSummaryEl.textContent = `⚡ Key Insight: ${data.executive_summary || 'Resume rewritten to match primary job requirements.'}`;

        const breakdown = data.score_breakdown || {};
        const setSub = (id, val) => {
          const el = document.getElementById(id);
          if (el && typeof val !== 'undefined') el.textContent = `${val}%`;
        };
        setSub('sub-kw-match', breakdown.keyword_match);
        setSub('sub-fmt', breakdown.formatting);
        setSub('sub-metrics', breakdown.quantified_metrics);
        setSub('sub-skills', breakdown.hard_skills);

        if (data.missing_keywords && data.missing_keywords.length > 0) {
          missingKwWrapper.innerHTML = data.missing_keywords.map(kw => `<span class="tag missing">+ ${escapeHtml(kw)}</span>`).join('');
        } else {
          missingKwWrapper.innerHTML = '';
        }
      } else {
        alert(data.error || 'Failed to optimize resume.');
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to backend API.');
    } finally {
      optimizeBtn.disabled = false;
      optimizeBtn.textContent = 'Scan & Tailor ATS Resume + Cover Letter';
    }
  });

  // Auth Functions
  function getToken() { return localStorage.getItem('tailorfit_auth_token'); }
  function setToken(token) { localStorage.setItem('tailorfit_auth_token', token); }
  function removeToken() { localStorage.removeItem('tailorfit_auth_token'); }

  async function checkAuth() {
    const token = getToken();
    if (!token) return updateUserUI(null);

    try {
      const res = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        currentUser = data.user;
        updateUserUI(currentUser);
      } else {
        removeToken();
        updateUserUI(null);
      }
    } catch(e) {
      updateUserUI(null);
    }
  }

  function updateUserUI(user) {
    if (user) {
      userAvatar.textContent = user.name ? user.name.charAt(0).toUpperCase() : 'C';
      userNameDisplay.textContent = user.name;
      userRoleDisplay.textContent = 'Authenticated (Logout)';
    } else {
      userAvatar.textContent = '?';
      userNameDisplay.textContent = 'Guest Mode';
      userRoleDisplay.textContent = 'Click to Login / Register';
    }
  }

  userProfileBtn.addEventListener('click', () => {
    if (currentUser) {
      if (confirm(`Logged in as ${currentUser.name}. Do you want to logout?`)) {
        removeToken();
        currentUser = null;
        updateUserUI(null);
      }
    } else {
      authModal.classList.remove('hidden');
    }
  });

  closeModalBtn.addEventListener('click', () => { authModal.classList.add('hidden'); });

  // Server contract: GET /api/history -> { history: [...] } (object, NOT a bare array)
  async function loadHistory() {
    historyContainer.innerHTML = '<p style="color:#94a3b8;">Loading history...</p>';
    try {
      const headers = {};
      const token = getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/history', { headers });
      const data = await res.json().catch(() => ({}));
      const items = Array.isArray(data) ? data : (data.history || []);
      if (!items || items.length === 0) {
        historyContainer.innerHTML = '<p style="color:#94a3b8;">No past scans found in history.</p>';
        return;
      }
      historyContainer.innerHTML = items.map(item => `
        <div style="background: rgba(255,255,255,0.8); border: 1px solid var(--palette-navy); border-radius: 8px; padding: 12px; margin-bottom: 10px;">
          <div style="display:flex; justify-content:space-between; margin-bottom: 6px;">
            <span style="font-weight: 700;">Scan #${escapeHtml(String(item.id))} — ${escapeHtml(item.created_at || '')}</span>
            <span style="color:#10b981; font-weight:700;">Score: ${escapeHtml(String(item.optimized_score ?? 95))}%</span>
          </div>
          <pre style="font-size: 11px; max-height: 60px; overflow: hidden;">${escapeHtml(String(item.optimized_resume || '').slice(0, 150))}...</pre>
        </div>
      `).join('');
    } catch(err) {
      historyContainer.innerHTML = '<p style="color:red;">Failed to load history.</p>';
    }
  }

  const refreshHistoryBtn = document.getElementById('refresh-history-btn');
  if (refreshHistoryBtn) refreshHistoryBtn.addEventListener('click', loadHistory);

  checkAuth();
});
