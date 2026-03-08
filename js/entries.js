// ── Entry CRUD & Cards ──

function getTypeIcon(type) {
  const icons = {
    location: '\u{1F9ED}',  // compass
    character: '\u{1F464}', // person silhouette
    event: '\u{26A1}',      // lightning
    faction: '\u{1F6A9}',   // flag
    lore: '\u{1F4D6}',      // book
    item: '\u{1F48E}',      // gem
  };
  return icons[type] || '\u{1F4CB}';
}

function buildWorldContext(entries) {
  if (!entries || entries.length === 0) return '';
  const recent = entries
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, CONFIG.world.contextWindowEntries);

  let context = 'EXISTING WORLD ENTRIES:\n';
  for (const e of recent) {
    context += `- [${e.type}] ${e.name}: ${e.summary}\n`;
    if (e.connections && e.connections.length > 0) {
      const connNames = Array.isArray(e.connections)
        ? e.connections.map(c => typeof c === 'string' ? c : c.name).filter(Boolean)
        : [];
      if (connNames.length > 0) context += `  Connections: ${connNames.join(', ')}\n`;
    }
  }
  return context;
}

async function generateWorldEntry(userInput, context) {
  const model = modelSelect.value;
  let systemPrompt = getActiveSystemPrompt();

  // Add world metadata to system prompt
  if (state.currentWorldData) {
    const w = state.currentWorldData;
    systemPrompt += `\n\nWORLD CONTEXT:\nWorld: "${w.name}"\nGenre: ${w.genre || 'fantasy'}\n${w.description ? 'Premise: ' + w.description : ''}`;
  }

  const userPrompt = `Create a world entry for: ${userInput}

${context ? context + '\n' : ''}Generate a structured entry with connections to existing entries where appropriate, and suggest follow-up entries.`;

  const response = await fetch(CONFIG.api.textGeneration, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(state.apiKey ? { 'Authorization': `Bearer ${state.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: state.temperature,
      max_tokens: CONFIG.llm.maxTokens,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API error ${response.status}: ${errText.substring(0, 200)}`);
  }

  const data = await response.json();
  let content = data.choices[0].message.content;
  content = content.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  return content;
}

function parseWorldResponse(raw) {
  raw = raw.replace(/^```\w*\s*\n?/i, '').replace(/\n?```\s*$/i, '');

  // Extract ===ENTRY=== section
  let entryData = null;
  const entryMatch = raw.match(/===ENTRY===\s*([\s\S]*?)(?=={3}\w+={3})/);
  if (entryMatch) {
    const jsonStr = entryMatch[1].trim();
    try {
      entryData = JSON.parse(jsonStr);
    } catch {
      // Try to find a JSON object within the text
      const jsonObjMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonObjMatch) {
        try { entryData = JSON.parse(jsonObjMatch[0]); } catch {}
      }
    }
  }

  // Parse HTML/CSS/JS using existing parser
  const { html, css, js } = parseStructuredResponse(raw);

  // Provide defaults if ENTRY section was missing or invalid
  if (!entryData) {
    const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    entryData = {
      name: titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : 'Untitled Entry',
      type: 'lore',
      summary: '',
      connections: [],
      tags: [],
      suggestions: [],
    };
  }

  // Normalize entry data
  entryData.name = entryData.name || 'Untitled Entry';
  entryData.type = CONFIG.world.entryTypes.includes(entryData.type) ? entryData.type : 'lore';
  entryData.summary = (entryData.summary || '').substring(0, CONFIG.world.summaryMaxLength);
  entryData.connections = Array.isArray(entryData.connections) ? entryData.connections : [];
  entryData.tags = Array.isArray(entryData.tags) ? entryData.tags : [];
  entryData.suggestions = Array.isArray(entryData.suggestions) ? entryData.suggestions : [];

  return { entry: entryData, html, css, js };
}

async function saveEntry(worldId, entryData) {
  if (!state.firebaseReady || !firebaseDb) throw new Error('Firebase not ready');
  const ref = firebaseDb.ref('worlds/' + worldId + '/entries').push();
  const entryId = ref.key;
  await ref.set({ ...entryData, id: entryId });

  // Increment world entry count
  const countRef = firebaseDb.ref('worlds/' + worldId + '/entryCount');
  const countSnap = await countRef.once('value');
  await countRef.set((countSnap.val() || 0) + 1);

  return entryId;
}

