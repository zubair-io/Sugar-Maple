window.canvasTransformAcceptance = async function () {
  const trigger = document.querySelector('[aria-label="MCP connection details"]');
  const checkpoint = JSON.stringify(await window.sugarMaple.dispatch('document.checkpoint'));
  const original = window.setTimeout;
  const deferred = [];
  window.setTimeout = function (callback, delay, ...args) {
    if (delay === 0) deferred.push(String(callback));
    return original(callback, delay === 0 ? 500 : delay, ...args);
  };
  try {
    trigger.focus(); trigger.click();
    await window.sugarMaple.dispatch('layout.inspect');
    if (!document.querySelector('.connection-details')) throw Error('Real MCP popover did not open');
    document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
    await window.sugarMaple.dispatch('layout.inspect');
    const popup = !!document.querySelector('.connection-details');
    const focused = document.activeElement === trigger;
    if (popup || !focused) throw Error('Escape before outside-click arming: ' + JSON.stringify({popup,focused,active:document.activeElement?.outerHTML?.slice(0,300),deferred}));
    if (JSON.stringify(await window.sugarMaple.dispatch('document.checkpoint')) !== checkpoint) throw Error('Escape changed document');
    return {passed:true,checks:1,scope:'Controlled delayed timer against production MCP popover; immediate Escape dismisses and restores trigger without document changes'};
  } finally { window.setTimeout = original; }
};
