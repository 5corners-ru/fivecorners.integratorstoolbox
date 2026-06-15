/**
 * content.js — инструменты интегратора Bitrix24.
 *
 * 1. Подсветка синтаксиса выражений в дизайнере БП (кнопка по требованию).
 * 2. Поиск по тексту в стандартных select-списках (>= 5 вариантов).
 * 3. Красный значок на ноде БП, если внутри её настроек Битрикс сообщает
 *    об отсутствующих / недоступных полях, переменных или константах.
 */

(function () {
  'use strict';

  var ATTR_DONE        = 'data-bp-hl';
  var ATTR_SEARCH_DONE = 'data-bp-sel';
  var ATTR_NODE_ERROR  = 'data-bp-err';

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

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bp-hl-btn';
    btn.textContent = '</>';
    btn.title = 'Подсветка синтаксиса';
    document.body.appendChild(btn);

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

  // ── Фича 2: Поиск в select-списках ───────────────────────────────────────

  var BP_SEL_MIN = 5;

  function attachSearchableSelect(sel) {
    if (sel.getAttribute(ATTR_SEARCH_DONE)) return;
    if (sel.options.length < BP_SEL_MIN) return;
    sel.setAttribute(ATTR_SEARCH_DONE, 'true');

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'bp-sel-search';
    input.placeholder = 'Поиск в списке…';
    sel.parentNode.insertBefore(input, sel);

    function syncInputWidth() {
      var w = sel.offsetWidth;
      if (w > 0) input.style.width = w + 'px';
    }
    syncInputWidth();
    var widthObs = new ResizeObserver(syncInputWidth);
    widthObs.observe(sel);

    var dropdown = document.createElement('div');
    dropdown.className = 'bp-sel-dropdown';
    document.body.appendChild(dropdown);

    var activeIdx = -1;

    function getItems() {
      return dropdown.querySelectorAll('.bp-sel-item');
    }

    function setActive(idx) {
      var items = getItems();
      if (activeIdx >= 0 && items[activeIdx]) {
        items[activeIdx].className = 'bp-sel-item';
      }
      activeIdx = idx;
      if (activeIdx >= 0 && items[activeIdx]) {
        items[activeIdx].className = 'bp-sel-item bp-sel-active';
        items[activeIdx].scrollIntoView({ block: 'nearest' });
      }
    }

    function positionDropdown() {
      var r = input.getBoundingClientRect();
      dropdown.style.left  = Math.round(r.left)       + 'px';
      dropdown.style.top   = Math.round(r.bottom + 2) + 'px';
      dropdown.style.width = Math.max(Math.round(r.width), 200) + 'px';
    }

    function selectValue(value, text) {
      sel.value = value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      input.value = text;
      dropdown.style.display = 'none';
      activeIdx = -1;
    }

    function closeDropdown() {
      dropdown.style.display = 'none';
      activeIdx = -1;
    }

    function buildDropdown(query) {
      dropdown.innerHTML = '';
      activeIdx = -1;
      if (!query) { closeDropdown(); return; }

      var q = query.toLowerCase();
      var matches = [];
      for (var i = 0; i < sel.options.length; i++) {
        var opt = sel.options[i];
        if (opt.text.toLowerCase().indexOf(q) !== -1) {
          matches.push({ text: opt.text, value: opt.value });
        }
      }

      if (!matches.length) {
        var nores = document.createElement('div');
        nores.className = 'bp-sel-nores';
        nores.textContent = 'Не найдено';
        dropdown.appendChild(nores);
      } else {
        matches.forEach(function (m) {
          var item = document.createElement('div');
          item.className = 'bp-sel-item';
          item.textContent = m.text;
          item.setAttribute('data-val', m.value);
          item.addEventListener('mousedown', function (e) {
            e.preventDefault();
            selectValue(m.value, m.text);
          });
          dropdown.appendChild(item);
        });
      }

      positionDropdown();
      dropdown.style.display = 'block';
    }

    input.addEventListener('input', function () {
      buildDropdown(input.value.trim());
    });

    input.addEventListener('keydown', function (e) {
      var items = getItems();
      var key = e.key || '';
      var kc  = e.keyCode;
      if (key === 'ArrowDown' || kc === 40) {
        e.preventDefault();
        setActive(Math.min(activeIdx + 1, items.length - 1));
      } else if (key === 'ArrowUp' || kc === 38) {
        e.preventDefault();
        setActive(Math.max(activeIdx - 1, 0));
      } else if (key === 'Enter' || kc === 13) {
        e.preventDefault();
        if (activeIdx >= 0 && items[activeIdx]) {
          selectValue(
            items[activeIdx].getAttribute('data-val'),
            items[activeIdx].textContent
          );
        }
      } else if (key === 'Escape' || kc === 27) {
        closeDropdown();
      }
    });

    input.addEventListener('blur', function () {
      setTimeout(closeDropdown, 150);
    });

    input.addEventListener('focus', function () {
      if (input.value.trim()) buildDropdown(input.value.trim());
    });

    window.addEventListener('scroll', function () {
      if (dropdown.style.display !== 'none') positionDropdown();
    }, true);
    window.addEventListener('resize', function () {
      if (dropdown.style.display !== 'none') positionDropdown();
    });
  }

  function scanSelects(root) {
    var r = root || document;
    if (!r.querySelectorAll) return;
    var selects = r.querySelectorAll('select');
    for (var i = 0; i < selects.length; i++) {
      var sel = selects[i];
      if (sel.getAttribute(ATTR_SEARCH_DONE)) continue;
      if (sel.offsetParent === null) continue;
      attachSearchableSelect(sel);
    }
  }

  // ── Фича 1: Красный значок на ноде БП при ошибке ─────────────────────────

  var lastMouseTarget = null;
  var lastMouseTime   = 0;

  var BP_ERR_MARKERS = ['отсутствующ', 'недоступн'];

  function hasErrorText(el) {
    var text = (el && el.textContent) ? el.textContent : '';
    for (var i = 0; i < BP_ERR_MARKERS.length; i++) {
      if (text.indexOf(BP_ERR_MARKERS[i]) !== -1) return true;
    }
    return false;
  }

  function looksLikeActivityDialog(el) {
    if (!el || el.nodeType !== 1) return false;
    var cls = typeof el.className === 'string' ? el.className : '';
    return /(^| )popup-window( |$)/.test(cls) ||
           /(^| )bx-core-window( |$)/.test(cls);
  }

  function findActivityNode(el) {
    if (!el) return null;
    var cur = el;
    for (var depth = 0; depth < 25 && cur && cur !== document.body; depth++, cur = cur.parentElement) {
      if (cur.nodeType !== 1) continue;
      var cls = typeof cur.className === 'string' ? cur.className : '';
      if (cls.indexOf('activityhead') !== -1) {
        return cur.parentElement || cur;
      }
      if (
        /bizproc.*(activity|robot|block|element|action|item|task)/i.test(cls) ||
        /automation.*(robot|action|trigger)/i.test(cls) ||
        cls.indexOf('activity-modern') !== -1 ||
        cur.hasAttribute('data-activity-id') ||
        cur.hasAttribute('data-robot-id') ||
        cur.hasAttribute('data-cid')
      ) {
        return cur;
      }
    }
    return null;
  }

  function markNodeError(node) {
    if (!node) return;
    if (node.getAttribute(ATTR_NODE_ERROR)) return;
    node.setAttribute(ATTR_NODE_ERROR, 'true');
    if (window.getComputedStyle(node).position === 'static') {
      node.style.position = 'relative';
    }
    var badge = document.createElement('span');
    badge.className = 'bp-err-badge';
    badge.title = 'Используются отсутствующие или недоступные поля/переменные/константы';
    node.appendChild(badge);
  }

  function watchDialogForErrors(dialog) {
    var savedTarget = lastMouseTarget;
    if (hasErrorText(dialog)) {
      markNodeError(findActivityNode(savedTarget));
      return;
    }
    var obs = new MutationObserver(function () {
      if (hasErrorText(dialog)) {
        obs.disconnect();
        markNodeError(findActivityNode(savedTarget));
      }
    });
    obs.observe(dialog, { childList: true, subtree: true, characterData: true });
    setTimeout(function () { obs.disconnect(); }, 5000);
  }

  function initErrorBadgeDetector() {
    document.addEventListener('mousedown', function (e) {
      lastMouseTarget = e.target;
      lastMouseTime   = Date.now();
    }, true);
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

        initErrorBadgeDetector();

        scanAndAttach(document);
        scanSelects(document);

        [300, 1000, 2500].forEach(function (ms) {
          setTimeout(function () {
            scanAndAttach(document);
            scanSelects(document);
          }, ms);
        });

        if (document.body) {
          var observer = new MutationObserver(function (mutations) {
            var added = false;
            for (var i = 0; i < mutations.length; i++) {
              var addedNodes = mutations[i].addedNodes;
              for (var j = 0; j < addedNodes.length; j++) {
                var node = addedNodes[j];
                if (node.nodeType !== 1) continue;
                added = true;
                // Фича 1: смотрим, не открылся ли диалог активити
                if (Date.now() - lastMouseTime < 3000 && looksLikeActivityDialog(node)) {
                  if (!node.hasAttribute('data-bp-err-watched')) {
                    node.setAttribute('data-bp-err-watched', 'true');
                    watchDialogForErrors(node);
                  }
                }
              }
            }
            if (added) {
              scanAndAttach(document);
              scanSelects(document);
            }
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
