/**
 * background.js — service worker расширения «Bitrix24 БП: подсветка синтаксиса».
 *
 * При каждом старте/перезагрузке расширения восстанавливает регистрацию
 * content scripts для коробочных порталов из chrome.storage.local.
 * Это необходимо, потому что динамически зарегистрированные скрипты
 * (registerContentScripts) сбрасываются при перезагрузке расширения.
 */

const STORAGE_KEY = 'bpSyntaxCustomOrigins';

function registerScriptForOrigin(origin) {
  const id = 'bp-syntax-custom-' + origin.replace(/[^a-zA-Z0-9]/g, '_');
  return chrome.scripting.registerContentScripts([{
    id: id,
    matches: [origin + '/*'],
    js: ['content.js'],
    css: ['styles.css'],
    runAt: 'document_idle',
    allFrames: true
  }]).catch(function (err) {
    /* Уже зарегистрирован — нормально, игнорируем. */
    if (err && err.message && err.message.toLowerCase().indexOf('already registered') !== -1) return;
    console.warn('[bp-syntax] registerContentScripts error for', origin, err);
  });
}

function reRegisterAll() {
  chrome.storage.local.get([STORAGE_KEY], function (data) {
    const origins = data[STORAGE_KEY];
    if (!Array.isArray(origins) || origins.length === 0) return;
    origins.forEach(registerScriptForOrigin);
  });
}

chrome.runtime.onInstalled.addListener(reRegisterAll);
chrome.runtime.onStartup.addListener(reRegisterAll);

/**
 * Когда пользователь жмёт «Добавить текущий портал» в popup, тот вызывает
 * chrome.permissions.request(). На время системного диалога разрешений Chrome
 * закрывает popup — и его callback (запись в storage + регистрация скрипта)
 * не успевает отработать. Поэтому финализацию делаем здесь, в service worker:
 * onAdded переживает закрытие popup.
 */
chrome.permissions.onAdded.addListener(function (perms) {
  var patterns = (perms && perms.origins) || [];
  // Пропускаем широкие/wildcard-шаблоны — нас интересуют конкретные порталы.
  var origins = patterns
    .map(function (p) { return p.replace(/\/\*$/, ''); })
    .filter(function (o) { return o && o.indexOf('*') === -1; });
  if (!origins.length) return;

  chrome.storage.local.get([STORAGE_KEY], function (data) {
    var list = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY].slice() : [];
    var added = [];
    origins.forEach(function (o) {
      if (list.indexOf(o) === -1) { list.push(o); added.push(o); }
    });
    if (!added.length) return;
    chrome.storage.local.set({ [STORAGE_KEY]: list }, function () {
      added.forEach(registerScriptForOrigin);
    });
  });
});

chrome.runtime.onMessage.addListener(function (message, sender) {
  if (message.type === 'bp-inject-scanner' && sender.tab) {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id, allFrames: false },
      world: 'MAIN',
      files: ['bp-scanner.js']
    }).catch(function (err) {
      console.warn('[bp-scanner] inject error:', err);
    });
  }
});
