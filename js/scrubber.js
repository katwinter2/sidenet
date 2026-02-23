// ── Exploration Scrubber Controller ──
const scrubberCache = new Map();
let activeScrubberPopup = null;

function buildScrubber(card, treeData) {
  const bar = card.querySelector('.scrubber-bar');
  if (!bar) return;

  const nodeEntries = treeData.nodes
    ? Object.entries(treeData.nodes)
        .map(([id, n]) => ({ id, ...n }))
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    : [];

  if (nodeEntries.length === 0) {
    nodeEntries.push({
      id: 'root', url: treeData.rootUrl || '?', title: '',
      parentNodeId: null, feedKey: null,
      timestamp: treeData.createdAt || 0, diffSize: 0, concepts: [],
    });
  }

  bar.innerHTML = '';
  bar.style.display = '';

  const fill = document.createElement('div');
  fill.className = 'scrubber-fill';
  bar.appendChild(fill);

  const popup = document.createElement('div');
  popup.className = 'scrubber-popup';
  popup.innerHTML = '<div class="scrubber-popup-thumb"></div><div class="scrubber-popup-title"></div><div class="scrubber-popup-url"></div><div class="scrubber-popup-concepts"></div><div class="scrubber-popup-diff"></div>';
  bar.appendChild(popup);

  const dots = [];
  for (let i = 0; i < nodeEntries.length; i++) {
    const node = nodeEntries[i];
    const pct = nodeEntries.length === 1 ? 50 : (i / (nodeEntries.length - 1)) * 100;
    const dot = document.createElement('div');
    dot.className = 'scrubber-dot' + (!node.parentNodeId ? ' root' : '');
    dot.style.left = pct + '%';
    bar.appendChild(dot);
    dots.push({ el: dot, node, pct });
  }

  bar._scrubberData = { dots, popup, fill, nodes: nodeEntries };
}

function handleScrubberMove(bar, clientX) {
  const data = bar._scrubberData;
  if (!data) return;

  const rect = bar.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const pctMouse = ratio * 100;

  let nearest = data.dots[0];
  let minDist = Infinity;
  for (const d of data.dots) {
    const dist = Math.abs(d.pct - pctMouse);
    if (dist < minDist) { minDist = dist; nearest = d; }
  }

  for (const d of data.dots) d.el.classList.toggle('active', d === nearest);
  data.fill.style.width = nearest.pct + '%';

  const popup = data.popup;
  const node = nearest.node;

  // Horizontal clamp so popup doesn't overflow card edges
  const barWidth = rect.width;
  const popupWidth = 200;
  const dotPx = (nearest.pct / 100) * barWidth;
  const halfPopup = popupWidth / 2;
  if (dotPx < halfPopup) {
    popup.style.transform = 'translateX(0)';
    popup.style.left = '0';
  } else if (dotPx > barWidth - halfPopup) {
    popup.style.transform = 'translateX(-100%)';
    popup.style.left = '100%';
  } else {
    popup.style.transform = 'translateX(-50%)';
    popup.style.left = nearest.pct + '%';
  }

  popup.querySelector('.scrubber-popup-title').textContent = node.title || node.url || '?';

  const urlEl = popup.querySelector('.scrubber-popup-url');
  if (node.url) {
    urlEl.textContent = 's/' + (node.url.length > 38 ? node.url.substring(0, 35) + '...' : node.url);
    urlEl.style.display = '';
  } else {
    urlEl.style.display = 'none';
  }

  const conceptsEl = popup.querySelector('.scrubber-popup-concepts');
  if (node.concepts && node.concepts.length > 0) {
    conceptsEl.innerHTML = node.concepts.map(c => `<span class="scrubber-concept-tag">${escapeHtml(c)}</span>`).join('');
    conceptsEl.style.display = '';
  } else {
    conceptsEl.style.display = 'none';
  }

  const diffEl = popup.querySelector('.scrubber-popup-diff');
  if (node.diffSize > 0) {
    diffEl.innerHTML = '<span class="diff-count">+' + node.diffSize + '</span> new words';
    diffEl.style.display = '';
  } else if (!node.parentNodeId) {
    diffEl.innerHTML = 'origin';
    diffEl.style.display = '';
  } else {
    diffEl.style.display = 'none';
  }

  const thumbEl = popup.querySelector('.scrubber-popup-thumb');
  if (node.screenshotUrl) {
    thumbEl.style.display = '';
    const existing = thumbEl.querySelector('img');
    if (!existing || existing.src !== node.screenshotUrl) {
      thumbEl.innerHTML = '<img src="' + escapeHtml(node.screenshotUrl) + '" alt="" />';
    }
  } else {
    thumbEl.style.display = 'none';
    thumbEl.innerHTML = '';
  }

  popup.classList.add('visible');
  activeScrubberPopup = popup;
}

function handleScrubberClick(bar, clientX) {
  const data = bar._scrubberData;
  if (!data) return;

  const rect = bar.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const pctMouse = ratio * 100;

  let nearest = data.dots[0];
  let minDist = Infinity;
  for (const d of data.dots) {
    const dist = Math.abs(d.pct - pctMouse);
    if (dist < minDist) { minDist = dist; nearest = d; }
  }

  const node = nearest.node;
  if (node.feedKey) loadFeedEntry(node.feedKey);
}

