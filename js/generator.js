// ── Text generation ──
async function generatePage(query) {
  const model = modelSelect.value;
  let systemPrompt = getActiveSystemPrompt();
  if (state.tonalModifier) {
    systemPrompt += '\n\nTone: ' + state.tonalModifier;
  }

  const userPrompt = `Generate the webpage for: ${query}

This is a page on the alternate internet. Create rich, immersive content with images and links to other pages.`;

  const response = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(state.apiKey ? { 'Authorization': `Bearer ${state.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: state.temperature,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API error ${response.status}: ${errText.substring(0, 200)}`);
  }

  const data = await response.json();
  let content = data.choices[0].message.content;
  // Strip markdown code fences if the model wrapped its output
  content = content.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  return content;
}

async function generateTonalModifier(url) {
  try {
    const response = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(state.apiKey ? { 'Authorization': `Bearer ${state.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: 'nova-fast',
        messages: [
          { role: 'system', content: 'You generate tonal modifiers for creative writing. A tonal modifier is a short phrase (3-8 words) describing a mood, disposition, or emotional texture — NOT a theme, topic, or scenario. Examples: "wistful and slightly amused", "quietly conspiratorial", "warm but formally distant", "dreamlike with sharp edges". Respond with ONLY the phrase, no quotes, no punctuation at the end, no explanation.' },
          { role: 'user', content: url },
        ],
        temperature: 1.0,
        max_tokens: 30,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    let modifier = (data.choices[0].message.content || '').trim();
    modifier = modifier.replace(/^["']|["']$/g, '').replace(/[.!]$/, '').substring(0, 80);
    return modifier || null;
  } catch {
    return null;
  }
}

// ── Structured response parsing ──
function parseStructuredResponse(raw) {
  raw = raw.replace(/^```\w*\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  const sectionRegex = /^===(\w+)===\s*$/gm;
  const matches = [];
  let m;
  while ((m = sectionRegex.exec(raw)) !== null) {
    matches.push({ name: m[1].toUpperCase(), end: m.index + m[0].length, index: m.index });
  }
  if (matches.length === 0) return { html: raw.trim(), css: '', js: '' };
  const sections = {};
  const before = raw.substring(0, matches[0].index).trim();
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].end;
    const end = i + 1 < matches.length ? matches[i + 1].index : raw.length;
    sections[matches[i].name] = raw.substring(start, end).trim();
  }
  return {
    html: [before, sections.HTML || ''].filter(Boolean).join('\n'),
    css: sections.CSS || '',
    js: sections.JS || '',
  };
}

function scopeCSS(cssText) {
  if (!cssText.trim()) return '';
  return cssText.replace(
    /(^|\})\s*([^{}@/][^{]*?)\s*\{/gm,
    (match, prefix, selectors) => {
      const scoped = selectors.split(',').map(s => {
        s = s.trim();
        if (!s || /^(from|to|\d+%)$/.test(s)) return s;
        if (s.includes('.generated-page')) return s;
        return `.generated-page ${s}`;
      }).join(', ');
      return `${prefix} ${scoped} {`;
    }
  );
}

function packPageContent(html, css, js) {
  if (!css && !js) return `<div class="generated-page">${html}</div>`;
  return JSON.stringify({ _s: 1, html, css, js });
}

function unpackPageContent(stored) {
  if (!stored) return { html: '', css: '', js: '' };
  if (stored.startsWith('{')) {
    try {
      const p = JSON.parse(stored);
      if (p._s) return { html: p.html || '', css: p.css || '', js: p.js || '' };
    } catch {}
  }
  return { html: stored, css: '', js: '' };
}

function renderStructuredPage(html, css, js) {
  let extracted = '';
  html = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, inner) => { extracted += inner + '\n'; return ''; });
  const allCSS = scopeCSS(extracted + '\n' + css);
  if (js.trim()) {
    renderInIframe(html, allCSS, js);
  } else {
    const style = allCSS ? `<style>${allCSS}</style>` : '';
    pageContainer.innerHTML = `<div class="generated-page">${style}${html}</div>`;
  }
}

