/**
 * content.js — инструменты интегратора Bitrix24.
 *
 * 1. Подсветка синтаксиса выражений в дизайнере БП (кнопка по требованию).
 * 2. Поиск по тексту в стандартных select-списках (>= 5 вариантов).
 */

(function () {
  'use strict';

  var ATTR_DONE        = 'data-bp-hl';
  var ATTR_SEARCH_DONE = 'data-bp-sel';
  var ATTR_WARN        = 'data-bp-warn';
  var ATTR_ACT_SEARCH  = 'data-bp-act-search';
  var ATTR_FLD_SEARCH  = 'data-bp-fld-search';

  var pendingNode = null;

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
      if (isOpen) {
        panel.style.left   = Math.round(r.left)   + 'px';
        panel.style.top    = Math.round(r.top)    + 'px';
        panel.style.width  = Math.round(r.width)  + 'px';
        panel.style.height = Math.round(r.height) + 'px';
      }
      // Скрываем кнопку если textarea перекрыта модальным окном или оверлеем.
      // elementFromPoint не зависит от z-index CSS и возвращает реально верхний элемент.
      if (r.width > 0 && r.height > 0) {
        var cx = (r.left + r.right) / 2;
        var cy = (r.top + r.bottom) / 2;
        var topEl = document.elementFromPoint(cx, cy);
        if (topEl && topEl !== textarea && !textarea.contains(topEl)) {
          btn.style.display = 'none';
          return;
        }
      }
      btn.style.display = '';
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

    function onDialogChanged() { if (!destroyed) positionBtn(); }
    document.addEventListener('bp-dialog-changed', onDialogChanged);

    function destroy() {
      destroyed = true;
      visObserver.disconnect();
      document.removeEventListener('bp-dialog-changed', onDialogChanged);
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

    // Listbox (size > 1) — field picker внутри overflow:hidden попапа.
    // Используем overlay (position:fixed на body), чтобы input не обрезался.
    // Dropdown (size <= 1) — обычный дропдаун; вставляем input в DOM-поток.
    var useOverlay = sel.size > 1;
    var destroyed  = false;
    var visObs     = null;
    var widthObs   = null;

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'bp-sel-search';
    input.placeholder = 'Поиск в списке…';

    var dropdown = document.createElement('div');
    dropdown.className = 'bp-sel-dropdown';
    document.body.appendChild(dropdown);

    var activeIdx = -1;

    function getItems() { return dropdown.querySelectorAll('.bp-sel-item'); }

    function setActive(idx) {
      var items = getItems();
      if (activeIdx >= 0 && items[activeIdx]) items[activeIdx].className = 'bp-sel-item';
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

    function closeDropdown() { dropdown.style.display = 'none'; activeIdx = -1; }

    function buildDropdown(query) {
      dropdown.innerHTML = '';
      activeIdx = -1;
      if (!query) { closeDropdown(); return; }
      var q = query.toLowerCase();
      var matches = [];
      for (var i = 0; i < sel.options.length; i++) {
        var opt = sel.options[i];
        if (opt.text.toLowerCase().indexOf(q) !== -1) matches.push({ text: opt.text, value: opt.value });
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

    input.addEventListener('input', function () { buildDropdown(input.value.trim()); });
    input.addEventListener('keydown', function (e) {
      var items = getItems();
      var key = e.key || ''; var kc = e.keyCode;
      if      (key === 'ArrowDown' || kc === 40) { e.preventDefault(); setActive(Math.min(activeIdx + 1, items.length - 1)); }
      else if (key === 'ArrowUp'   || kc === 38) { e.preventDefault(); setActive(Math.max(activeIdx - 1, 0)); }
      else if (key === 'Enter'     || kc === 13) { e.preventDefault(); if (activeIdx >= 0 && items[activeIdx]) selectValue(items[activeIdx].getAttribute('data-val'), items[activeIdx].textContent); }
      else if (key === 'Escape'    || kc === 27) { closeDropdown(); }
    });
    input.addEventListener('blur',  function () { setTimeout(closeDropdown, 150); });
    input.addEventListener('focus', function () { if (input.value.trim()) buildDropdown(input.value.trim()); });

    var positionInput = function () {};  // no-op; переопределяется для overlay

    function onScrollResize() {
      positionInput();
      if (dropdown.style.display !== 'none') positionDropdown();
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (visObs)   visObs.disconnect();
      if (widthObs) widthObs.disconnect();
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
      if (input.parentNode)    input.parentNode.removeChild(input);
      if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
    }

    if (useOverlay) {
      // Overlay-режим: input крепится к body, position:fixed
      input.style.cssText = 'position:fixed;z-index:2147483641;display:none;box-shadow:0 2px 6px rgba(0,0,0,.15);';
      document.body.appendChild(input);

      positionInput = function () {
        if (destroyed) return;
        if (!document.contains(sel)) { destroy(); return; }
        var r = sel.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) { input.style.display = 'none'; return; }
        input.style.display = '';
        var inputH = input.offsetHeight || 28;
        input.style.left  = Math.round(r.left)  + 'px';
        input.style.width = Math.round(r.width) + 'px';
        var topAbove = r.top - inputH - 2;
        input.style.top = Math.round(topAbove < 0 ? r.top : topAbove) + 'px';
      };

      visObs = new IntersectionObserver(function (entries) {
        if (destroyed) return;
        if (!entries[0].isIntersecting) { input.style.display = 'none'; closeDropdown(); }
        else { positionInput(); }
      }, { threshold: 0 });
      visObs.observe(sel);

      positionInput();
      setTimeout(function () { try { input.focus(); } catch(e) {} }, 100);

    } else {
      // DOM-режим: input вставляется перед select в поток
      sel.parentNode.insertBefore(input, sel);
      var syncWidth = function () { var w = sel.offsetWidth; if (w > 0) input.style.width = w + 'px'; };
      syncWidth();
      widthObs = new ResizeObserver(syncWidth);
      widthObs.observe(sel);
    }

    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
  }

  function scanSelects(root) {
    var r = root || document;
    if (!r.querySelectorAll) return;
    var selects = r.querySelectorAll('select');
    for (var i = 0; i < selects.length; i++) {
      var sel = selects[i];
      if (sel.getAttribute(ATTR_SEARCH_DONE)) continue;
      // offsetParent === null у select внутри position:fixed попапа — проверяем через computed style
      var cs = window.getComputedStyle(sel);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      attachSearchableSelect(sel);
    }
  }

  function looksLikeActivityDialog(el) {
    if (!el || el.nodeType !== 1) return false;
    var cls = typeof el.className === 'string' ? el.className : '';
    return /(^| )popup-window( |$)/.test(cls) ||
           /(^| )bx-core-window( |$)/.test(cls) ||
           cls.indexOf('bx-core-ade-dialog') !== -1;
  }

  // ── Проверка нод на неактуальные поля/переменные ─────────────────────────

  function markNodeWithWarning(node) {
    if (!node || node.getAttribute(ATTR_WARN)) return;
    node.setAttribute(ATTR_WARN, 'true');
    node.title = 'Используются отсутствующие или недоступные поля/переменные/константы';
  }

  function clearNodeWarning(node) {
    if (!node || !node.getAttribute(ATTR_WARN)) return;
    node.removeAttribute(ATTR_WARN);
    node.title = '';
  }

  function checkDialogForWarning() {
    if (!pendingNode) return;
    var node = pendingNode;
    setTimeout(function () {
      var warning = document.getElementById('bp_act_set_broken_link');
      var hasWarning = warning && window.getComputedStyle(warning).display !== 'none';
      if (hasWarning) {
        markNodeWithWarning(node);
      } else {
        clearNodeWarning(node);
      }
    }, 400);
  }

  // ── Автосканирование нод по данным шаблона ───────────────────────────────
  // Content script работает в изолированном мире и не видит переменных страницы
  // (arWorkflowTemplate, rootActivity и др.). Инжектируем скрипт в контекст
  // страницы — он помечает сломанные ноды атрибутом data-bp-broken-link,
  // после чего шлёт событие bp-broken-scan-done, которое ловим здесь.

  function clearAllBpWarnings() {
    var nodes = document.querySelectorAll('[' + ATTR_WARN + ']');
    for (var i = 0; i < nodes.length; i++) clearNodeWarning(nodes[i]);
  }


  // ── Фича 3: Поиск по нодам в панели активностей ─────────────────────────
  // Реальные классы правой панели (из DevTools):
  //   группа:    div.swftoolboxgroupclosed / div.swftoolboxgroupopened
  //   заголовок: div.swftoolboxgroupheader
  //   текст:     div.swftoolboxgrheadtext
  // Контейнер панели — parentElement любой группы.
  // Фильтрация: скрываем группы, в чьём textContent нет совпадения.

  var SWF_GROUP_SEL  = '.swftoolboxgroupclosed, .swftoolboxgroupopened';
  var NODE_ROW_SEL   = '.swftoolboxgrouplist tr[style*="height"]';

  function findActivityPanel() {
    var group = document.querySelector(SWF_GROUP_SEL);
    return group ? group.parentElement : null;
  }

  function attachActivityPanelSearch(panel) {
    if (!panel || panel.getAttribute(ATTR_ACT_SEARCH)) return;
    panel.setAttribute(ATTR_ACT_SEARCH, 'true');

    var wrap = document.createElement('div');
    wrap.className = 'bp-act-search-wrap';
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'bp-act-search-input';
    input.placeholder = 'Поиск по нодам…';
    wrap.appendChild(input);
    panel.insertBefore(wrap, panel.firstChild);

    function applyFilter(q) {
      q = (q || '').toLowerCase().trim();
      var groups = panel.querySelectorAll(SWF_GROUP_SEL);
      for (var g = 0; g < groups.length; g++) {
        var group = groups[g];
        var nodeRows = group.querySelectorAll(NODE_ROW_SEL);

        if (!q) {
          group.style.display = '';
          for (var i = 0; i < nodeRows.length; i++) nodeRows[i].style.display = '';
          continue;
        }

        var anyMatch = false;
        for (var i = 0; i < nodeRows.length; i++) {
          var text = (nodeRows[i].textContent || '').toLowerCase();
          var match = text.indexOf(q) !== -1;
          nodeRows[i].style.display = match ? '' : 'none';
          if (match) anyMatch = true;
        }
        group.style.display = anyMatch ? '' : 'none';
      }
    }

    input.addEventListener('input', function () { applyFilter(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) { input.value = ''; applyFilter(''); }
    });
  }

  function tryAttachActivitySearch() {
    var panel = findActivityPanel();
    if (panel) attachActivityPanelSearch(panel);
  }

  // ── Фича 4: Поиск в field picker условия «Смешанное» ─────────────────────
  // Реализовано как BX.PopupMenu: div.popup-window.ul-context-light
  // Категории (Параметры, Переменные…) — первый popup с ~5 пунктами.
  // Поля (ID элемента CRM, Название…) — вложенное подменю с >8 пунктами.
  // Вставляем поиск в подменю поверх списка полей.
  // Элементы: li.menu-popup-item > span.menu-popup-item-text

  function attachFieldMenuSearch(popup) {
    if (popup.getAttribute(ATTR_FLD_SEARCH)) return;

    // Пропускаем меню категорий: у них пункты имеют стрелку вправо (submenu).
    // Меню полей состоит из обычных кликабельных пунктов без submenu-стрелки.
    var subMenuItems = popup.querySelectorAll('.menu-popup-item-submenu');
    if (subMenuItems.length > 0) return;

    var allItems = popup.querySelectorAll('.menu-popup-item');
    if (allItems.length < 2) return;

    popup.setAttribute(ATTR_FLD_SEARCH, 'true');

    var content = popup.querySelector('.popup-window-content') || popup;

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'bp-fld-search-input';
    input.placeholder = 'Поиск по полям…';
    content.insertBefore(input, content.firstChild);

    setTimeout(function () { try { input.focus(); } catch(e){} }, 80);

    function applyFilter(q) {
      q = (q || '').toLowerCase().trim();
      var its = popup.querySelectorAll('.menu-popup-item');
      for (var i = 0; i < its.length; i++) {
        var text = (its[i].textContent || '').trim().toLowerCase();
        its[i].style.display = (!q || text.indexOf(q) !== -1) ? '' : 'none';
      }
    }

    input.addEventListener('input', function () { applyFilter(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) { input.value = ''; applyFilter(''); }
    });
    input.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  }

  function scanFieldPickerPopups(root) {
    var r = root || document;
    if (!r.querySelectorAll) return;
    var popups = r.querySelectorAll('.popup-window.ul-context-light');
    for (var i = 0; i < popups.length; i++) {
      attachFieldMenuSearch(popups[i]);
    }
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
      ['bpSyntaxCustomOrigins', 'bpSyntaxEnabled', 'bpSyntaxTheme', 'bpSyntaxColors',
       'bpToolSelectSearch', 'bpToolNodeSearch', 'bpToolBrokenLinks'],
      function (data) {
        // Пофичевые тумблеры (управляются из popup). Любой ключ === false → инструмент выключен,
        // отсутствие ключа → включён по умолчанию (совместимость со старыми установками).
        var tools = {
          syntax : data.bpSyntaxEnabled    !== false,  // подсветка синтаксиса (кнопка </>)
          select : data.bpToolSelectSearch !== false,  // поиск в select-списках и field picker
          nodes  : data.bpToolNodeSearch   !== false,  // поиск по нодам в панели активностей
          broken : data.bpToolBrokenLinks  !== false   // подсветка нод с битыми полями/переменными
        };
        if (!tools.syntax && !tools.select && !tools.nodes && !tools.broken) return;

        currentTheme = data.bpSyntaxTheme || 'light';
        customColors = (data.bpSyntaxColors && typeof data.bpSyntaxColors === 'object')
                         ? data.bpSyntaxColors : {};

        var origins = data.bpSyntaxCustomOrigins || [];
        try { window.__bpSyntaxCustomOrigins = Array.isArray(origins) ? origins : []; } catch (e) {}

        if (!isTargetPage()) return;

        // Один проход сканирования — каждая фича запускается только если включена.
        function scanAll() {
          if (tools.syntax) scanAndAttach(document);
          if (tools.select) { scanSelects(document); scanFieldPickerPopups(document); }
          if (tools.nodes)  tryAttachActivitySearch();
        }

        document.addEventListener('click', function (e) {
          if (tools.broken) {
            var btn = e.target.closest('.activityset');
            if (btn) pendingNode = btn.closest('div.activity.activity-modern');
          }

          // Клик на «выбрать» открывает popup с категориями полей —
          // сканируем select-ы через небольшую задержку.
          if (tools.select) {
            var link = e.target.closest('a, span');
            if (link && (link.textContent || '').trim() === 'выбрать') {
              [150, 400].forEach(function (ms) {
                setTimeout(function () { scanSelects(document); }, ms);
              });
            }
          }
        }, true);

        // Наведение на пункт-подменю (.menu-popup-item-submenu) раскрывает
        // вложенный popup с SELECT-ом полей — сканируем после появления.
        if (tools.select) {
          document.addEventListener('mouseover', function (e) {
            if (e.target.closest('.menu-popup-item-submenu')) {
              setTimeout(function () { scanSelects(document); }, 250);
            }
          }, true);
        }

        scanAll();
        [300, 1000, 2500].forEach(function (ms) {
          setTimeout(scanAll, ms);
        });

        if (tools.broken) {
          chrome.runtime.sendMessage({ type: 'bp-inject-scanner' });
          document.addEventListener('bp-broken-scan-done', function () {
            clearAllBpWarnings();
            var broken = document.querySelectorAll('div.activity.activity-modern[data-bp-broken-link]');
            for (var i = 0; i < broken.length; i++) markNodeWithWarning(broken[i]);
          });
        }

        if (document.body) {
          var observer = new MutationObserver(function (mutations) {
            var added = false;
            var dialogChanged = false;
            for (var i = 0; i < mutations.length; i++) {
              var addedNodes = mutations[i].addedNodes;
              for (var j = 0; j < addedNodes.length; j++) {
                var node = addedNodes[j];
                if (node.nodeType !== 1) continue;
                added = true;
                if (looksLikeActivityDialog(node)) {
                  dialogChanged = true;
                  if (tools.broken) checkDialogForWarning();
                }
              }
              var removedNodes = mutations[i].removedNodes;
              for (var k = 0; k < removedNodes.length; k++) {
                var rnode = removedNodes[k];
                if (rnode.nodeType === 1 && looksLikeActivityDialog(rnode)) dialogChanged = true;
              }
            }
            // bp-dialog-changed нужен подсветке для репозиционирования кнопки </>.
            if (dialogChanged && tools.syntax) document.dispatchEvent(new CustomEvent('bp-dialog-changed'));
            if (added) scanAll();
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
