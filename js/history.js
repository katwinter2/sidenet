// ── Persistent History ──
function loadSavedHistory() {
  try {
    return JSON.parse(localStorage.getItem('sidenet_history') || '[]');
  } catch { return []; }
}

function savePersistentHistory(entry) {
  const saved = loadSavedHistory();
  saved.unshift(entry);
  // Keep max 200 entries, trim HTML to avoid hitting storage limits
  const trimmed = saved.slice(0, 200).map(e => ({
    ...e,
    html: (e.html || '').substring(0, 50000),
  }));
  try {
    localStorage.setItem('sidenet_history', JSON.stringify(trimmed));
  } catch {
    // Storage full — drop oldest half
    const halved = trimmed.slice(0, 100);
    localStorage.setItem('sidenet_history', JSON.stringify(halved));
  }
}

function deleteSavedHistoryEntry(timestamp) {
  const saved = loadSavedHistory().filter(e => e.timestamp !== timestamp);
  localStorage.setItem('sidenet_history', JSON.stringify(saved));
  renderHistoryPanel();
}

function clearSavedHistory() {
  localStorage.removeItem('sidenet_history');
  renderHistoryPanel();
}

function extractTitle(html) {
  const m = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (m) {
    const tmp = document.createElement('div');
    tmp.innerHTML = m[1];
    return tmp.textContent.substring(0, 100);
  }
  return null;
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateGroup(ts) {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (today - date) / 86400000;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderHistoryPanel() {
  const saved = loadSavedHistory();
  if (saved.length === 0) {
    historyList.innerHTML = '<div class="history-empty">No pages visited yet.</div>';
    return;
  }

  let html = '';
  let currentGroup = '';

  for (const entry of saved) {
    const group = formatDateGroup(entry.timestamp);
    if (group !== currentGroup) {
      currentGroup = group;
      html += `<div class="history-date-group">${escapeHtml(group)}</div>`;
    }
    const title = escapeHtml(entry.title || entry.url);
    const url = escapeHtml(entry.url);
    const time = formatTime(entry.timestamp);
    html += `
      <div class="history-item" data-ts="${entry.timestamp}" data-url="${escapeHtml(entry.url)}">
        <div class="history-item-content">
          <div class="history-item-title">${title}</div>
          <div class="history-item-url">s/${url}</div>
        </div>
        <span class="history-item-time">${time}</span>
        <button class="history-item-delete" data-delete-ts="${entry.timestamp}" title="Remove">&times;</button>
      </div>`;
  }

  historyList.innerHTML = html;

  // Bind clicks
  historyList.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.history-item-delete')) return;
      const ts = parseInt(item.dataset.ts);
      const entry = loadSavedHistory().find(e => e.timestamp === ts);
      if (entry && entry.html) {
        // Restore cached page
        addressInput.value = entry.url;
        restorePage(entry.html);
        // Push to session nav history
        state.history = state.history.slice(0, state.historyIndex + 1);
        state.history.push({ url: entry.url, html: entry.html });
        state.historyIndex = state.history.length - 1;
        updateNavButtons();
        updateBrowserUrl(entry.url);
        if (!state.feedClosedByUser) toggleFeed(true);
        $('#contentArea').scrollTop = 0;
      } else {
        // Re-generate if no cached HTML
        navigateTo(item.dataset.url);
      }
      toggleHistory(false);
    });
  });

  historyList.querySelectorAll('.history-item-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSavedHistoryEntry(parseInt(btn.dataset.deleteTs));
    });
  });
}

function toggleHistory(forceOpen) {
  const open = forceOpen !== undefined ? forceOpen : !historyPanel.classList.contains('open');
  historyPanel.classList.toggle('open', open);
  historyBackdrop.classList.toggle('open', open);
  if (open) renderHistoryPanel();
}

historyBtn.addEventListener('click', () => toggleHistory());
closeHistoryBtn.addEventListener('click', () => toggleHistory(false));
historyBackdrop.addEventListener('click', () => toggleHistory(false));
clearHistoryBtn.addEventListener('click', () => {
  if (confirm('Clear all browsing history?')) clearSavedHistory();
});