function renderInIframe(html, css, js) {
  const S = '<' + 'script>';
  const SE = '</' + 'script>';
  const doc = '<!DOCTYPE html><html><head>'
    + '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'
    + '<style>'
    + ':root{--bg:#1a1a1a;--text:#e0e0e0;--accent:#e8a0bf;--border:#333;--surface:#242424;--surface2:#2a2a2a;--text-dim:#888}'
    + 'body{background:var(--bg);color:var(--text);font-family:\'Ubuntu Condensed\',\'Segoe UI\',system-ui,sans-serif;line-height:1.7;padding:24px;margin:0}'
    + 'a{color:var(--accent);text-decoration:none;cursor:pointer}'
    + 'a:hover{color:#f0b8d0;border-bottom:1px solid #f0b8d0}'
    + 'img{max-width:100%;border-radius:8px;border:1px solid var(--border)}'
    + 'blockquote{border-left:3px solid var(--accent);padding:8px 16px;margin:14px 0;background:var(--surface);border-radius:0 6px 6px 0}'
    + 'table{width:100%;border-collapse:collapse}th,td{border:1px solid var(--border);padding:8px 12px;text-align:left}th{background:var(--surface2);font-weight:600}'
    + 'code{background:var(--surface2);padding:2px 6px;border-radius:4px;font-family:\'SF Mono\',\'Fira Code\',monospace;font-size:13px}'
    + 'pre{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:16px;overflow-x:auto}pre code{background:none;padding:0}'
    + 'hr{border:none;border-top:1px solid var(--border);margin:24px 0}'
    + '</style>'
    + '<style>' + css + '</style>'
    + '</head><body>'
    + html
    + S
    + '(function(){'
    + 'new ResizeObserver(function(){window.parent.postMessage({type:"sidenet-resize",height:document.body.scrollHeight},"*");}).observe(document.body);'
    + 'document.addEventListener("click",function(e){var a=e.target.closest("a[href]");if(a){e.preventDefault();window.parent.postMessage({type:"sidenet-navigate",href:a.getAttribute("href")},"*");}});'
    + '})();'
    + 'try{' + js + '}catch(e){console.error("[sidenet page]",e);}'
    + SE
    + '</body></html>';

  const iframe = document.createElement('iframe');
  iframe.sandbox = 'allow-scripts';
  iframe.srcdoc = doc;
  iframe.style.cssText = 'width:100%;border:none;min-height:400px;display:block;';
  pageContainer.innerHTML = '';
  pageContainer.appendChild(iframe);
}

function restorePage(stored) {
  const { html, css, js } = unpackPageContent(stored);
  if (css || js) {
    renderStructuredPage(html, css, js);
    if (!js.trim()) {
      // Check for unresolved image placeholders and generate them
      const placeholders = pageContainer.querySelectorAll('.image-placeholder');
      if (placeholders.length > 0) {
        const prompts = [];
        placeholders.forEach(p => {
          const id = p.id;
          const text = p.textContent || '';
          const match = text.match(/Generating image: "(.+?)\.{3}"/);
          if (match && id) prompts.push({ id, prompt: match[1] });
        });
        if (prompts.length > 0) generateImages(prompts.slice(0, state.imagesPerPage));
      }
      bindPageLinks();
    }
  } else {
    pageContainer.innerHTML = html;
    // Check for unresolved image placeholders in legacy entries
    const placeholders = pageContainer.querySelectorAll('.image-placeholder');
    if (placeholders.length > 0) {
      const prompts = [];
      placeholders.forEach(p => {
        const id = p.id;
        const text = p.textContent || '';
        const match = text.match(/Generating image: "(.+?)\.{3}"/);
        if (match && id) prompts.push({ id, prompt: match[1] });
      });
      if (prompts.length > 0) generateImages(prompts.slice(0, state.imagesPerPage));
    }
    bindPageLinks();
  }
}
