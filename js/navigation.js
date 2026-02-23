// ── Navigation ──
const welcomeHTML = pageContainer.innerHTML;

// Browser URL integration — each page gets a clean /s/ path
function updateBrowserUrl(sidenetUrl) {
  if (sidenetUrl) {
    history.pushState({ sidenetUrl }, '', '/s/' + sidenetUrl);
  } else {
    history.pushState({ sidenetUrl: null }, '', '/');
  }
}

function isOnPage() {
  return window.location.pathname.startsWith('/s/');
}

function getSidenetUrlFromPath() {
  const path = window.location.pathname;
  if (path.startsWith('/s/')) return path.slice(3);
  return null;
}

function goHome() {
  pageContainer.innerHTML = welcomeHTML;
  addressInput.value = '';
  state.historyIndex = -1;
  state.currentFeedKey = null;
  state.currentExplorationId = null;
  state.tonalModifier = null;
  updateNavButtons();
  updateBrowserUrl(null);
  toggleFeed(false);
  state.feedClosedByUser = false;
  loadWelcomeFeed();
}

homeBtn.addEventListener('click', goHome);

// Handle browser back/forward
window.addEventListener('popstate', (e) => {
  const sidenetUrl = (e.state && e.state.sidenetUrl) || getSidenetUrlFromPath();
  if (!sidenetUrl) {
    // Going back to homepage
    pageContainer.innerHTML = welcomeHTML;
    addressInput.value = '';
    state.currentFeedKey = null;
    state.currentExplorationId = null;
    state.tonalModifier = null;
    toggleFeed(false);
    state.feedClosedByUser = false;
    loadWelcomeFeed();
    // Sync with internal history
    if (state.historyIndex > 0) state.historyIndex--;
    updateNavButtons();
  } else {
    // Going to a page — find it in internal history
    addressInput.value = sidenetUrl;
    const found = state.history.find(h => h.url === sidenetUrl);
    if (found && found.html) {
      restorePage(found.html);
      if (!state.feedClosedByUser) toggleFeed(true);
    } else {
      navigateTo(sidenetUrl);
    }
    updateNavButtons();
  }
});

addressInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !state.isLoading) {
    navigateTo(addressInput.value.trim());
  }
});

goBtn.addEventListener('click', () => {
  if (!state.isLoading) navigateTo(addressInput.value.trim());
});

backBtn.addEventListener('click', () => {
  if (state.historyIndex > 0) {
    state.historyIndex--;
    const entry = state.history[state.historyIndex];
    addressInput.value = entry.url;
    restorePage(entry.html);
    updateNavButtons();
    updateBrowserUrl(entry.url);
  }
});

forwardBtn.addEventListener('click', () => {
  if (state.historyIndex < state.history.length - 1) {
    state.historyIndex++;
    const entry = state.history[state.historyIndex];
    addressInput.value = entry.url;
    restorePage(entry.html);
    updateNavButtons();
    updateBrowserUrl(entry.url);
  }
});

function updateNavButtons() {
  backBtn.disabled = state.historyIndex <= 0;
  forwardBtn.disabled = state.historyIndex >= state.history.length - 1;
}

// ── Duplicate URL detection ──
function checkDuplicateUrl(query) {
  return new Promise((resolve) => {
    if (!state.firebaseReady || !firebaseDb) { resolve(null); return; }
    firebaseDb.ref('feed')
      .orderByChild('url')
      .equalTo(query.toLowerCase())
      .once('value')
      .then(snap => {
        if (snap.exists()) {
          const entries = [];
          snap.forEach(child => entries.push({ key: child.key, ...child.val() }));
          entries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          resolve(entries[0]);
        } else {
          resolve(null);
        }
      })
      .catch(() => resolve(null));
  });
}

function showDuplicateModal() {
  return new Promise((resolve) => {
    const modal = document.getElementById('duplicateModal');
    const yesBtn = document.getElementById('duplicateYes');
    const noBtn = document.getElementById('duplicateNo');
    modal.classList.add('open');
    function cleanup() {
      modal.classList.remove('open');
      yesBtn.removeEventListener('click', onYes);
      noBtn.removeEventListener('click', onNo);
      modal.removeEventListener('click', onBackdrop);
    }
    function onYes() { cleanup(); resolve('existing'); }
    function onNo() { cleanup(); resolve('generate'); }
    function onBackdrop(e) { if (e.target === modal) { cleanup(); resolve('generate'); } }
    yesBtn.addEventListener('click', onYes);
    noBtn.addEventListener('click', onNo);
    modal.addEventListener('click', onBackdrop);
  });
}

