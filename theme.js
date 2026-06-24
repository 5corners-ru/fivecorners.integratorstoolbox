/**
 * theme.js — переключатель темы интерфейса расширения.
 *
 * Подключается ПЕРВЫМ в <head> popup.html и options.html.
 * Хранит выбор в chrome.storage.local под ключом bpUiTheme:
 *   'auto'  — следовать системной теме (по умолчанию; data-theme не ставится);
 *   'light' — принудительно светлая;
 *   'dark'  — принудительно тёмная.
 *
 * Применение: ставит/снимает атрибут data-theme на <html>; tokens.css
 * подхватывает тёмные токены по [data-theme="dark"] либо по @media (для auto).
 * Кнопки переключателя — элементы с атрибутом data-ui-theme="auto|light|dark".
 */
(function () {
  'use strict';

  var KEY = 'bpUiTheme';

  function apply(val) {
    var root = document.documentElement;
    if (val === 'light' || val === 'dark') {
      root.setAttribute('data-theme', val);
    } else {
      root.removeAttribute('data-theme'); // auto
    }
  }

  function wireButtons(current) {
    var run = function () {
      var btns = document.querySelectorAll('[data-ui-theme]');
      Array.prototype.forEach.call(btns, function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-ui-theme') === current);
        b.addEventListener('click', function () {
          var v = this.getAttribute('data-ui-theme');
          try { chrome.storage.local.set({ [KEY]: v }); } catch (e) {}
          apply(v);
          Array.prototype.forEach.call(btns, function (x) {
            x.classList.toggle('is-active', x === this);
          }, this);
        });
      });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  }

  try {
    chrome.storage.local.get([KEY], function (data) {
      var val = data[KEY] || 'auto';
      apply(val);
      wireButtons(val);
    });
  } catch (e) {
    // file:// / нет chrome API — остаёмся в auto-режиме
    wireButtons('auto');
  }
})();
