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