// ── Iframe postMessage bridge ──
window.addEventListener('message', (e) => {
  if (e.data?.type === 'sidenet-navigate') {
    let href = e.data.href.replace(/^(sidenet|side):\/\//, '');
    navigateTo(href, {
      parentFeedKey: state.currentFeedKey,
      explorationId: state.currentExplorationId,
      parentHtml: pageContainer.innerHTML,
    });
  }
  if (e.data?.type === 'sidenet-resize') {
    const iframe = pageContainer.querySelector('iframe');
    if (iframe) iframe.style.height = e.data.height + 'px';
  }
});

// ── Main page generation ──
async function navigateTo(query, { parentFeedKey, explorationId, parentHtml } = {}) {
  if (!query) return;

  // Check for duplicate URL in community feed
  const existingEntry = await checkDuplicateUrl(query);
  if (existingEntry) {
    const choice = await showDuplicateModal();
    if (choice === 'existing') {
      addressInput.value = existingEntry.url;
      restorePage(existingEntry.html);
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push({ url: existingEntry.url, html: existingEntry.html });
      state.historyIndex = state.history.length - 1;
      updateNavButtons();
      state.currentFeedKey = existingEntry.key || null;
      state.currentExplorationId = existingEntry.explorationId || null;
      updateBrowserUrl(existingEntry.url);
      if (!state.feedClosedByUser) toggleFeed(true);
      $('#contentArea').scrollTop = 0;
      return;
    }
  }

  state.isLoading = true;
  goBtn.disabled = true;
  addressInput.value = query;

  // Show loading with cycling immersive messages
  const loadingMessages = [
    'searching the records...',
    'exploring a new path...',
    'digging something up...',
    'tracing a signal...',
    'following a thread...',
    'pulling from the archive...',
    'navigating the deep net...',
    'decoding the broadcast...',
    'tuning into a frequency...',
    'unearthing an artifact...',
    'opening a sealed channel...',
    'sifting through the noise...',
  ];
  const loadMsg = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
  pageContainer.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <div class="loading-text" id="loadingText">${loadMsg}</div>
      <div class="loading-step" id="loadingStep"></div>
    </div>
  `;
  const loadingInterval = setInterval(() => {
    const el = $('#loadingText');
    if (!el) { clearInterval(loadingInterval); return; }
    el.textContent = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
  }, 3000);

  // Determine storage URL (add suffix if duplicate)
  let storageUrl = query.toLowerCase();
  if (existingEntry) {
    try {
      const snap = await firebaseDb.ref('feed')
        .orderByChild('url')
        .startAt(query.toLowerCase())
        .endAt(query.toLowerCase() + '\uf8ff')
        .once('value');
      let count = 0;
      if (snap.exists()) snap.forEach(() => count++);
      storageUrl = query.toLowerCase() + '~' + (count + 1);
    } catch { /* use base url */ }
  }

  try {
    // Generate tonal modifier for new explorations (not link clicks)
    if (!parentFeedKey) {
      state.tonalModifier = await generateTonalModifier(query);
    }

    // Step 1: Generate page HTML
    const pageHTML = await generatePage(query);

    // Step 2: Parse structured response into HTML/CSS/JS
    const { html: rawHtml, css, js } = parseStructuredResponse(pageHTML);
    const { html: processedHtml, imagePrompts } = parseAndInsertImages(rawHtml);

    // Step 3: Render page (iframe for JS, direct DOM for CSS-only)
    let finalHtml = processedHtml; // will be updated after images resolve
    if (js.trim()) {
      const resolved = resolveImagesForIframe(processedHtml, imagePrompts);
      finalHtml = resolved;
      renderStructuredPage(resolved, css, js);
    } else {
      renderStructuredPage(processedHtml, css, '');
      const limitedPrompts = imagePrompts.slice(0, state.imagesPerPage);
      if (limitedPrompts.length > 0) {
        await generateImages(limitedPrompts);
        // After images load, extract final HTML with resolved <img> src URLs
        const gen = pageContainer.querySelector('.generated-page');
        if (gen) {
          // Get innerHTML but strip the scoped <style> tag we injected
          const clone = gen.cloneNode(true);
          const injectedStyle = clone.querySelector('style');
          if (injectedStyle) injectedStyle.remove();
          finalHtml = clone.innerHTML;
        }
      }
      bindPageLinks();
    }

    // Save to session history (pack with final resolved image URLs)
    const packed = packPageContent(finalHtml, css, js);
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push({ url: query, html: packed });
    state.historyIndex = state.history.length - 1;
    updateNavButtons();
    updateBrowserUrl(query);

    // Save to persistent history
    const pageTitle = extractTitle(finalHtml) || query;
    const now = Date.now();
    savePersistentHistory({
      url: query,
      title: pageTitle,
      html: packed,
      timestamp: now,
      model: modelSelect.value,
    });

    // Auto-publish to community feed and track exploration tree
    const feedKey = await publishToFeed(storageUrl, pageTitle, packed);
    state.currentFeedKey = feedKey;
    await updateExplorationTree(query, pageTitle, feedKey, packed, { parentFeedKey, explorationId, parentHtml });

    // Capture screenshot asynchronously (don't block page display)
    if (feedKey) {
      if (js.trim()) {
        captureHtmlAsScreenshot(finalHtml, css, feedKey).then(url => {
          if (url) updateNodeScreenshot(feedKey, state.currentExplorationId, url);
        });
      } else {
        // Wait for all images to fully load before capturing screenshot
        const imgs = pageContainer.querySelectorAll('.page-image');
        const waits = [...imgs].map(img =>
          img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 15000); })
        );
        Promise.allSettled(waits).then(() => {
          captureAndUploadScreenshot(feedKey).then(url => {
            if (url) updateNodeScreenshot(feedKey, state.currentExplorationId, url);
          });
        });
      }
    }

    // Scroll to top
    $('#contentArea').scrollTop = 0;

    // Auto-open feed sidebar unless user closed it
    if (!state.feedClosedByUser) {
      toggleFeed(true);
    }

  } catch (err) {
    pageContainer.innerHTML = `
      <div class="page-container">
        <div class="error-banner">
          <strong>Connection failed:</strong> ${escapeHtml(err.message)}
        </div>
        <p style="color:var(--text-dim);margin-top:12px;">
          Check your API key in settings, or try a different model.
        </p>
      </div>
    `;
  }

  clearInterval(loadingInterval);
  state.isLoading = false;
  goBtn.disabled = false;
}
