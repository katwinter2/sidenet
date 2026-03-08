// ── Image handling ──
function parseAndInsertImages(html) {
  const imagePrompts = [];
  let idx = 0;

  // Find all <img data-ai-prompt="..."> tags and replace with placeholders
  const processed = html.replace(
    /<img\s+data-ai-prompt="([^"]+)"[^>]*\/?>/gi,
    (match, prompt) => {
      const id = `ai-img-${idx}`;
      imagePrompts.push({ id, prompt });
      idx++;
      return `<div class="image-placeholder" id="${id}">Generating image: "${escapeHtml(prompt.substring(0, 80))}..."</div>`;
    }
  );

  return { html: processed, imagePrompts };
}

async function generateImages(prompts) {
  const promises = prompts.map(async ({ id, prompt }) => {
    try {
      const encodedPrompt = encodeURIComponent(prompt);
      const params = new URLSearchParams({
        model: CONFIG.images.model,
        width: String(CONFIG.images.width),
        height: String(CONFIG.images.height),
        nologo: String(CONFIG.images.nologo),
      });
      if (state.apiKey) params.set('key', state.apiKey);

      const url = `${CONFIG.api.imageGeneration}/${encodedPrompt}?${params}`;

      // Create image element and wait for load
      const placeholder = document.getElementById(id);
      if (!placeholder) return;

      const img = document.createElement('img');
      img.className = 'page-image';
      img.alt = prompt;
      img.src = url;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => {
          // Fallback: try gen.pollinations.ai endpoint
          const fallbackUrl = `${CONFIG.api.imageFallback}/${encodedPrompt}?${params}`;
          img.onerror = reject;
          img.src = fallbackUrl;
        };
        // timeout after 60s
        setTimeout(resolve, CONFIG.images.loadTimeout);
      });

      placeholder.replaceWith(img);
    } catch {
      const placeholder = document.getElementById(id);
      if (placeholder) {
        placeholder.textContent = '[Image failed to load]';
        placeholder.style.animation = 'none';
        placeholder.style.opacity = '0.4';
      }
    }
  });

  await Promise.allSettled(promises);
}

function resolveImagesForIframe(html, imagePrompts) {
  const limited = imagePrompts.slice(0, state.imagesPerPage);
  let result = html;
  for (const { id, prompt } of limited) {
    const enc = encodeURIComponent(prompt);
    const params = new URLSearchParams({ model: CONFIG.images.model, width: String(CONFIG.images.width), height: String(CONFIG.images.height), nologo: String(CONFIG.images.nologo) });
    if (state.apiKey) params.set('key', state.apiKey);
    const url = `${CONFIG.api.imageGeneration}/${enc}?${params}`;
    result = result.replace(
      new RegExp(`<div class="image-placeholder" id="${id}">[^<]*</div>`),
      `<img class="page-image" alt="${escapeHtml(prompt)}" src="${url}" />`
    );
  }
  return result;
}

// ── Link binding (delegates to entries.js) ──
function bindPageLinks() {
  if (typeof bindEntryLinks === 'function') {
    bindEntryLinks();
  }
}
