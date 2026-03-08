// ── Entry Connections ──

async function resolveConnections(worldId, entryId, connections) {
  if (!connections || connections.length === 0 || !firebaseDb) return;

  for (const conn of connections) {
    const connName = typeof conn === 'string' ? conn : conn.name;
    const relationship = typeof conn === 'string' ? 'connected to' : (conn.relationship || 'connected to');
    if (!connName) continue;

    // Try to find an existing entry by name
    const existing = state.worldEntries.find(
      e => e.id !== entryId && e.name.toLowerCase() === connName.toLowerCase()
    );

    if (existing) {
      // Store bidirectional connection on both entries
      try {
        // Forward: new entry -> existing
        await firebaseDb.ref('worlds/' + worldId + '/entries/' + entryId + '/connections').push().set({
          entryId: existing.id,
          name: existing.name,
          relationship,
        });
        // Reverse: existing -> new entry
        const newEntry = state.worldEntries.find(e => e.id === entryId);
        await firebaseDb.ref('worlds/' + worldId + '/entries/' + existing.id + '/connections').push().set({
          entryId,
          name: newEntry ? newEntry.name : connName,
          relationship: 'connected to',
        });
      } catch (err) {
        console.error('Failed to store connection:', err);
      }
    }
    // Unresolved connections are kept as-is in the entry data — they'll show as "not yet created"
  }

  // Check if any existing entries had unresolved connections matching the new entry's name
  const newEntry = state.worldEntries.find(e => e.id === entryId);
  if (!newEntry) return;

  for (const existingEntry of state.worldEntries) {
    if (existingEntry.id === entryId) continue;
    const unresolved = (existingEntry.connections || []).filter(c => {
      const name = typeof c === 'string' ? c : c.name;
      return name && !c.entryId && name.toLowerCase() === newEntry.name.toLowerCase();
    });
    for (const conn of unresolved) {
      try {
        await firebaseDb.ref('worlds/' + worldId + '/entries/' + existingEntry.id + '/connections').push().set({
          entryId,
          name: newEntry.name,
          relationship: typeof conn === 'string' ? 'connected to' : (conn.relationship || 'connected to'),
        });
      } catch {}
    }
  }
}

function renderConnectionsList(entry) {
  const connections = entry.connections || [];
  if (!connections || (Array.isArray(connections) && connections.length === 0)) return '';

  // Connections may be stored as an object (Firebase push keys) or array
  let connArray = [];
  if (Array.isArray(connections)) {
    connArray = connections;
  } else if (typeof connections === 'object') {
    connArray = Object.values(connections);
  }

  if (connArray.length === 0) return '';

  let html = '<div class="connections-list">';
  for (const conn of connArray) {
    const name = typeof conn === 'string' ? conn : conn.name;
    const rel = typeof conn === 'string' ? '' : (conn.relationship || '');
    const resolved = conn.entryId
      ? state.worldEntries.find(e => e.id === conn.entryId)
      : state.worldEntries.find(e => e.name.toLowerCase() === (name || '').toLowerCase());

    html += `
      <div class="connection-item ${resolved ? 'resolved' : 'unresolved'}"
           ${resolved ? `data-entry-id="${resolved.id}"` : ''}>
        <span class="connection-name">${escapeHtml(name || '')}</span>
        ${rel ? `<span class="connection-rel">${escapeHtml(rel)}</span>` : ''}
        ${!resolved ? '<span class="connection-hint">Not yet created</span>' : ''}
      </div>`;
  }
  html += '</div>';

  // Bind clicks on resolved connections
  setTimeout(() => {
    document.querySelectorAll('.connection-item.resolved[data-entry-id]').forEach(item => {
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => openEntry(item.dataset.entryId));
    });
    document.querySelectorAll('.connection-item.unresolved').forEach(item => {
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        const name = item.querySelector('.connection-name')?.textContent;
        if (name) {
          addressInput.value = name;
          createEntry(name);
        }
      });
    });
  }, 0);

  return html;
}
