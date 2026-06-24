/**
 * Popup расширения «Bitrix24 БП: подсветка синтаксиса».
 *
 * Показывается по клику на иконку (справа от адресной строки).
 * Список коробочных порталов: просмотр, редактирование, удаление.
 * Кнопка «Добавить текущий сайт» — добавляет origin активной вкладки.
 *
 * Использует тот же chrome.storage.local (bpSyntaxCustomOrigins) и те же
 * registerContentScripts / unregisterContentScripts, что и options.js.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'bpSyntaxCustomOrigins';
  const LIST_ID = 'origins-list';
  const STATUS_ID = 'status';
  const ADD_CURRENT_BTN_ID = 'add-current-btn';
  const OPEN_OPTIONS_ID = 'open-options';

  /** Origin активной вкладки на момент открытия popup (для подсказки «уже добавлен»). */
  let currentOriginCache = null;

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
      return new URL(u).origin;
    } catch (e) {
      return null;
    }
  }

  function unregisterContentScriptsForOrigin(origin) {
    var match = origin + '/*';
    try {
      var p = chrome.scripting.getRegisteredContentScripts();
      if (!p || typeof p.then !== 'function') return;
      p.then(function (scripts) {
        var toRemove = (scripts || []).filter(function (s) {
          return s.matches && s.matches.indexOf(match) !== -1;
        });
        if (toRemove.length && chrome.scripting.unregisterContentScripts) {
          chrome.scripting.unregisterContentScripts({ ids: toRemove.map(function (s) { return s.id; }) });
        }
      }).catch(function () {});
    } catch (e) {}
  }

  function registerContentScriptForOrigin(origin) {
    const match = origin + '/*';
    const id = 'bp-syntax-custom-' + origin.replace(/[^a-zA-Z0-9]/g, '_');
    return chrome.scripting.registerContentScripts([
      {
        id: id,
        matches: [match],
        js: ['content.js'],
        css: ['styles.css'],
        runAt: 'document_idle',
        allFrames: true
      }
    ]).catch(function (err) {
      /* Игнорируем «уже зарегистрирован» — это нормально при повторном добавлении. */
      if (err && err.message && err.message.toLowerCase().indexOf('already registered') !== -1) return;
      throw err;
    });
  }

  function removeOrigin(origin) {
    chrome.storage.local.get([STORAGE_KEY], function (data) {
      const list = data[STORAGE_KEY] || [];
      const newList = list.filter(function (o) { return o !== origin; });
      if (newList.length === list.length) {
        showStatus('Портал не найден в списке.', true);
        return;
      }
      chrome.storage.local.set({ [STORAGE_KEY]: newList }, function () {
        unregisterContentScriptsForOrigin(origin);
        renderList(newList);
        updateCurrentSiteHint(newList, currentOriginCache);
        showStatus('Портал удалён.');
      });
    });
  }

  function saveList(list) {
    chrome.storage.local.set({ [STORAGE_KEY]: list }, function () {
      renderList(list);
      updateCurrentSiteHint(list, currentOriginCache);
    });
  }

  /**
   * Редактирование: заменить старый origin на новый в списке, перерегистрировать скрипт.
   */
  function saveEdit(oldOrigin, newOrigin, list) {
    if (!newOrigin || newOrigin === oldOrigin) {
      renderList(list);
      return;
    }
    const idx = list.indexOf(oldOrigin);
    if (idx === -1) {
      renderList(list);
      return;
    }
    const newList = list.slice();
    newList[idx] = newOrigin;
    unregisterContentScriptsForOrigin(oldOrigin);
    chrome.permissions.request({ origins: [newOrigin + '/*'] }, function (granted) {
      if (!granted) {
        showStatus('Доступ к новому порталу не разрешён.', true);
        renderList(list);
        return;
      }
      registerContentScriptForOrigin(newOrigin).then(function () {
        saveList(newList);
        showStatus('Портал изменён. Обновите вкладку при необходимости.');
      }).catch(function () {
        showStatus('Не удалось зарегистрировать скрипт.', true);
        renderList(list);
      });
    });
  }

  function renderList(list) {
    const ul = document.getElementById(LIST_ID);
    if (!ul) return;
    ul.innerHTML = '';

    if (list.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty-list';
      li.textContent = 'Нет добавленных порталов. Нажмите «Добавить текущий портал» или откройте полные настройки.';
      ul.appendChild(li);
      return;
    }

    list.forEach(function (origin) {
      const li = document.createElement('li');
      const textSpan = document.createElement('span');
      textSpan.className = 'origin-text';
      textSpan.textContent = origin;

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-small';
      editBtn.textContent = 'Изменить';
      editBtn.addEventListener('click', function () {
        enterEditMode(li, origin, list);
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-small btn-remove js-remove-origin';
      removeBtn.textContent = 'Удалить';
      removeBtn.setAttribute('data-origin', origin);

      li.appendChild(textSpan);
      li.appendChild(editBtn);
      li.appendChild(removeBtn);
      ul.appendChild(li);
    });
  }

  function enterEditMode(li, origin, list) {
    li.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'origin-edit-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = origin;
    input.placeholder = 'https://portal.example.ru';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn-small';
    saveBtn.textContent = 'Сохранить';
    saveBtn.addEventListener('click', function () {
      const newOrigin = toOrigin(input.value);
      saveEdit(origin, newOrigin, list);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-small';
    cancelBtn.textContent = 'Отмена';
    cancelBtn.addEventListener('click', function () {
      renderList(list);
    });

    wrap.appendChild(input);
    wrap.appendChild(saveBtn);
    wrap.appendChild(cancelBtn);
    li.appendChild(wrap);
    input.focus();
  }

  /**
   * Немедленно вливает скрипт и стили в открытую вкладку.
   * Не требует перезагрузки страницы.
   */
  function injectIntoTab(tabId) {
    chrome.scripting.insertCSS({ target: { tabId: tabId }, files: ['styles.css'] }).catch(function () {});
    chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['content.js'] }).catch(function () {});
  }

  function addCurrentSite() {
    const btn = document.getElementById(ADD_CURRENT_BTN_ID);
    if (btn) btn.disabled = true;
    showStatus('Получаю адрес вкладки…');

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs.length || !tabs[0].url) {
        showStatus('Не удалось получить адрес вкладки.', true);
        if (btn) btn.disabled = false;
        return;
      }
      const tab = tabs[0];
      const origin = toOrigin(tab.url);
      if (!origin) {
        showStatus('Некорректный URL вкладки.', true);
        if (btn) btn.disabled = false;
        return;
      }

      chrome.storage.local.get([STORAGE_KEY], function (data) {
        const list = data[STORAGE_KEY] || [];
        if (list.indexOf(origin) !== -1) {
          showStatus('Этот портал уже в списке.');
          if (btn) btn.disabled = false;
          renderList(list);
          return;
        }

        chrome.permissions.request({ origins: [origin + '/*'] }, function (granted) {
          if (!granted) {
            showStatus('Доступ к порталу не разрешён. Подсветка не будет работать.', true);
            if (btn) btn.disabled = false;
            return;
          }
          const newList = list.concat(origin);
          chrome.storage.local.set({ [STORAGE_KEY]: newList }, function () {
            /* Немедленно активируем подсветку в текущей вкладке — без перезагрузки. */
            injectIntoTab(tab.id);
            /* Регистрируем для будущих загрузок страниц. */
            registerContentScriptForOrigin(origin).catch(function () {});
            showStatus('Портал добавлен. Подсветка активирована.');
            renderList(newList);
            updateCurrentSiteHint(newList, origin);
            if (btn) btn.disabled = false;
          });
        });
      });
    });
  }

  /**
   * Показывает подсказку «Текущий сайт уже добавлен» и отключает кнопку, если origin текущей вкладки есть в списке.
   * @param {string[]} list — список добавленных origins
   * @param {string|null} currentOrigin — origin активной вкладки
   */
  function updateCurrentSiteHint(list, currentOrigin) {
    const hintEl = document.getElementById('current-site-hint');
    const btn = document.getElementById(ADD_CURRENT_BTN_ID);
    if (!hintEl || !btn) return;
    const alreadyAdded = currentOrigin && list.indexOf(currentOrigin) !== -1;
    if (alreadyAdded) {
      hintEl.textContent = '🎉 Текущий портал добавлен в расширение!';
      hintEl.removeAttribute('hidden');
      btn.style.display = 'none';
    } else {
      hintEl.setAttribute('hidden', '');
      hintEl.textContent = '';
      btn.style.display = '';
      btn.disabled = false;
    }
  }

  document.getElementById(ADD_CURRENT_BTN_ID).addEventListener('click', addCurrentSite);

  document.getElementById(OPEN_OPTIONS_ID).addEventListener('click', function (e) {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  /* Делегирование: клик по «Удалить» — читаем data-origin, список подтягиваем из storage. */
  document.getElementById(LIST_ID).addEventListener('click', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('js-remove-origin')) {
      e.preventDefault();
      var origin = e.target.getAttribute('data-origin');
      if (origin) removeOrigin(origin);
    }
  });

  /* Тумблеры инструментов. Каждый чекбокс хранит свой ключ в data-tool;
     отсутствие ключа в storage = инструмент включён (default). */
  var toolToggles = document.querySelectorAll('input[data-tool]');
  if (toolToggles.length) {
    var toolKeys = Array.prototype.map.call(toolToggles, function (el) { return el.getAttribute('data-tool'); });
    chrome.storage.local.get(toolKeys, function (data) {
      Array.prototype.forEach.call(toolToggles, function (el) {
        el.checked = data[el.getAttribute('data-tool')] !== false;
      });
    });
    Array.prototype.forEach.call(toolToggles, function (el) {
      el.addEventListener('change', function () {
        var key = this.getAttribute('data-tool');
        var on = this.checked;
        chrome.storage.local.set({ [key]: on });
        showStatus((on ? 'Инструмент включён' : 'Инструмент выключен') + '. Обновите страницу с БП.');
      });
    });
  }

  /* При открытии popup получаем список и текущую вкладку */
  chrome.storage.local.get([STORAGE_KEY], function (data) {
    const list = data[STORAGE_KEY] || [];
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      currentOriginCache = (tabs.length && tabs[0].url) ? toOrigin(tabs[0].url) : null;
      renderList(list);
      updateCurrentSiteHint(list, currentOriginCache);
    });
  });

  /* Список порталов может дописать service worker (после выдачи разрешения,
     когда popup уже закрывался) — перерисовываем вживую, если popup ещё открыт. */
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    const list = changes[STORAGE_KEY].newValue || [];
    renderList(list);
    updateCurrentSiteHint(list, currentOriginCache);
  });
})();
