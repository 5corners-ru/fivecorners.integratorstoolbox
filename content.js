/**
 * content.js — подсветка синтаксиса выражений в дизайнере БП Bitrix24.
 *
 * Подход: кнопка по требованию.
 *   Textarea не трогается вообще — никакой прозрачности, никаких оберток.
 *   Рядом с textarea появляется маленькая кнопка «</>».
 *   Клик — открывается панель с подсвеченным текстом поверх textarea (position:fixed).
 *   Клик по панели или Escape — панель закрывается, фокус возвращается в textarea.
 */

(function () {
  'use strict';

  var ATTR_DONE = 'data-bp-hl';

  // ── Тема и цвета ──────────────────────────────────────────────────────────

  var currentTheme = 'light';
  var customColors  = {};

  var PALETTE = {
    light: {
      stringDouble : '#0d7d0d',
      stringSingle : '#0d7d0d',
      brace        : '#af3d00',
      paren        : '#0066cc',
      bracket      : '#6b21a8',
      comma        : '#666666',
      colon        : '#666666',
      keyword      : '#0066cc',
      variable     : '#6b21a8',
      function     : '#af3d00',
      other        : '#1a1a1a'
    },
    dark: {
      stringDouble : '#98c379',
      stringSingle : '#98c379',
      brace        : '#e5c07b',
      paren        : '#61afef',
      bracket      : '#c678dd',
      comma        : '#abb2bf',
      colon        : '#abb2bf',
      keyword      : '#61afef',
      variable     : '#c678dd',
      function     : '#e5c07b',
      other        : '#d4d4d4'
    }
  };

  function getColor(key) {
    if (customColors[key] != null) return customColors[key];
    var pal = PALETTE[currentTheme] || PALETTE.light;
    return pal[key] || '#333333';
  }

  // ── Токенайзер ────────────────────────────────────────────────────────────

  function tokenize(text) {
    var tokens = [];
    var i = 0;
    var n = text.length;

    while (i < n) {
      if (text[i] === '"') {
        var end = i + 1;
        while (end < n && text[end] !== '"') { if (text[end] === '\\') end++; end++; }
        if (end < n) end++;
        tokens.push({ type: 'stringDouble', value: text.slice(i, end) });
        i = end; continue;
      }
      if (text[i] === "'") {
        var end = i + 1;
        while (end < n && text[end] !== "'") { if (text[end] === '\\') end++; end++; }
        if (end < n) end++;
        tokens.push({ type: 'stringSingle', value: text.slice(i, end) });
        i = end; continue;
      }
      if (text[i] === '{' && text[i+1] === '{') { tokens.push({ type: 'braceDoubleOpen',  value: '{{' }); i += 2; continue; }
      if (text[i] === '}' && text[i+1] === '}') { tokens.push({ type: 'braceDoubleClose', value: '}}' }); i += 2; continue; }
      if (text[i] === '{' && text[i+1] === '=') { tokens.push({ type: 'braceExprOpen',   value: '{=' }); i += 2; continue; }
      if (text[i] === '{') { tokens.push({ type: 'brace',   value: '{' }); i++; continue; }
      if (text[i] === '}') { tokens.push({ type: 'brace',   value: '}' }); i++; continue; }
      if (text[i] === '(') { tokens.push({ type: 'paren',   value: '(' }); i++; continue; }
      if (text[i] === ')') { tokens.push({ type: 'paren',   value: ')' }); i++; continue; }
      if (text[i] === '[') { tokens.push({ type: 'bracket', value: '[' }); i++; continue; }
      if (text[i] === ']') { tokens.push({ type: 'bracket', value: ']' }); i++; continue; }
      if (text[i] === ',') { tokens.push({ type: 'comma',   value: ',' }); i++; continue; }
      if (text[i] === ':') { tokens.push({ type: 'colon',   value: ':' }); i++; continue; }

      var km = text.slice(i).match(/^\b(Document|Template)\b/);
      if (km) { tokens.push({ type: 'keyword', value: km[1] }); i += km[1].length; continue; }

      var ns = text.slice(i).search(/["'{}[\](),:]|{{|}}|{=/);
      var nk = text.slice(i).search(/\b(?:Document|Template)\b/);
      var len = ns === -1 ? n - i : ns;
      if (nk !== -1 && nk < len) len = nk;
      tokens.push({ type: 'other', value: len > 0 ? text.slice(i, i + len) : text[i] });
      i += len > 0 ? len : 1;
    }
    return tokens;
  }

  function classifyTokens(tokens) {
    var inBrace = false;
    var inExpr  = false;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.type === 'braceDoubleOpen')  { inBrace = true;  inExpr = false; continue; }
      if (t.type === 'braceDoubleClose') { inBrace = false; inExpr = false; continue; }
      if (t.type === 'other') {
        if (inBrace && !inExpr) {
          if (t.value === '=') { inExpr = true; }
          else { t.type = 'variable'; }
          continue;
        }
        var next = tokens[i + 1];
        if (next && next.type === 'paren' && next.value === '(' && /^\w+$/.test(t.value)) {
          t.type = 'function';
        }
      }
    }
    return tokens;
  }

  var TOKEN_COLOR_KEY = {
    stringDouble    : 'stringDouble',
    stringSingle    : 'stringSingle',
    braceDoubleOpen : 'brace',
    braceDoubleClose: 'brace',
    braceExprOpen   : 'brace',
    brace           : 'brace',
    paren           : 'paren',
    bracket         : 'bracket',
    comma           : 'comma',
    colon           : 'colon',
    keyword         : 'keyword',
    variable        : 'variable',
    function        : 'function',
    other           : 'other'
  };

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function highlightToHtml(text) {
    var tokens = classifyTokens(tokenize(text));
    var parts  = [];
    for (var i = 0; i < tokens.length; i++) {
      var t   = tokens[i];
      var key = TOKEN_COLOR_KEY[t.type] || 'other';
      parts.push('<span style="color:' + getColor(key) + '">' + escapeHtml(t.value) + '</span>');
    }
    return parts.join('');
  }

  // ── Кнопка и панель подсветки ─────────────────────────────────────────────

  function attachHighlightButton(textarea) {
    if (textarea.getAttribute(ATTR_DONE)) return;
    textarea.setAttribute(ATTR_DONE, 'true');

    var cs = window.getComputedStyle(textarea);

    /* Кнопка: position:fixed, висит в правом верхнем углу textarea */
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bp-hl-btn';
    btn.textContent = '</>';
    btn.title = 'Подсветка синтаксиса';
    document.body.appendChild(btn);

    /* Панель подсветки: position:fixed, появляется поверх textarea по клику */
    var panel = document.createElement('div');
    panel.className = 'bp-hl-panel';
    panel.title = 'Кликни для закрытия (или Escape)';
    document.body.appendChild(panel);

    var isOpen = false;
    var destroyed = false;
    var taVisible = true;

    function positionBtn() {
      if (destroyed) return;
      if (!document.contains(textarea)) { destroy(); return; }
      if (!taVisible) return;
      var r = textarea.getBoundingClientRect();
      btn.style.left = Math.round(r.right - 42) + 'px';
      btn.style.top  = Math.round(r.top  +  3) + 'px';
    }

    var visObserver = new IntersectionObserver(function (entries) {
      if (destroyed) return;
      taVisible = entries[0].isIntersecting;
      if (!taVisible) {
        btn.style.display = 'none';
        if (isOpen) { isOpen = false; panel.style.display = 'none'; btn.textContent = '</>'; btn.title = 'Подсветка синтаксиса'; }
      } else {
        btn.style.display = '';
        positionBtn();
      }
    }, { threshold: 0 });
    visObserver.observe(textarea);

    function openPanel() {
      isOpen = true;
      var r  = textarea.getBoundingClientRect();
      var bg = currentTheme === 'dark' ? '#1e1e1e' : '#ffffff';

      panel.style.left    = Math.round(r.left)   + 'px';
      panel.style.top     = Math.round(r.top)    + 'px';
      panel.style.width   = Math.round(r.width)  + 'px';
      panel.style.height  = Math.round(r.height) + 'px';
      panel.style.padding = cs.padding;
      panel.style.font    = cs.font;
      panel.style.border  = cs.border;
      panel.style.borderColor = '#0066cc';
      panel.style.borderRadius = cs.borderRadius;
      panel.style.boxSizing = cs.boxSizing;
      panel.style.background = bg;
      panel.style.display = 'block';

      panel.innerHTML = '<code style="display:block;font:inherit;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word;">'
        + highlightToHtml(textarea.value)
        + '</code>';

      btn.textContent = '✕';
      btn.title = 'Закрыть подсветку';
    }

    function closePanel() {
      isOpen = false;
      panel.style.display = 'none';
      btn.textContent = '</>';
      btn.title = 'Подсветка синтаксиса';
      textarea.focus();
    }

    function destroy() {
      destroyed = true;
      visObserver.disconnect();
      if (btn.parentNode)   btn.parentNode.removeChild(btn);
      if (panel.parentNode) panel.parentNode.removeChild(panel);
      window.removeEventListener('scroll', positionBtn, true);
      window.removeEventListener('resize', positionBtn);
    }

    positionBtn();
    window.addEventListener('scroll', positionBtn, true);
    window.addEventListener('resize', positionBtn);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (isOpen) closePanel(); else openPanel();
    });

    panel.addEventListener('click', function () { closePanel(); });

    document.addEventListener('keydown', function (e) {
      if (isOpen && (e.key === 'Escape' || e.keyCode === 27)) closePanel();
    });
  }

  // ── Проверка целевой страницы ─────────────────────────────────────────────

  function isTargetPage() {
    var host   = window.location.hostname.toLowerCase();
    var origin = window.location.origin;
    if (host.endsWith('.bitrix24.ru')     ||
        host.endsWith('.bitrix24.com')    ||
        host.endsWith('.bitrix24.eu')     ||
        host.endsWith('.bitrix24.kz')     ||
        host.endsWith('.bitrix24.com.tr')) return true;
    return !!(window.__bpSyntaxCustomOrigins &&
              window.__bpSyntaxCustomOrigins.indexOf(origin) !== -1);
  }

  // ── Сканирование страницы ─────────────────────────────────────────────────

  function scanAndAttach(root) {
    var r = root || document;
    if (!r.querySelectorAll) return;
    var textareas = r.querySelectorAll('textarea');
    for (var i = 0; i < textareas.length; i++) {
      var ta = textareas[i];
      if (ta.getAttribute(ATTR_DONE))                    continue;
      if (ta.offsetParent === null)                      continue;
      if (ta.id === 'bpastitle' || ta.name === 'title')  continue;
      attachHighlightButton(ta);
    }
  }

  // ── Точка входа ───────────────────────────────────────────────────────────

  function init() {
    chrome.storage.local.get(
      ['bpSyntaxCustomOrigins', 'bpSyntaxEnabled', 'bpSyntaxTheme', 'bpSyntaxColors'],
      function (data) {
        if (data.bpSyntaxEnabled === false) return;

        currentTheme = data.bpSyntaxTheme || 'light';
        customColors = (data.bpSyntaxColors && typeof data.bpSyntaxColors === 'object')
                         ? data.bpSyntaxColors : {};

        var origins = data.bpSyntaxCustomOrigins || [];
        try { window.__bpSyntaxCustomOrigins = Array.isArray(origins) ? origins : []; } catch (e) {}

        if (!isTargetPage()) return;

        scanAndAttach(document);

        [300, 1000, 2500].forEach(function (ms) {
          setTimeout(function () { scanAndAttach(document); }, ms);
        });

        if (document.body) {
          var observer = new MutationObserver(function (mutations) {
            var added = false;
            for (var i = 0; i < mutations.length; i++) {
              for (var j = 0; j < mutations[i].addedNodes.length; j++) {
                if (mutations[i].addedNodes[j].nodeType === 1) { added = true; break; }
              }
              if (added) break;
            }
            if (added) scanAndAttach(document);
          });
          observer.observe(document.body, { childList: true, subtree: true });
        }
      }
    );
  }

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    if (changes.bpSyntaxTheme)  currentTheme = changes.bpSyntaxTheme.newValue  || 'light';
    if (changes.bpSyntaxColors) customColors = changes.bpSyntaxColors.newValue || {};
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
