// ── Navigation ──

// Creation bar: Enter key and Create button
addressInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !state.isLoading) {
    const val = addressInput.value.trim();
    if (!val) return;
    if (!state.currentWorldId) {
      showWorldCreateModal();
      return;
    }
    createEntry(val);
  }
});

goBtn.addEventListener('click', () => {
  if (state.isLoading) return;
  const val = addressInput.value.trim();
  if (!val) return;
  if (!state.currentWorldId) {
    showWorldCreateModal();
    return;
  }
  createEntry(val);
});

// Browser back/forward
window.addEventListener('popstate', (e) => {
  const s = e.state;
  if (!s) {
    showWelcomeScreen();
    return;
  }
  if (s.worldId && s.entryId) {
    if (s.worldId !== state.currentWorldId) {
      switchWorld(s.worldId).then(() => openEntry(s.entryId));
    } else {
      openEntry(s.entryId);
    }
  } else if (s.worldId) {
    if (s.worldId !== state.currentWorldId) {
      switchWorld(s.worldId);
    } else {
      showWorldOverview();
    }
  } else {
    showWelcomeScreen();
  }
});

// Iframe postMessage bridge (for immersive pages with JS)
window.addEventListener('message', (e) => {
  if (e.data?.type === 'sidenet-navigate') {
    let href = e.data.href.replace(/^(entry|sidenet|side):\/\//, '');
    // Try to find matching entry
    const match = state.worldEntries.find(
      ent => ent.name.toLowerCase() === href.toLowerCase()
    );
    if (match) {
      openEntry(match.id);
    } else {
      addressInput.value = href;
      createEntry(href);
    }
  }
  if (e.data?.type === 'sidenet-resize') {
    const iframe = pageContainer.querySelector('iframe');
    if (iframe) iframe.style.height = e.data.height + 'px';
  }
});

// Handle initial URL on page load
function handleInitialUrl() {
  const path = window.location.pathname;
  if (path.startsWith('/w/')) {
    const parts = path.slice(3).split('/');
    const worldId = parts[0];
    const entryId = parts[1];
    if (worldId) {
      switchWorld(worldId).then(() => {
        if (entryId) openEntry(entryId);
      });
      return true;
    }
  }
  return false;
}
