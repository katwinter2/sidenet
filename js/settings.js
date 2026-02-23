// ── Settings ──
settingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('open');
  apiKeyInput.value = state.apiKey;
  imagesPerPageInput.value = state.imagesPerPage;
  displayNameInput.value = state.displayName;
  temperatureSlider.value = state.temperature;
  temperatureValue.textContent = state.temperature.toFixed(2);
  populatePromptPresetSelect();
  fetchBalance();
  const modDisplay = $('#tonalModifierDisplay');
  const modValue = $('#tonalModifierValue');
  if (state.tonalModifier) {
    modValue.textContent = state.tonalModifier;
    modDisplay.style.display = '';
  } else {
    modDisplay.style.display = 'none';
  }
});

cancelSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('open'));

temperatureSlider.addEventListener('input', () => {
  temperatureValue.textContent = parseFloat(temperatureSlider.value).toFixed(2);
});

settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) settingsModal.classList.remove('open');
});

saveSettingsBtn.addEventListener('click', () => {
  state.apiKey = apiKeyInput.value.trim();
  state.imagesPerPage = Math.min(3, Math.max(1, parseInt(imagesPerPageInput.value) || 2));
  state.displayName = displayNameInput.value.trim();
  state.temperature = parseFloat(temperatureSlider.value);
  state.activePromptId = promptPresetSelect.value;
  localStorage.setItem('sidenet_apiKey', state.apiKey);
  localStorage.setItem('sidenet_imagesPerPage', state.imagesPerPage);
  localStorage.setItem('sidenet_displayName', state.displayName);
  localStorage.setItem('sidenet_temperature', state.temperature);
  localStorage.setItem('sidenet_activePromptId', state.activePromptId);
  saveSettingsToFirebase();
  settingsModal.classList.remove('open');
  updateStatusBar();
});

function updateStatusBar() {
  if (!connectionDot) return;
  if (state.apiKey) {
    connectionDot.classList.add('connected');
  } else {
    connectionDot.classList.remove('connected');
  }
}

const POLLEN_PER_RESPONSE = {
  'nova-fast': 22200, 'mistral': 4300, 'gemini-fast': 3100,
  'qwen-coder': 1200, 'openai-fast': 950, 'openai': 700,
  'grok': 550, 'claude-fast': 95, 'openai-large': 90,
  'gemini': 85, 'claude': 25,
};

async function fetchBalance() {
  const el = document.getElementById('balanceDisplay');
  const amt = document.getElementById('balanceAmount');
  if (!el || !amt) return;
  if (!state.apiKey) { el.style.display = 'none'; return; }
  try {
    const resp = await fetch('https://gen.pollinations.ai/account/balance', {
      headers: { 'Authorization': `Bearer ${state.apiKey}` }
    });
    if (!resp.ok) throw new Error('Failed');
    const data = await resp.json();
    const balance = typeof data === 'number' ? data : (data.balance ?? data);
    const model = modelSelect.value;
    const rate = POLLEN_PER_RESPONSE[model];
    const estGen = rate ? `~${Math.floor(balance * rate).toLocaleString()} pages on ${modelSelect.options[modelSelect.selectedIndex].text.split(' — ')[0]}` : '';
    amt.textContent = `${Number(balance).toFixed(2)} pollen${estGen ? ' · ' + estGen : ''}`;
    el.style.display = 'block';
  } catch {
    el.style.display = 'none';
  }
}

// ── System Prompt Presets ──
function populatePromptPresetSelect() {
  promptPresetSelect.innerHTML = '';
  for (const [id, preset] of Object.entries(state.systemPromptPresets)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = preset.name;
    promptPresetSelect.appendChild(opt);
  }
  promptPresetSelect.value = state.activePromptId;
  if (!promptPresetSelect.value && promptPresetSelect.options.length > 0) {
    promptPresetSelect.value = promptPresetSelect.options[0].value;
    state.activePromptId = promptPresetSelect.value;
  }
}

function savePresetsToStorage() {
  localStorage.setItem('sidenet_systemPromptPresets', JSON.stringify(state.systemPromptPresets));
  localStorage.setItem('sidenet_activePromptId', state.activePromptId);
  saveSettingsToFirebase();
}

function getActiveSystemPrompt() {
  const preset = state.systemPromptPresets[state.activePromptId];
  return preset ? preset.prompt : DEFAULT_SYSTEM_PROMPT;
}

editPromptsBtn.addEventListener('click', () => {
  const currentId = promptPresetSelect.value || state.activePromptId;
  const preset = state.systemPromptPresets[currentId];
  promptNameInput.value = preset ? preset.name : '';
  promptTextarea.value = preset ? preset.prompt : DEFAULT_SYSTEM_PROMPT;
  deletePromptBtn.disabled = (currentId === 'default');
  promptEditorModal.classList.add('open');
});

closePromptEditorBtn.addEventListener('click', () => {
  promptEditorModal.classList.remove('open');
});

promptEditorModal.addEventListener('click', (e) => {
  if (e.target === promptEditorModal) promptEditorModal.classList.remove('open');
});

savePromptBtn.addEventListener('click', () => {
  const currentId = promptPresetSelect.value || state.activePromptId;
  state.systemPromptPresets[currentId] = {
    name: promptNameInput.value.trim() || 'Untitled',
    prompt: promptTextarea.value,
  };
  state.activePromptId = currentId;
  savePresetsToStorage();
  populatePromptPresetSelect();
  promptEditorModal.classList.remove('open');
});

saveAsNewPromptBtn.addEventListener('click', () => {
  const newId = 'custom_' + Date.now();
  state.systemPromptPresets[newId] = {
    name: promptNameInput.value.trim() || 'Untitled',
    prompt: promptTextarea.value,
  };
  state.activePromptId = newId;
  savePresetsToStorage();
  populatePromptPresetSelect();
  promptEditorModal.classList.remove('open');
});

deletePromptBtn.addEventListener('click', () => {
  const currentId = promptPresetSelect.value || state.activePromptId;
  if (currentId === 'default') return;
  if (!confirm('Delete this prompt preset?')) return;
  delete state.systemPromptPresets[currentId];
  state.activePromptId = 'default';
  savePresetsToStorage();
  populatePromptPresetSelect();
  const d = state.systemPromptPresets['default'];
  promptNameInput.value = d.name;
  promptTextarea.value = d.prompt;
  deletePromptBtn.disabled = true;
});

resetPromptBtn.addEventListener('click', () => {
  promptTextarea.value = DEFAULT_SYSTEM_PROMPT;
  promptNameInput.value = 'Default sidenet';
});
