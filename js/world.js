// ── World Management ──

async function createWorld(name, description, genre) {
  if (!state.firebaseReady || !firebaseDb) throw new Error('Firebase not ready');
  const ref = firebaseDb.ref('worlds').push();
  const worldId = ref.key;
  const data = {
    name,
    description: description || '',
    genre: genre || 'fantasy',
    authorUid: state.firebaseUid,
    author: state.displayName || 'Anonymous',
    createdAt: Date.now(),
    isPublic: true,
    entryCount: 0,
  };
  await ref.set(data);
  return worldId;
}

async function loadWorld(worldId) {
  if (!state.firebaseReady || !firebaseDb) return;
  const snap = await firebaseDb.ref('worlds/' + worldId).once('value');
  if (!snap.exists()) return null;
  const data = snap.val();
  state.currentWorldId = worldId;
  state.currentWorldName = data.name || 'Untitled';
  state.currentWorldData = data;
  localStorage.setItem('sidenet_currentWorldId', worldId);
  localStorage.setItem('sidenet_currentWorldName', state.currentWorldName);

  // Load all entry summaries (not full content)
  const entriesSnap = await firebaseDb.ref('worlds/' + worldId + '/entries').once('value');
  state.worldEntries = [];
  if (entriesSnap.exists()) {
    entriesSnap.forEach(child => {
      const e = child.val();
      state.worldEntries.push({
        id: child.key,
        name: e.name || 'Untitled',
        type: e.type || 'lore',
        summary: e.summary || '',
        tags: e.tags || [],
        connections: e.connections || [],
        imageUrl: e.imageUrl || null,
        createdAt: e.createdAt || 0,
      });
    });
  }
  state.worldEntries.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return data;
}

async function switchWorld(worldId) {
  await loadWorld(worldId);
  worldNameBtn.textContent = state.currentWorldName;
  state.currentEntryId = null;
  state.viewMode = 'overview';
  state.lastSuggestions = [];
  renderEntryList();
  showWorldOverview();
  displaySuggestions([]);
}

async function listMyWorlds() {
  if (!state.firebaseReady || !firebaseDb || !state.firebaseUid) return [];
  const snap = await firebaseDb.ref('worlds')
    .orderByChild('authorUid')
    .equalTo(state.firebaseUid)
    .once('value');
  const worlds = [];
  if (snap.exists()) {
    snap.forEach(child => {
      worlds.push({ id: child.key, ...child.val() });
    });
  }
  worlds.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return worlds;
}

async function listPublicWorlds(limit = 30) {
  if (!state.firebaseReady || !firebaseDb) return [];
  const snap = await firebaseDb.ref('worlds')
    .orderByChild('createdAt')
    .limitToLast(limit)
    .once('value');
  const worlds = [];
  if (snap.exists()) {
    snap.forEach(child => {
      const w = child.val();
      if (w.isPublic) worlds.push({ id: child.key, ...w });
    });
  }
  worlds.reverse();
  return worlds;
}

