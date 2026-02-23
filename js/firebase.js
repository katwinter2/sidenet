// ── Firebase & Community Feed ──

function initFirebase() {
  try {
    if (typeof firebase === 'undefined' || typeof firebase.auth === 'undefined') {
      setTimeout(initFirebase, 500);
      return;
    }
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    firebaseDb = firebase.database();
    firebaseAuth = firebase.auth();

    firebaseAuth.onAuthStateChanged(async (user) => {
      if (user) {
        state.firebaseUid = user.uid;
        state.firebaseReady = true;
        await loadSettingsFromFirebase();
        // Check for path-based URL on initial load (e.g. /s/some.url/path)
        const initialUrl = getSidenetUrlFromPath();
        if (initialUrl) {
          navigateTo(initialUrl);
        } else {
          loadWelcomeFeed();
        }
      } else {
        firebaseAuth.signInAnonymously().catch((err) => {
          console.error('Anonymous auth failed:', err);
          state.firebaseReady = false;
          loadWelcomeFeed();
        });
      }
    });
  } catch (err) {
    console.error('Firebase init failed:', err);
    state.firebaseReady = false;
    loadWelcomeFeed();
  }
}

async function loadSettingsFromFirebase() {
  if (!state.firebaseReady || !firebaseDb || !state.firebaseUid) return;
  try {
    const snap = await firebaseDb.ref('users/' + state.firebaseUid + '/settings').once('value');
    const remote = snap.val();
    if (remote) {
      if (remote.temperature !== undefined) {
        state.temperature = remote.temperature;
        temperatureSlider.value = state.temperature;
        temperatureValue.textContent = state.temperature.toFixed(2);
      }
      if (remote.activePromptId !== undefined) {
        state.activePromptId = remote.activePromptId;
      }
      if (remote.systemPromptPresets !== undefined) {
        state.systemPromptPresets = remote.systemPromptPresets;
      }
      if (remote.displayName !== undefined) {
        state.displayName = remote.displayName;
        displayNameInput.value = state.displayName;
      }
      if (remote.imagesPerPage !== undefined) {
        state.imagesPerPage = remote.imagesPerPage;
        imagesPerPageInput.value = state.imagesPerPage;
      }
      populatePromptPresetSelect();
      localStorage.setItem('sidenet_temperature', state.temperature);
      localStorage.setItem('sidenet_activePromptId', state.activePromptId);
      localStorage.setItem('sidenet_systemPromptPresets', JSON.stringify(state.systemPromptPresets));
      localStorage.setItem('sidenet_displayName', state.displayName);
      localStorage.setItem('sidenet_imagesPerPage', state.imagesPerPage);
    } else {
      await saveSettingsToFirebase();
    }
    state.settingsSynced = true;
  } catch (err) {
    console.error('Failed to load settings from Firebase:', err);
  }
}

function saveSettingsToFirebase() {
  if (!state.firebaseReady || !firebaseDb || !state.firebaseUid) return;
  return firebaseDb.ref('users/' + state.firebaseUid + '/settings').set({
    temperature: state.temperature,
    activePromptId: state.activePromptId,
    systemPromptPresets: state.systemPromptPresets,
    displayName: state.displayName,
    imagesPerPage: state.imagesPerPage,
    lastUpdated: Date.now(),
  }).catch((err) => {
    console.error('Failed to save settings to Firebase:', err);
  });
}

function publishToFeed(url, title, html) {
  if (!state.firebaseReady || !firebaseDb) return Promise.resolve(null);
  const cleanHtml = html.substring(0, 40000);
  const { html: rawForPreview } = unpackPageContent(cleanHtml);
  const tmp = document.createElement('div');
  tmp.innerHTML = rawForPreview;
  const h1 = tmp.querySelector('h1');
  if (h1) h1.remove();
  const preview = tmp.textContent.substring(0, 200).trim();

  const newRef = firebaseDb.ref('feed').push();
  const feedKey = newRef.key;
  return newRef.set({
    url: url.toLowerCase(),
    title: title || url,
    preview,
    html: cleanHtml,
    author: state.displayName || 'Anonymous',
    model: modelSelect.value,
    timestamp: Date.now(),
    explorationId: null,
  }).then(() => { feedCache.at = 0; welcomeFeedCache.at = 0; return feedKey; }).catch(() => null);
}

