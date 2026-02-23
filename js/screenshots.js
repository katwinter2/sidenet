// ── Screenshot capture ──

function canvasToCompactDataUrl(canvas, maxBytes) {
  // Try progressive quality reduction to fit within size limit
  for (const q of [0.7, 0.55, 0.4, 0.25]) {
    const dataUrl = canvas.toDataURL('image/jpeg', q);
    if (dataUrl.length <= maxBytes) return dataUrl;
  }
  return null;
}

async function captureAndUploadScreenshot(feedKey) {
  if (!firebaseDb || !feedKey) return null;
  try {
    const target = pageContainer.querySelector('.generated-page');
    if (!target) return null;
    await new Promise(r => setTimeout(r, 500));
    const captureWidth = Math.min(target.scrollWidth, 900);
    const captureHeight = Math.min(target.scrollHeight, 900);
    const canvas = await html2canvas(target, {
      backgroundColor: '#1a1a1a',
      scale: 0.6,
      width: captureWidth,
      height: captureHeight,
      logging: false,
      useCORS: true,
      allowTaint: true,
    });
    const dataUrl = canvasToCompactDataUrl(canvas, 120000);
    if (!dataUrl || dataUrl.length < 200) return null;
    await firebaseDb.ref('feed/' + feedKey + '/screenshotUrl').set(dataUrl);
    return dataUrl;
  } catch (err) {
    console.error('Screenshot capture failed:', err);
    return null;
  }
}

async function captureHtmlAsScreenshot(html, css, feedKey) {
  if (!firebaseDb || !feedKey) return null;
  try {
    const offscreen = document.createElement('div');
    offscreen.className = 'generated-page';
    offscreen.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:900px;overflow:hidden;';
    if (css) {
      const style = document.createElement('style');
      style.textContent = css;
      offscreen.appendChild(style);
    }
    const content = document.createElement('div');
    content.innerHTML = html;
    offscreen.appendChild(content);
    document.body.appendChild(offscreen);
    await new Promise(r => setTimeout(r, 200));
    const canvas = await html2canvas(offscreen, {
      backgroundColor: '#1a1a1a',
      scale: 0.6,
      width: 900,
      height: Math.min(offscreen.scrollHeight, 900),
      logging: false,
    });
    document.body.removeChild(offscreen);
    const dataUrl = canvasToCompactDataUrl(canvas, 120000);
    if (!dataUrl || dataUrl.length < 200) return null;
    await firebaseDb.ref('feed/' + feedKey + '/screenshotUrl').set(dataUrl);
    return dataUrl;
  } catch (err) {
    console.error('Screenshot capture (offscreen) failed:', err);
    return null;
  }
}

async function updateNodeScreenshot(feedKey, explorationId, screenshotUrl) {
  if (!firebaseDb || !explorationId || !feedKey) return;
  try {
    const nodesSnap = await firebaseDb.ref('explorations/' + explorationId + '/nodes').once('value');
    if (nodesSnap.exists()) {
      nodesSnap.forEach(child => {
        if (child.val().feedKey === feedKey) {
          firebaseDb.ref('explorations/' + explorationId + '/nodes/' + child.key + '/screenshotUrl').set(screenshotUrl);
        }
      });
    }
  } catch (err) {
    console.error('Failed to update node screenshot:', err);
  }
}