function showWelcomeScreen() {
  state.viewMode = 'overview';
  state.currentEntryId = null;
  worldSidebar.classList.remove('has-world');

  pageContainer.innerHTML = `
    <div class="welcome-wrapper">
      <div class="welcome-header">
        <div class="welcome-logo">sidenet</div>
        <p class="welcome-sub">collaborative worldbuilder</p>
      </div>
      <div class="welcome-actions">
        <button class="btn-primary welcome-create-btn" id="welcomeCreateBtn">Create a New World</button>
      </div>
      <div class="welcome-worlds-section" id="welcomeWorldsSection">
        <h3>Your Worlds</h3>
        <div class="welcome-worlds-list" id="welcomeWorldsList">
          <div class="feed-empty">Loading...</div>
        </div>
      </div>
      <div class="welcome-community-section" id="welcomeCommunitySection">
        <h3>Community Worlds</h3>
        <div class="welcome-worlds-list" id="welcomeCommunityList">
          <div class="feed-empty">Loading...</div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('welcomeCreateBtn').addEventListener('click', showWorldCreateModal);
  loadWelcomeWorlds();
}

async function loadWelcomeWorlds() {
  const myList = document.getElementById('welcomeWorldsList');
  const communityList = document.getElementById('welcomeCommunityList');

  try {
    const myWorlds = await listMyWorlds();
    if (myWorlds.length === 0) {
      myList.innerHTML = '<div class="feed-empty">No worlds yet. Create your first!</div>';
    } else {
      myList.innerHTML = myWorlds.map(renderWorldCard).join('');
      bindWorldCards(myList);
    }
  } catch {
    myList.innerHTML = '<div class="feed-empty">Could not load worlds</div>';
  }

  try {
    const publicWorlds = await listPublicWorlds();
    const otherWorlds = publicWorlds.filter(w => w.authorUid !== state.firebaseUid);
    if (otherWorlds.length === 0) {
      communityList.innerHTML = '<div class="feed-empty">No community worlds yet</div>';
    } else {
      communityList.innerHTML = otherWorlds.slice(0, 20).map(renderWorldCard).join('');
      bindWorldCards(communityList);
    }
  } catch {
    communityList.innerHTML = '<div class="feed-empty">Could not load community worlds</div>';
  }
}

function renderWorldCard(world) {
  const date = world.createdAt ? new Date(world.createdAt).toLocaleDateString() : '';
  const count = world.entryCount || 0;
  return `
    <div class="world-card" data-world-id="${world.id}">
      <div class="world-card-name">${escapeHtml(world.name)}</div>
      <div class="world-card-desc">${escapeHtml(world.description || '')}</div>
      <div class="world-card-meta">
        <span>${escapeHtml(world.genre || 'fantasy')}</span>
        <span>${count} ${count === 1 ? 'entry' : 'entries'}</span>
        <span>${escapeHtml(world.author || 'Anonymous')}</span>
        <span>${date}</span>
      </div>
    </div>`;
}

function bindWorldCards(container) {
  container.querySelectorAll('.world-card').forEach(card => {
    card.addEventListener('click', () => switchWorld(card.dataset.worldId));
  });
}

function showWorldOverview() {
  state.viewMode = 'overview';
  state.currentEntryId = null;
  worldSidebar.classList.add('has-world');

  if (state.worldEntries.length === 0) {
    pageContainer.innerHTML = `
      <div class="welcome-wrapper">
        <div class="welcome-header">
          <div class="welcome-logo">${escapeHtml(state.currentWorldName)}</div>
          <p class="welcome-sub">${escapeHtml(state.currentWorldData?.description || 'Your world awaits')}</p>
        </div>
        <div class="overview-empty">
          <p>This world is empty. Type a description in the creation bar above to create your first entry.</p>
          <p class="overview-hint">Try something like: "The Hollow Spire — an ancient tower at the edge of the Driftlands"</p>
        </div>
      </div>`;
  } else {
    const grid = state.worldEntries.map(entry => {
      const icon = getTypeIcon(entry.type);
      return `
        <div class="overview-card" data-entry-id="${entry.id}">
          ${entry.imageUrl ? `<div class="overview-card-thumb"><img src="${entry.imageUrl}" alt="" /></div>` : ''}
          <div class="overview-card-body">
            <div class="overview-card-type">${icon} ${entry.type}</div>
            <div class="overview-card-name">${escapeHtml(entry.name)}</div>
            <div class="overview-card-summary">${escapeHtml(entry.summary || '')}</div>
          </div>
        </div>`;
    }).join('');

    pageContainer.innerHTML = `
      <div class="welcome-wrapper">
        <div class="welcome-header">
          <div class="welcome-logo">${escapeHtml(state.currentWorldName)}</div>
          <p class="welcome-sub">${escapeHtml(state.currentWorldData?.description || '')}</p>
        </div>
        <div class="overview-grid">${grid}</div>
      </div>`;

    pageContainer.querySelectorAll('.overview-card').forEach(card => {
      card.addEventListener('click', () => openEntry(card.dataset.entryId));
    });
  }
}

// ── World creation modal ──
function showWorldCreateModal() {
  const modal = document.getElementById('worldCreateModal');
  document.getElementById('worldNameInput').value = '';
  document.getElementById('worldDescInput').value = '';
  document.getElementById('worldGenreSelect').value = 'fantasy';
  modal.classList.add('open');
}

document.getElementById('cancelWorldCreate').addEventListener('click', () => {
  document.getElementById('worldCreateModal').classList.remove('open');
});

document.getElementById('worldCreateModal').addEventListener('click', (e) => {
  if (e.target.id === 'worldCreateModal') e.target.classList.remove('open');
});

document.getElementById('confirmWorldCreate').addEventListener('click', async () => {
  const name = document.getElementById('worldNameInput').value.trim();
  if (!name) { document.getElementById('worldNameInput').focus(); return; }
  const desc = document.getElementById('worldDescInput').value.trim();
  const genre = document.getElementById('worldGenreSelect').value;
  document.getElementById('worldCreateModal').classList.remove('open');

  try {
    const worldId = await createWorld(name, desc, genre);
    await switchWorld(worldId);
  } catch (err) {
    console.error('Failed to create world:', err);
  }
});

// ── World selector modal ──
worldNameBtn.addEventListener('click', showWorldSelectModal);

async function showWorldSelectModal() {
  const modal = document.getElementById('worldSelectModal');
  const list = document.getElementById('worldSelectList');
  modal.classList.add('open');
  list.innerHTML = '<div class="feed-empty">Loading...</div>';

  try {
    const myWorlds = await listMyWorlds();
    if (myWorlds.length === 0) {
      list.innerHTML = '<div class="feed-empty">No worlds yet. Create your first!</div>';
    } else {
      list.innerHTML = myWorlds.map(renderWorldCard).join('');
      list.querySelectorAll('.world-card').forEach(card => {
        card.addEventListener('click', () => {
          modal.classList.remove('open');
          switchWorld(card.dataset.worldId);
        });
      });
    }
  } catch {
    list.innerHTML = '<div class="feed-empty">Could not load worlds</div>';
  }
}

document.getElementById('cancelWorldSelect').addEventListener('click', () => {
  document.getElementById('worldSelectModal').classList.remove('open');
});

document.getElementById('worldSelectModal').addEventListener('click', (e) => {
  if (e.target.id === 'worldSelectModal') e.target.classList.remove('open');
});

document.getElementById('newWorldFromSelect').addEventListener('click', () => {
  document.getElementById('worldSelectModal').classList.remove('open');
  showWorldCreateModal();
});
