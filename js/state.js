// ── Firebase config (from config.js) ──
const FIREBASE_CONFIG = CONFIG.firebase;

const DEFAULT_SYSTEM_PROMPT = CONFIG.defaultSystemPrompt;

// ── State ──
const state = {
  apiKey: localStorage.getItem('sidenet_apiKey') || '',
  imagesPerPage: parseInt(localStorage.getItem('sidenet_imagesPerPage') || String(CONFIG.images.defaultPerPage)),
  displayName: localStorage.getItem('sidenet_displayName') || '',
  temperature: parseFloat(localStorage.getItem('sidenet_temperature') || String(CONFIG.llm.defaultTemperature)),
  activePromptId: localStorage.getItem('sidenet_activePromptId') || 'default',
  systemPromptPresets: JSON.parse(localStorage.getItem('sidenet_systemPromptPresets') || 'null') || {
    default: { name: 'Default sidenet', prompt: DEFAULT_SYSTEM_PROMPT }
  },
  history: [],
  historyIndex: -1,
  isLoading: false,
  firebaseReady: false,
  firebaseUid: null,
  settingsSynced: false,
  // World state
  currentWorldId: localStorage.getItem('sidenet_currentWorldId') || null,
  currentWorldName: localStorage.getItem('sidenet_currentWorldName') || '',
  currentWorldData: null,
  currentEntryId: null,
  worldEntries: [],
  viewMode: 'overview',      // 'overview' | 'immersive'
  lastSuggestions: [],
};

// ── DOM refs ──
const $ = (sel) => document.querySelector(sel);
const addressInput = $('#addressInput');
const goBtn = $('#goBtn');
const modelSelect = $('#modelSelect');
const settingsBtn = $('#settingsBtn');
const settingsModal = $('#settingsModal');
const apiKeyInput = $('#apiKeyInput');
const imagesPerPageInput = $('#imagesPerPage');
const saveSettingsBtn = $('#saveSettings');
const cancelSettingsBtn = $('#cancelSettings');
const pageContainer = $('#pageContainer');
const connectionDot = $('#connectionDot');
const displayNameInput = $('#displayNameInput');
const temperatureSlider = $('#temperatureSlider');
const temperatureValue = $('#temperatureValue');
const promptPresetSelect = $('#promptPresetSelect');
const editPromptsBtn = $('#editPromptsBtn');
const promptEditorModal = $('#promptEditorModal');
const promptNameInput = $('#promptNameInput');
const promptTextarea = $('#promptTextarea');
const deletePromptBtn = $('#deletePromptBtn');
const resetPromptBtn = $('#resetPromptBtn');
const saveAsNewPromptBtn = $('#saveAsNewPromptBtn');
const savePromptBtn = $('#savePromptBtn');
const closePromptEditorBtn = $('#closePromptEditorBtn');
// World UI refs
const worldNameBtn = $('#worldNameBtn');
const worldSidebar = $('#worldSidebar');
const entrySearch = $('#entrySearch');
const entryList = $('#entryList');
const suggestionsPanel = $('#suggestionsPanel');
const suggestionsList = $('#suggestionsList');
const closeSuggestionsBtn = $('#closeSuggestionsBtn');

// ── Firebase globals ──
let firebaseDb = null;
let firebaseAuth = null;

// ── Utils ──
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
