// ── Feed (sidebar + welcome) ──

let feedCache = { entries: null, at: 0 };
const FEED_CACHE_TTL = 300000; // 5 minutes
let welcomeFeedCache = { entries: null, allEntries: null, at: 0 };

async function loadFeed(bypassCache) {
  if (!state.firebaseReady || !firebaseDb) {
    feedList.innerHTML = `<div class="feed-empty">Community feed connecting...</div>`;
    setTimeout(() => { if (state.firebaseReady) loadFeed(); }, 1000);
    return;
  }
  // Serve from cache if fresh
  if (!bypassCache && feedCache.entries && (Date.now() - feedCache.at < FEED_CACHE_TTL)) {
    renderFeed(feedCache.entries);
    return;
  }
  feedList.innerHTML = '<div class="feed-empty">Loading...</div>';
  try {
    const snap = await firebaseDb.ref('feed')
      .orderByChild('timestamp')
      .limitToLast(50)
      .once('value');
    const entries = [];
    snap.forEach(child => {
      entries.push({ key: child.key, ...child.val() });
    });
    entries.reverse(); // newest first
    feedCache = { entries, at: Date.now() };
    renderFeed(entries);
  } catch (err) {
    feedList.innerHTML = `<div class="feed-empty">Error loading feed: ${escapeHtml(err.message)}</div>`;
  }
}

