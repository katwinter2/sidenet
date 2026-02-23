// ── Firebase config (injected at build time) ──
const FIREBASE_CONFIG = {
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "__FIREBASE_AUTH_DOMAIN__",
  databaseURL: "__FIREBASE_DATABASE_URL__",
  projectId: "__FIREBASE_PROJECT_ID__",
  storageBucket: "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__FIREBASE_APP_ID__",
};

const DEFAULT_SYSTEM_PROMPT = `You are sidenet, an AI that generates creative, detailed pages for an alternate-reality internet browser.

FORMAT:
Always output your response in three labeled sections, each starting with a delimiter on its own line:

===HTML===
(page body content — no <html>, <head>, or <body> tags)
===CSS===
(styles for your page — use @import for Google Fonts if desired)
===JS===
(JavaScript for interactivity — optional, leave empty if not needed)

RULES:
- Use semantic HTML: h1, h2, h3, p, ul, ol, blockquote, table, pre, code, hr, etc.
- Include 1-3 images: <img data-ai-prompt="detailed description" alt="description" />
- Include 3-6 hyperlinks: <a href="sidenet://some-url-path">Link Text</a>
  - Use creative URLs like sidenet://en.wikipedia.alt/wiki/Topic
- Make content creative, detailed, internally consistent, and immersive
- Pages should feel like real websites from a parallel universe
- Content should be 300-600 words
- Use JS for interactive elements (tabs, toggles, animations, calculators, etc.)
- JS can use querySelector/getElementById to reference your HTML elements
- Do NOT output markdown code fences — just the raw sections`;

// ── State ──
const state = {
  apiKey: localStorage.getItem('sidenet_apiKey') || '',
  imagesPerPage: parseInt(localStorage.getItem('sidenet_imagesPerPage') || '2'),
  displayName: localStorage.getItem('sidenet_displayName') || '',
  temperature: parseFloat(localStorage.getItem('sidenet_temperature') || '0.85'),
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
  currentFeedKey: null,
  currentExplorationId: null,
  tonalModifier: null,
  feedClosedByUser: false,
};

// ── DOM refs ──
const $ = (sel) => document.querySelector(sel);
const addressInput = $('#addressInput');
const goBtn = $('#goBtn');
const backBtn = $('#backBtn');
const forwardBtn = $('#forwardBtn');
const homeBtn = $('#homeBtn');
const modelSelect = $('#modelSelect');
const settingsBtn = $('#settingsBtn');
const settingsModal = $('#settingsModal');
const apiKeyInput = $('#apiKeyInput');
const imagesPerPageInput = $('#imagesPerPage');
const saveSettingsBtn = $('#saveSettings');
const cancelSettingsBtn = $('#cancelSettings');
const pageContainer = $('#pageContainer');
const connectionDot = $('#connectionDot');
const historyBtn = $('#historyBtn');
const historyPanel = $('#historyPanel');
const historyBackdrop = $('#historyBackdrop');
const historyList = $('#historyList');
const clearHistoryBtn = $('#clearHistoryBtn');
const closeHistoryBtn = $('#closeHistoryBtn');
const feedBtn = $('#feedBtn');
const feedPanel = $('#feedPanel');
const feedBackdrop = $('#feedBackdrop');
const feedList = $('#feedList');
const refreshFeedBtn = $('#refreshFeedBtn');
const closeFeedBtn = $('#closeFeedBtn');
const displayNameInput = $('#displayNameInput');
const welcomeFeedList = $('#welcomeFeedList');
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

// ── Firebase globals ──
let firebaseDb = null;
let firebaseAuth = null;

// ── Utils ──
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