function computeContentDiff(parentHtml, childHtml) {
  const toText = (h) => { const t = document.createElement('div'); t.innerHTML = h; return t.textContent || ''; };
  const parentWords = new Set(toText(parentHtml).toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const childWords = toText(childHtml).toLowerCase().split(/\s+/).filter(w => w.length > 2);
  let newCount = 0;
  for (const w of childWords) { if (!parentWords.has(w)) newCount++; }
  return { size: newCount };
}

function extractNewConcepts(parentHtml, childHtml) {
  const concepts = [];
  const parentEl = document.createElement('div');
  parentEl.innerHTML = parentHtml;
  const childEl = document.createElement('div');
  childEl.innerHTML = childHtml;

  // New headings
  const parentHeadings = new Set([...parentEl.querySelectorAll('h1,h2,h3')].map(h => h.textContent.trim().toLowerCase()));
  for (const h of childEl.querySelectorAll('h1,h2,h3')) {
    const text = h.textContent.trim();
    if (text && !parentHeadings.has(text.toLowerCase())) concepts.push(text.substring(0, 60));
  }

  // New link texts
  const parentLinks = new Set([...parentEl.querySelectorAll('a')].map(a => a.textContent.trim().toLowerCase()));
  for (const a of childEl.querySelectorAll('a')) {
    const text = a.textContent.trim();
    if (text && text.length > 3 && !parentLinks.has(text.toLowerCase())) concepts.push(text.substring(0, 60));
  }

  // New bold/strong text
  const parentBold = new Set([...parentEl.querySelectorAll('strong,b')].map(b => b.textContent.trim().toLowerCase()));
  for (const b of childEl.querySelectorAll('strong,b')) {
    const text = b.textContent.trim();
    if (text && text.length > 3 && !parentBold.has(text.toLowerCase())) concepts.push(text.substring(0, 60));
  }

  return [...new Set(concepts)].slice(0, 8);
}

async function updateExplorationTree(url, title, feedKey, html, { parentFeedKey, explorationId, parentHtml }) {
  if (!state.firebaseReady || !firebaseDb || !feedKey) return;
  try {
    if (explorationId && parentFeedKey && parentHtml) {
      // Child navigation (link click) — extend existing tree
      const diffResult = computeContentDiff(parentHtml, html);
      const concepts = extractNewConcepts(parentHtml, html);

      // Find parent node by feedKey (client-side scan)
      const nodesSnap = await firebaseDb.ref('explorations/' + explorationId + '/nodes').once('value');
      let parentNodeId = null;
      if (nodesSnap.exists()) {
        nodesSnap.forEach(child => {
          if (child.val().feedKey === parentFeedKey) parentNodeId = child.key;
        });
      }

      const newNodeRef = firebaseDb.ref('explorations/' + explorationId + '/nodes').push();
      await newNodeRef.set({
        url: url.toLowerCase(),
        title: title,
        parentNodeId: parentNodeId,
        feedKey: feedKey,
        timestamp: Date.now(),
        diffSize: diffResult.size,
        concepts: concepts,
        tonalModifier: state.tonalModifier || null,
      });

      await firebaseDb.ref('feed/' + feedKey + '/explorationId').set(explorationId);
      state.currentExplorationId = explorationId;
    } else {
      // New root (user typed URL)
      const newExplorationRef = firebaseDb.ref('explorations').push();
      const newExplorationId = newExplorationRef.key;
      const newNodeRef = newExplorationRef.child('nodes').push();

      await newExplorationRef.set({
        rootUrl: url.toLowerCase(),
        authorUid: state.firebaseUid || null,
        author: state.displayName || 'Anonymous',
        createdAt: Date.now(),
        tonalModifier: state.tonalModifier || null,
        nodes: {
          [newNodeRef.key]: {
            url: url.toLowerCase(),
            title: title,
            parentNodeId: null,
            feedKey: feedKey,
            timestamp: Date.now(),
            diffSize: 0,
            concepts: [],
            tonalModifier: state.tonalModifier || null,
          }
        }
      });

      await firebaseDb.ref('feed/' + feedKey + '/explorationId').set(newExplorationId);
      state.currentExplorationId = newExplorationId;
    }
  } catch (err) {
    console.error('Exploration tree update failed:', err);
  }
}