function renderFeed(entries) {
  if (entries.length === 0) {
    feedList.innerHTML = '<div class="feed-empty">No shared pages yet. Be the first to share!</div>';
    return;
  }

  let html = '';
  for (const entry of entries) {
    const title = escapeHtml(entry.title || entry.url);
    const url = escapeHtml(entry.url);
    const preview = escapeHtml(entry.preview || '');
    const author = escapeHtml(entry.author || 'Anonymous');
    const model = escapeHtml(entry.model || '?');
    const ago = timeAgo(entry.timestamp);
    html += `
      <div class="feed-card" data-feed-key="${escapeHtml(entry.key)}" data-exploration-id="${escapeHtml(entry.explorationId || '')}">
        <div class="feed-card-title">${title}</div>
        <div class="feed-card-url">s/${url}</div>
        <div class="feed-card-preview">${preview}</div>
        <div class="feed-card-meta">
          <span><span class="feed-card-author">${author}</span> &middot; ${ago}</span>
          <span class="feed-card-model">${model}</span>
        </div>
        <div class="scrubber-bar" style="display:none"></div>
      </div>`;
  }

  feedList.innerHTML = html;

  // Bind card clicks — load the shared page
  feedList.querySelectorAll('.feed-card').forEach(card => {
    card.addEventListener('click', async () => {
      hideScrubberPopup();
      const key = card.dataset.feedKey;
      try {
        const snap = await firebaseDb.ref('feed/' + key).once('value');
        const entry = snap.val();
        if (entry && entry.html) {
          addressInput.value = entry.url;
          restorePage(entry.html);
          state.history = state.history.slice(0, state.historyIndex + 1);
          state.history.push({ url: entry.url, html: entry.html });
          state.historyIndex = state.history.length - 1;
          updateNavButtons();
          state.currentFeedKey = key;
          state.currentExplorationId = entry.explorationId || null;
          if (entry.explorationId && state.firebaseReady && firebaseDb) {
            firebaseDb.ref('explorations/' + entry.explorationId + '/tonalModifier').once('value')
              .then(snap => { state.tonalModifier = snap.val() || null; })
              .catch(() => {});
          }
          updateBrowserUrl(entry.url);
          $('#contentArea').scrollTop = 0;
        } else {
          navigateTo(entry.url);
        }
      } catch {
        // Fallback: just navigate
        const url = card.querySelector('.feed-card-url').textContent.replace(/^s\//, '');
        navigateTo(url);
      }
    });
  });
  bindScrubbers(feedList, entries);
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function toggleFeed(forceOpen) {
  const open = forceOpen !== undefined ? forceOpen : !feedPanel.classList.contains('open');
  feedPanel.classList.toggle('open', open);
  feedBackdrop.classList.toggle('open', open);
  if (open) loadFeed();
}

feedBtn.addEventListener('click', () => {
  const willClose = feedPanel.classList.contains('open');
  if (willClose) state.feedClosedByUser = true;
  else state.feedClosedByUser = false;
  toggleFeed();
});
closeFeedBtn.addEventListener('click', () => { state.feedClosedByUser = true; toggleFeed(false); });
feedBackdrop.addEventListener('click', () => { state.feedClosedByUser = true; toggleFeed(false); });
refreshFeedBtn.addEventListener('click', () => loadFeed(true));

// ── Welcome page feed (inline) ──
async function loadWelcomeFeed() {
  if (!welcomeFeedList) return;
  if (!state.firebaseReady || !firebaseDb) {
    welcomeFeedList.innerHTML = '<div class="feed-empty">Tuning in...</div>';
    return;
  }
  // Serve from cache if fresh
  if (welcomeFeedCache.entries && (Date.now() - welcomeFeedCache.at < FEED_CACHE_TTL)) {
    renderWelcomeFeed(welcomeFeedCache.entries, welcomeFeedCache.allEntries);
    return;
  }
  welcomeFeedList.innerHTML = '<div class="feed-empty">Scanning the airwaves...</div>';
  try {
    const snap = await firebaseDb.ref('feed')
      .orderByChild('timestamp')
      .limitToLast(30)
      .once('value');
    const entries = [];
    snap.forEach(child => {
      entries.push({ key: child.key, ...child.val() });
    });
    entries.reverse();
    // Deduplicate: show only the latest entry per version tree
    const seenExplorations = new Set();
    const seenUrls = []; // track URLs we've already accepted
    const deduped = entries.filter(e => {
      // Deduplicate by explorationId
      if (e.explorationId) {
        if (seenExplorations.has(e.explorationId)) return false;
        seenExplorations.add(e.explorationId);
      }
      // Deduplicate by URL lineage — skip if this URL is an ancestor/descendant of one already shown
      const url = (e.url || '').toLowerCase();
      if (url) {
        for (const prev of seenUrls) {
          if (url === prev || url.startsWith(prev + '/') || prev.startsWith(url + '/')) return false;
        }
        seenUrls.push(url);
      }
      return true;
    });
    welcomeFeedCache = { entries: deduped, allEntries: entries, at: Date.now() };
    renderWelcomeFeed(deduped, entries);
  } catch (err) {
    welcomeFeedList.innerHTML = `<div class="feed-empty">Could not load feed: ${escapeHtml(err.message)}</div>`;
  }
}

function renderWelcomeFeed(entries, allEntries) {
  if (!welcomeFeedList) return;
  if (entries.length === 0) {
    welcomeFeedList.innerHTML = '<div class="feed-empty">No pages yet. Generate something and it\'ll appear here!</div>';
    return;
  }
  let html = '';
  for (const entry of entries) {
    const title = escapeHtml(entry.title || entry.url);
    const url = escapeHtml(entry.url);
    const preview = escapeHtml(entry.preview || '');
    const author = escapeHtml(entry.author || 'Anonymous');
    const model = escapeHtml(entry.model || '?');
    const ago = timeAgo(entry.timestamp);
    html += `
      <div class="feed-card" data-feed-key="${escapeHtml(entry.key)}" data-exploration-id="${escapeHtml(entry.explorationId || '')}">
        <div class="feed-card-title">${title}</div>
        <div class="feed-card-url">s/${url}</div>
        <div class="feed-card-preview">${preview}</div>
        <div class="feed-card-meta">
          <span><span class="feed-card-author">${author}</span> &middot; ${ago}</span>
          <span class="feed-card-model">${model}</span>
        </div>
        <div class="scrubber-bar" style="display:none"></div>
      </div>`;
  }
  welcomeFeedList.innerHTML = html;

  // Bind card clicks
  welcomeFeedList.querySelectorAll('.feed-card').forEach(card => {
    card.addEventListener('click', async () => {
      hideScrubberPopup();
      const key = card.dataset.feedKey;
      try {
        const snap = await firebaseDb.ref('feed/' + key).once('value');
        const entry = snap.val();
        if (entry && entry.html) {
          addressInput.value = entry.url;
          restorePage(entry.html);
          state.history = state.history.slice(0, state.historyIndex + 1);
          state.history.push({ url: entry.url, html: entry.html });
          state.historyIndex = state.history.length - 1;
          updateNavButtons();
          state.currentFeedKey = key;
          state.currentExplorationId = entry.explorationId || null;
          if (entry.explorationId && state.firebaseReady && firebaseDb) {
            firebaseDb.ref('explorations/' + entry.explorationId + '/tonalModifier').once('value')
              .then(snap => { state.tonalModifier = snap.val() || null; })
              .catch(() => {});
          }
          updateBrowserUrl(entry.url);
          if (!state.feedClosedByUser) toggleFeed(true);
          $('#contentArea').scrollTop = 0;
        } else {
          navigateTo(entry.url);
        }
      } catch {
        const url = card.querySelector('.feed-card-url').textContent.replace(/^s\//, '');
        navigateTo(url);
      }
    });
  });
  bindScrubbers(welcomeFeedList, allEntries || entries);
}
