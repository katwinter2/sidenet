// ── AI Suggestions ──

function displaySuggestions(suggestions) {
  state.lastSuggestions = suggestions || [];

  if (!suggestions || suggestions.length === 0) {
    suggestionsList.innerHTML = '<div class="suggestions-empty">Create an entry to get suggestions</div>';
    return;
  }

  let html = '<p class="suggestions-intro">The world wants to grow...</p>';
  for (const suggestion of suggestions) {
    html += `
      <div class="suggestion-card">
        <div class="suggestion-text">${escapeHtml(suggestion)}</div>
        <button class="suggestion-use-btn" data-suggestion="${escapeHtml(suggestion)}">Create this</button>
      </div>`;
  }
  suggestionsList.innerHTML = html;

  suggestionsList.querySelectorAll('.suggestion-use-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      addressInput.value = btn.dataset.suggestion;
      createEntry(btn.dataset.suggestion);
    });
  });
}

closeSuggestionsBtn.addEventListener('click', () => {
  suggestionsPanel.classList.toggle('collapsed');
});
