/**
 * bp-scanner.js — запускается в MAIN world через chrome.scripting.executeScript.
 * Имеет доступ к переменным страницы (arWorkflowTemplate, rootActivity и др.).
 * Помечает ноды с битыми ссылками атрибутом data-bp-broken-link,
 * затем шлёт событие bp-broken-scan-done для content.js.
 */
(function () {
  if (window.__bpScannerRunning) return;
  window.__bpScannerRunning = true;

  function doScan() {
    var tpl     = window.arWorkflowTemplate;
    var vars    = window.arWorkflowVariables       || {};
    var consts  = window.arWorkflowConstants       || {};
    var params  = window.arWorkflowParameters      || {};
    var gConsts = window.arWorkflowGlobalConstants  || {};
    var gVars   = window.arWorkflowGlobalVariables  || {};

    function checkText(text) {
      var re = /\{=(\w+):(\w+)/g, m;
      while ((m = re.exec(text)) !== null) {
        var type = m[1], id = m[2];
        if (type === 'Variable'       && window.arWorkflowVariables        && !vars[id])    return true;
        if (type === 'Constant'       && window.arWorkflowConstants        && !consts[id])  return true;
        if (type === 'Template'       && window.arWorkflowParameters       && !params[id])  return true;
        if (type === 'GlobalConstant' && window.arWorkflowGlobalConstants  && !gConsts[id]) return true;
        if (type === 'GlobalVar'      && window.arWorkflowGlobalVariables  && !gVars[id])   return true;
      }
      return false;
    }

    var prev = document.querySelectorAll('[data-bp-broken-link]');
    for (var p = 0; p < prev.length; p++) prev[p].removeAttribute('data-bp-broken-link');

    function walk(activity) {
      if (!activity) return;
      if (activity.Name && activity.Properties) {
        if (checkText(JSON.stringify(activity.Properties))) {
          var bizAct = window.rootActivity.findChildById(activity.Name);
          if (bizAct && bizAct.div) bizAct.div.setAttribute('data-bp-broken-link', 'true');
        }
      }
      var ch = activity.Children || [];
      for (var i = 0; i < ch.length; i++) walk(ch[i]);
    }

    walk(tpl);
    document.dispatchEvent(new CustomEvent('bp-broken-scan-done'));
  }

  function hookSave() {
    if (typeof window.BCPSaveTemplateComplete === 'function' && !window.__bpScannerSaveHooked) {
      window.__bpScannerSaveHooked = true;
      var orig = window.BCPSaveTemplateComplete;
      window.BCPSaveTemplateComplete = function () {
        var r = orig.apply(this, arguments);
        setTimeout(doScan, 800);
        return r;
      };
    }
  }

  var attempts = 0;
  var timer = setInterval(function () {
    attempts++;
    var tpl = window.arWorkflowTemplate;
    var ready = tpl && tpl.Children && tpl.Children.length > 0 &&
                window.rootActivity && typeof window.rootActivity.findChildById === 'function' &&
                window.arWorkflowVariables !== undefined &&
                window.arWorkflowConstants !== undefined &&
                window.arWorkflowParameters !== undefined;
    if (ready || attempts >= 40) {
      clearInterval(timer);
      if (ready) {
        doScan();
        hookSave();
      }
    }
  }, 500);
})();