async function createEntry(userInput) {
  if (!userInput) return;
  if (state.isLoading) return;

  // Auto-create a world if none exists
  if (!state.currentWorldId) {
    try {
      await autoCreateWorld(userInput);
    } catch (err) {
      console.error('Auto-create world failed:', err);
      pageContainer.innerHTML = `
        <div class="page-container">
          <div class="error-banner">
            <strong>Could not create world:</strong> ${escapeHtml(err.message)}
          </div>
        </div>`;
      return;
    }
  }

  state.isLoading = true;
  goBtn.disabled = true;

  // Show loading
  const loadMsg = CONFIG.loadingMessages[Math.floor(Math.random() * CONFIG.loadingMessages.length)];
  pageContainer.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <div class="loading-text" id="loadingText">${loadMsg}</div>
    </div>
  `;
  const loadingInterval = setInterval(() => {
    const el = document.getElementById('loadingText');
    if (!el) { clearInterval(loadingInterval); return; }
    el.textContent = CONFIG.loadingMessages[Math.floor(Math.random() * CONFIG.loadingMessages.length)];
  }, CONFIG.loadingMessageInterval);

  try {
    // Build context from existing entries
    const context = buildWorldContext(state.worldEntries);

    // Generate entry via AI
    const raw = await generateWorldEntry(userInput, context);

    // Parse structured response
    const { entry: entryData, html: rawHtml, css, js } = parseWorldResponse(raw);

    // Process images
    const { html: processedHtml, imagePrompts } = parseAndInsertImages(rawHtml);

    // Render the page
    let finalHtml = processedHtml;
    if (js.trim()) {
      const resolved = resolveImagesForIframe(processedHtml, imagePrompts);
      finalHtml = resolved;
      renderStructuredPage(resolved, css, js);
    } else {
      renderStructuredPage(processedHtml, css, '');
      const limitedPrompts = imagePrompts.slice(0, state.imagesPerPage);
      if (limitedPrompts.length > 0) {
        await generateImages(limitedPrompts);
        const gen = pageContainer.querySelector('.generated-page');
        if (gen) {
          const clone = gen.cloneNode(true);
          const injectedStyle = clone.querySelector('style');
          if (injectedStyle) injectedStyle.remove();
          finalHtml = clone.innerHTML;
        }
      }
      bindEntryLinks();
    }

    // Pack content for storage
    const packed = packPageContent(finalHtml, css, js);

    // Save to Firebase
    const entryId = await saveEntry(state.currentWorldId, {
      name: entryData.name,
      type: entryData.type,
      summary: entryData.summary,
      connections: entryData.connections,
      tags: entryData.tags,
      content: packed.substring(0, CONFIG.feed.htmlMaxLength),
      createdAt: Date.now(),
      createdBy: 'user',
      imageUrl: null,
    });

    // Update local state
    state.currentEntryId = entryId;
    state.viewMode = 'immersive';
    state.worldEntries.unshift({
      id: entryId,
      name: entryData.name,
      type: entryData.type,
      summary: entryData.summary,
      tags: entryData.tags,
      connections: entryData.connections,
      imageUrl: null,
      createdAt: Date.now(),
    });

    // Add back-to-overview button
    showBackToOverview();

    // Resolve connections
    resolveConnections(state.currentWorldId, entryId, entryData.connections);

    // Display suggestions
    displaySuggestions(entryData.suggestions);

    // Refresh sidebar
    renderEntryList();

    // Update browser URL
    history.pushState(
      { worldId: state.currentWorldId, entryId },
      '',
      '/w/' + state.currentWorldId + '/' + entryId
    );

    // Capture screenshot asynchronously
    setTimeout(async () => {
      try {
        const target = pageContainer.querySelector('.generated-page');
        if (!target) return;
        await new Promise(r => setTimeout(r, CONFIG.screenshots.captureDelay));
        const canvas = await html2canvas(target, {
          backgroundColor: CONFIG.screenshots.backgroundColor,
          scale: CONFIG.screenshots.scale,
          width: Math.min(target.scrollWidth, CONFIG.screenshots.maxDimension),
          height: Math.min(target.scrollHeight, CONFIG.screenshots.maxDimension),
          logging: false,
          useCORS: true,
          allowTaint: true,
        });
        const dataUrl = canvasToCompactDataUrl(canvas, CONFIG.screenshots.maxBytes);
        if (dataUrl && dataUrl.length > 200) {
          await firebaseDb.ref('worlds/' + state.currentWorldId + '/entries/' + entryId + '/imageUrl').set(dataUrl);
          // Update local cache
          const localEntry = state.worldEntries.find(e => e.id === entryId);
          if (localEntry) localEntry.imageUrl = dataUrl;
          renderEntryList();
        }
      } catch (err) {
        console.error('Screenshot failed:', err);
      }
    }, 1000);

    // Scroll to top
    document.getElementById('contentArea').scrollTop = 0;

  } catch (err) {
    pageContainer.innerHTML = `
      <div class="page-container">
        <div class="error-banner">
          <strong>Creation failed:</strong> ${escapeHtml(err.message)}
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

async function openEntry(entryId) {
  if (!state.currentWorldId || !firebaseDb) return;
  const snap = await firebaseDb.ref('worlds/' + state.currentWorldId + '/entries/' + entryId).once('value');
  const entry = snap.val();
  if (!entry || !entry.content) return;

  state.currentEntryId = entryId;
  state.viewMode = 'immersive';

  restorePage(entry.content);
  showBackToOverview();
  bindEntryLinks();

  // Show connections in suggestions panel
  const connHtml = renderConnectionsList(entry);
  if (connHtml) {
    suggestionsList.innerHTML = `<div class="connections-section"><h4>Connections</h4>${connHtml}</div>`;
  }

  history.pushState(
    { worldId: state.currentWorldId, entryId },
    '',
    '/w/' + state.currentWorldId + '/' + entryId
  );

  document.getElementById('contentArea').scrollTop = 0;
}

function showBackToOverview() {
  // Remove existing if present
  const existing = document.querySelector('.back-to-overview');
  if (existing) existing.remove();

  const btn = document.createElement('button');
  btn.className = 'back-to-overview';
  btn.textContent = '\u2190 Back to overview';
  btn.addEventListener('click', () => {
    showWorldOverview();
    history.pushState({ worldId: state.currentWorldId }, '', '/w/' + state.currentWorldId);
  });
  document.getElementById('contentArea').prepend(btn);
}

function bindEntryLinks() {
  if (pageContainer.querySelector('iframe')) return;
  pageContainer.querySelectorAll('a[href]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      let href = link.getAttribute('href');
      // Strip entry:// prefix
      href = href.replace(/^entry:\/\//, '');
      // Try to find matching entry by name
      const match = state.worldEntries.find(
        ent => ent.name.toLowerCase() === href.toLowerCase()
      );
      if (match) {
        openEntry(match.id);
      } else {
        // Create new entry from this link text
        addressInput.value = href;
        createEntry(href);
      }
    });
  });
}