async function loadFeedEntry(feedKey) {
  if (!state.firebaseReady || !firebaseDb) return;
  try {
    const snap = await firebaseDb.ref('feed/' + feedKey).once('value');
    const entry = snap.val();
    if (entry && entry.html) {
      addressInput.value = entry.url;
      restorePage(entry.html);
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push({ url: entry.url, html: entry.html });
      state.historyIndex = state.history.length - 1;
      updateNavButtons();
      state.currentFeedKey = feedKey;
      state.currentExplorationId = entry.explorationId || null;
      updateBrowserUrl(entry.url);
      $('#contentArea').scrollTop = 0;
    } else if (entry) {
      navigateTo(entry.url);
    }
  } catch { /* silent */ }
}

function hideScrubberPopup() {
  if (activeScrubberPopup) {
    activeScrubberPopup.classList.remove('visible');
    activeScrubberPopup = null;
  }
}

function fetchAndBuildScrubber(card, allEntries) {
  const explorationId = card.dataset.explorationId;
  const cardUrl = (card.querySelector('.feed-card-url')?.textContent || '').replace(/^s\//, '').toLowerCase();
  if (!cardUrl) return;

  const cacheKey = explorationId || 'url:' + cardUrl;
  const cached = scrubberCache.get(cacheKey);
  if (cached && (Date.now() - cached.at < 300000)) {
    buildScrubber(card, cached.data);
    return;
  }

  // Build tree from all feed entries that share this URL lineage
  const related = allEntries.filter(e => {
    const eUrl = (e.url || '').toLowerCase();
    if (!eUrl) return false;
    return eUrl === cardUrl || cardUrl.startsWith(eUrl + '/') || eUrl.startsWith(cardUrl + '/');
  }).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  // Also include entries sharing the same explorationId
  if (explorationId) {
    for (const e of allEntries) {
      if (e.explorationId === explorationId && !related.find(r => r.key === e.key)) {
        related.push(e);
      }
    }
    related.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }

  if (related.length <= 1) {
    // Only this single entry — try Firebase exploration as fallback
    if (explorationId && state.firebaseReady && firebaseDb) {
      firebaseDb.ref('explorations/' + explorationId).once('value')
        .then(snap => {
          const data = snap.val();
          if (data && data.nodes) {
            scrubberCache.set(cacheKey, { data, at: Date.now() });
            buildScrubber(card, data);
          }
        })
        .catch(() => {});
      return;
    }
    // Build single-dot scrubber from the one entry we have
    if (related.length === 1) {
      const entry = related[0];
      const treeData = {
        rootUrl: entry.url,
        nodes: { [entry.key]: {
          url: (entry.url || '').toLowerCase(),
          title: entry.title || entry.url,
          parentNodeId: null,
          feedKey: entry.key,
          timestamp: entry.timestamp || 0,
          screenshotUrl: entry.screenshotUrl || null,
          diffSize: 0, concepts: [],
        }}
      };
      scrubberCache.set(cacheKey, { data: treeData, at: Date.now() });
      buildScrubber(card, treeData);
    }
    return;
  }

  // Build a virtual exploration tree from feed entries
  const nodes = {};
  for (const entry of related) {
    const nodeId = entry.key;
    const entryUrl = (entry.url || '').toLowerCase();
    // Find parent: the longest URL that is a prefix of this entry's URL
    let parentNodeId = null;
    let longestPrefix = 0;
    for (const other of related) {
      if (other.key === entry.key) continue;
      const otherUrl = (other.url || '').toLowerCase();
      if (entryUrl.startsWith(otherUrl + '/') && otherUrl.length > longestPrefix) {
        longestPrefix = otherUrl.length;
        parentNodeId = other.key;
      }
    }
    nodes[nodeId] = {
      url: entryUrl,
      title: entry.title || entryUrl,
      parentNodeId: parentNodeId,
      feedKey: entry.key,
      timestamp: entry.timestamp || 0,
      screenshotUrl: entry.screenshotUrl || null,
      diffSize: 0,
      concepts: [],
    };
  }

  const treeData = { rootUrl: related[0].url, nodes };
  scrubberCache.set(cacheKey, { data: treeData, at: Date.now() });
  buildScrubber(card, treeData);
}

function bindScrubbers(container, entries) {
  container.querySelectorAll('.feed-card').forEach(card => {
    fetchAndBuildScrubber(card, entries || []);

    const bar = card.querySelector('.scrubber-bar');
    if (!bar) return;

    bar.addEventListener('mousemove', (e) => {
      e.stopPropagation();
      handleScrubberMove(bar, e.clientX);
    });

    bar.addEventListener('mouseleave', () => {
      hideScrubberPopup();
      if (bar._scrubberData) {
        for (const d of bar._scrubberData.dots) d.el.classList.remove('active');
        bar._scrubberData.fill.style.width = '0';
      }
    });

    bar.addEventListener('click', (e) => {
      e.stopPropagation();
      handleScrubberClick(bar, e.clientX);
    });
  });
}
