/**
 * Страница настроек расширения «5 УГЛОВ. Подсветка синтаксиса Битрикс24».
 *
 * Настройки: глобальное вкл/выкл, тема (светлая/тёмная), цвета типов токенов,
 * список коробочных порталов (bpSyntaxCustomOrigins).
 */

(function () {
  'use strict';

  const STORAGE_KEY_ORIGINS = 'bpSyntaxCustomOrigins';
  const STORAGE_KEY_THEME = 'bpSyntaxTheme';
  const STORAGE_KEY_COLORS = 'bpSyntaxColors';

  /** Цвета по умолчанию (должны совпадать с content.js) */
  const DEFAULT_COLORS = {
    stringDouble: { label: 'Строки (двойные кавычки)', example: '"текст"' },
    stringSingle: { label: 'Строки (одинарные кавычки)', example: "'текст'" },
    brace: { label: 'Скобки шаблона {{ }} {=', example: '{{Переменная}}' },
    paren: { label: 'Круглые скобки', example: '( )' },
    bracket: { label: 'Квадратные скобки', example: '[ ]' },
    comma: { label: 'Запятая', example: ',' },
    colon: { label: 'Двоеточие', example: ':' },
    keyword: { label: 'Ключевые слова', example: 'Document, Template' },
    variable: { label: 'Переменная внутри {{ }}', example: '{{Имя}}' },
    function: { label: 'Функция (слово перед скобкой)', example: 'firstvalue(' }
  };

  /** Светлая тема: контрастные тёмные цвета. */
  const DEFAULT_HEX_LIGHT = {
    stringDouble: '#0d7d0d',
    stringSingle: '#0d7d0d',
    brace: '#af3d00',
    paren: '#0066cc',
    bracket: '#6b21a8',
    comma: '#333333',
    colon: '#333333',
    keyword: '#0066cc',
    variable: '#6b21a8',
    function: '#af3d00'
  };
  /** Тёмная тема: светлые цвета (One Dark / VS Code Dark+). */
  const DEFAULT_HEX_DARK = {
    stringDouble: '#98c379',
    stringSingle: '#98c379',
    brace: '#e5c07b',
    paren: '#61afef',
    bracket: '#c678dd',
    comma: '#abb2bf',
    colon: '#abb2bf',
    keyword: '#61afef',
    variable: '#c678dd',
    function: '#e5c07b'
  };
  function getDefaultHex(theme) {
    return (theme === 'dark') ? DEFAULT_HEX_DARK : DEFAULT_HEX_LIGHT;
  }

  const LIST_ID = 'origins-list';
  const STATUS_ID = 'status';
  const NEW_ORIGIN_ID = 'new-origin';
  const ADD_BTN_ID = 'add-btn';

  function showStatus(message, isError) {
    const el = document.getElementById(STATUS_ID);
    if (!el) return;
    el.textContent = message;
    el.className = 'status' + (isError ? ' error' : '');
  }

  function toOrigin(url) {
    if (!url || !url.trim()) return null;
    let u = url.trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    try {
      const parsed = new URL(u);
      return parsed.origin;
    } catch (e) {
      return null;
    }
  }

  /* ---------- Тумблеры инструментов ---------- */
  /* Каждый чекбокс хранит свой storage-ключ в data-tool; отсутствие ключа = включён.
     Те же ключи, что в popup.js (bpSyntaxEnabled / bpToolSelectSearch / bpToolNodeSearch / bpToolBrokenLinks). */
  const toolToggles = document.querySelectorAll('input[data-tool]');
  if (toolToggles.length) {
    const toolKeys = Array.prototype.map.call(toolToggles, function (el) { return el.getAttribute('data-tool'); });
    chrome.storage.local.get(toolKeys, function (data) {
      Array.prototype.forEach.call(toolToggles, function (el) {
        el.checked = data[el.getAttribute('data-tool')] !== false;
      });
    });
    Array.prototype.forEach.call(toolToggles, function (el) {
      el.addEventListener('change', function () {
        const on = this.checked;
        chrome.storage.local.set({ [this.getAttribute('data-tool')]: on });
        showStatus((on ? 'Инструмент включён' : 'Инструмент выключен') + '. Обновите страницу с БП.');
      });
    });
  }

  /* ---------- Тема ---------- */
  const themeRadios = document.querySelectorAll('input[name="theme"]');
  chrome.storage.local.get([STORAGE_KEY_THEME], function (data) {
    const theme = data[STORAGE_KEY_THEME] || 'light';
    themeRadios.forEach(function (r) {
      r.checked = r.value === theme;
    });
  });
  themeRadios.forEach(function (r) {
    r.addEventListener('change', function () {
      chrome.storage.local.set({ [STORAGE_KEY_THEME]: this.value });
      showStatus('Тема сохранена. Обновите страницу с дизайнером БП.');
    });
  });

  /* ---------- Таблица цветов ---------- */
  function loadColors(cb) {
    chrome.storage.local.get([STORAGE_KEY_COLORS], function (data) {
      const saved = data[STORAGE_KEY_COLORS] && typeof data[STORAGE_KEY_COLORS] === 'object' ? data[STORAGE_KEY_COLORS] : {};
      cb(saved);
    });
  }

  function saveColors(colors) {
    chrome.storage.local.set({ [STORAGE_KEY_COLORS]: colors });
  }

  function renderColorsTable() {
    const tbody = document.getElementById('colors-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    chrome.storage.local.get([STORAGE_KEY_THEME], function (themeData) {
      const theme = themeData[STORAGE_KEY_THEME] || 'light';
      const defaultHex = getDefaultHex(theme);
      loadColors(function (saved) {
        Object.keys(DEFAULT_COLORS).forEach(function (key) {
          const def = DEFAULT_COLORS[key];
          const hex = saved[key] != null ? saved[key] : defaultHex[key];
        const tr = document.createElement('tr');
        const tdLabel = document.createElement('td');
        tdLabel.textContent = def.label;
        const tdExample = document.createElement('td');
        tdExample.textContent = def.example;
        tdExample.style.fontFamily = 'monospace';
        tdExample.style.fontSize = '0.85em';
        const tdColor = document.createElement('td');
        tdColor.className = 'color-cell';
        const input = document.createElement('input');
        input.type = 'color';
        input.value = hex;
        input.setAttribute('data-key', key);
        input.addEventListener('input', function () {
          const k = this.getAttribute('data-key');
          loadColors(function (cur) {
            chrome.storage.local.get([STORAGE_KEY_THEME], function (themeData) {
              const theme = themeData[STORAGE_KEY_THEME] || 'light';
              const defaultHex = getDefaultHex(theme);
              const next = {};
              Object.keys(defaultHex).forEach(function (kk) {
                next[kk] = cur[kk] != null ? cur[kk] : defaultHex[kk];
              });
              next[k] = this.value;
              saveColors(next);
              showStatus('Цвет сохранён.');
            }.bind(this));
          }.bind(this));
        });
        const tdReset = document.createElement('td');
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'reset-btn';
        resetBtn.textContent = 'По умолчанию';
        resetBtn.setAttribute('data-key', key);
        resetBtn.addEventListener('click', function () {
          const k = this.getAttribute('data-key');
          loadColors(function (cur) {
            const next = {};
            Object.keys(cur).forEach(function (kk) {
              if (kk !== k) next[kk] = cur[kk];
            });
            saveColors(next);
            renderColorsTable();
            showStatus('Цвет сброшен на значение по умолчанию для выбранной темы.');
          });
        });
        tdColor.appendChild(input);
        tdReset.appendChild(resetBtn);
        tr.appendChild(tdLabel);
        tr.appendChild(tdExample);
        tr.appendChild(tdColor);
        tr.appendChild(tdReset);
        tbody.appendChild(tr);
      });
    });
    });
  }
  renderColorsTable();
  /* При смене темы перерисовываем таблицу цветов (другие значения «по умолчанию»). */
  themeRadios.forEach(function (r) {
    r.addEventListener('change', function () {
      renderColorsTable();
    });
  });

  /* ---------- Список порталов ---------- */
  function loadAndRender() {
    chrome.storage.local.get([STORAGE_KEY_ORIGINS], function (data) {
      const list = data[STORAGE_KEY_ORIGINS] || [];
      const ul = document.getElementById(LIST_ID);
      if (!ul) return;
      ul.innerHTML = '';
      list.forEach(function (origin) {
        const li = document.createElement('li');
        const span = document.createElement('span');
        span.textContent = origin;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'remove-btn';
        btn.textContent = 'Удалить';
        btn.addEventListener('click', function () {
          removeOrigin(origin);
        });
        li.appendChild(span);
        li.appendChild(btn);
        ul.appendChild(li);
      });
    });
  }

  function removeOrigin(origin) {
    chrome.storage.local.get([STORAGE_KEY_ORIGINS], function (data) {
      const list = (data[STORAGE_KEY_ORIGINS] || []).filter(function (o) {
        return o !== origin;
      });
      chrome.storage.local.set({ [STORAGE_KEY_ORIGINS]: list }, function () {
        unregisterContentScriptsForOrigin(origin);
        loadAndRender();
        showStatus('Портал удалён из списка.');
      });
    });
  }

  function unregisterContentScriptsForOrigin(origin) {
    const match = origin + '/*';
    if (typeof chrome.scripting.getRegisteredContentScripts !== 'function') return;
    chrome.scripting.getRegisteredContentScripts().then(function (scripts) {
      const toRemove = (scripts || []).filter(function (s) {
        return s.matches && s.matches.indexOf(match) !== -1;
      });
      if (toRemove.length) {
        chrome.scripting.unregisterContentScripts({ ids: toRemove.map(function (s) { return s.id; }) });
      }
    }).catch(function () {});
  }

  function registerContentScriptForOrigin(origin) {
    const match = origin + '/*';
    return chrome.scripting.registerContentScripts([
      {
        id: 'bp-syntax-custom-' + origin.replace(/[^a-zA-Z0-9]/g, '_'),
        matches: [match],
        js: ['content.js'],
        css: ['styles.css'],
        runAt: 'document_idle',
        allFrames: true
      }
    ]);
  }

  function addOrigin() {
    const input = document.getElementById(NEW_ORIGIN_ID);
    const raw = input && input.value ? input.value.trim() : '';
    const origin = toOrigin(raw);
    if (!origin) {
      showStatus('Введите корректный URL портала (например, https://portal.company.ru).', true);
      return;
    }

    chrome.storage.local.get([STORAGE_KEY_ORIGINS], function (data) {
      const list = data[STORAGE_KEY_ORIGINS] || [];
      if (list.indexOf(origin) !== -1) {
        showStatus('Этот портал уже добавлен.', true);
        return;
      }

      const newList = list.concat(origin);
      chrome.permissions.request({ origins: [origin + '/*'] }, function (granted) {
        if (!granted) {
          showStatus('Доступ к порталу не разрешён. Подсветка на этом домене работать не будет.', true);
          return;
        }
        chrome.storage.local.set({ [STORAGE_KEY_ORIGINS]: newList }, function () {
          registerContentScriptForOrigin(origin).then(function () {
            loadAndRender();
            input.value = '';
            showStatus('Портал добавлен. Обновите вкладку с дизайнером БП на этом портале.');
          }).catch(function (err) {
            showStatus('Не удалось зарегистрировать скрипт: ' + (err && err.message ? err.message : 'ошибка'), true);
          });
        });
      });
    });
  }

  document.getElementById(ADD_BTN_ID).addEventListener('click', addOrigin);
  document.getElementById(NEW_ORIGIN_ID).addEventListener('keydown', function (e) {
    if (e.key === 'Enter') addOrigin();
  });

  loadAndRender();

  /* Портал мог добавиться из popup (через service worker) — обновляем список вживую. */
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && changes[STORAGE_KEY_ORIGINS]) loadAndRender();
  });
})();