// ── Entry list rendering (sidebar) ──
function renderEntryList(filter, search) {
  filter = filter || document.querySelector('.filter-btn.active')?.dataset?.type || 'all';
  search = search || entrySearch.value || '';

  let entries = state.worldEntries;
  if (filter !== 'all') entries = entries.filter(e => e.type === filter);
  if (search) {
    const q = search.toLowerCase();
    entries = entries.filter(e =>
      e.name.toLowerCase().includes(q) ||
      (e.summary || '').toLowerCase().includes(q) ||
      (e.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }

  if (entries.length === 0) {
    entryList.innerHTML = '<div class="entry-list-empty">No entries yet. Create something!</div>';
    return;
  }

  entryList.innerHTML = entries.map(entry => {
    const icon = getTypeIcon(entry.type);
    return `
      <div class="entry-card" data-entry-id="${entry.id}" data-type="${entry.type}">
        ${entry.imageUrl ? `<div class="entry-card-thumb"><img src="${entry.imageUrl}" alt="" /></div>` : ''}
        <div class="entry-card-body">
          <div class="entry-card-type">${icon} ${entry.type}</div>
          <div class="entry-card-name">${escapeHtml(entry.name)}</div>
          <div class="entry-card-summary">${escapeHtml(entry.summary || '')}</div>
        </div>
      </div>`;
  }).join('');

  entryList.querySelectorAll('.entry-card').forEach(card => {
    card.addEventListener('click', () => openEntry(card.dataset.entryId));
  });
}

// ── Sidebar filter buttons ──
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderEntryList(btn.dataset.type);
  });
});

// ── Sidebar search ──
entrySearch.addEventListener('input', () => {
  renderEntryList(undefined, entrySearch.value);
});
