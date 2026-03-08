// ── Firebase & World Persistence ──

function initFirebase() {
  try {
    if (typeof firebase === 'undefined' || typeof firebase.auth === 'undefined') {
      setTimeout(initFirebase, CONFIG.firebaseRetryDelay);
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

        // Check for URL-based navigation first
        if (!handleInitialUrl()) {
          // Check for saved world in localStorage
          if (state.currentWorldId) {
            try {
              await switchWorld(state.currentWorldId);
            } catch {
              showWelcomeScreen();
            }
          } else {
            showWelcomeScreen();
          }
        }
      } else {
        firebaseAuth.signInAnonymously().catch((err) => {
          console.error('Anonymous auth failed:', err);
          state.firebaseReady = false;
          showWelcomeScreen();
        });
      }
    });
  } catch (err) {
    console.error('Firebase init failed:', err);
    state.firebaseReady = false;
    showWelcomeScreen();
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
