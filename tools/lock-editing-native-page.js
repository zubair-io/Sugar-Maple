// Real production WKWebView controls with synthetic DOM keyboard events.
// OS pointer/keyboard and VoiceOver acceptance require separate evidence.
window.canvasTransformAcceptance = async function () {
  let checks = 0;
  const check = (condition, message) => { if (!condition) throw Error(message); };
  const settle = () => window.sugarMaple.dispatch('layout.inspect');
  const get = () => window.sugarMaple.dispatch('document.get');
  const checkpoint = () => window.sugarMaple.dispatch('document.checkpoint');
  const equal = (a, b, message) => check(JSON.stringify(a) === JSON.stringify(b), message);
  const button = name => {
    const control = [...document.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === name || button.textContent.trim() === name);
    check(control, 'Missing button: ' + name); return control;
  };
  const select = async id => { await window.sugarMaple.dispatch('selection.set', { id }); await settle(); };
  const key = async (key, metaKey = false) => {
    const canvas = document.querySelector('.viewport canvas'); canvas.focus();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key, metaKey, bubbles: true, cancelable: true })); await settle();
  };
  const tx = async operations => {
    const d = await get();
    await window.sugarMaple.dispatch('transaction.apply', { documentId: d.documentId, expectedRevision: d.revision, requestId: crypto.randomUUID(), operations });
    await settle();
  };
  const undo = async () => {
    const d = await get(); await window.sugarMaple.dispatch('history.undo', { documentId: d.documentId, expectedRevision: d.revision }); await settle();
  };
  button('Layers').click(); await select('child');
  for (const name of ['Layer name', 'X position', 'Width', 'Fill color']) {
    check(document.querySelector(`[aria-label="${name}"]`)?.matches(':disabled'), 'Disabled locked ' + name);
  }
  check(button('Delete').matches(':disabled') && button('Duplicate').matches(':disabled'), 'Disabled locked actions');
  check(document.body.textContent.includes('Locked by Locked frame.'), 'Actionable parent lock message'); checks++;
  const before = await checkpoint();
  await key('Delete'); equal(await checkpoint(), before, 'Locked Delete is atomic'); checks++;
  await key('d', true); equal(await checkpoint(), before, 'Locked duplicate is atomic'); checks++;
  await select('free');
  document.querySelector('[data-layer-id="child"] [role="treeitem"]').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); await settle();
  const mixed = await checkpoint(); await key('Delete'); equal(await checkpoint(), mixed, 'Mixed selection delete is atomic'); checks++;
  await select('parent');
  check(button('Add rectangle').matches(':disabled') && !button('Add artboard').matches(':disabled'), 'Insertion destinations honor locks'); checks++;
  button('Developer').click(); await select('free');
  const readonly = await checkpoint(); await key('d', true); await key('v', true);
  equal(await checkpoint(), readonly, 'Developer shortcuts do not author');
  check(document.querySelector('[aria-label="Layer name"]').matches(':disabled'), 'Developer name is read-only'); checks++;
  button('Prototype').click(); await select('child');
  const prototype = await checkpoint(); await key('d', true); await key('v', true);
  equal(await checkpoint(), prototype, 'Prototype creation shortcuts do not author');
  check(document.querySelector('[aria-label="Prototype action"]').matches(':disabled'), 'Locked prototype action'); checks++;
  button('Design').click(); await settle();
  const visibility = await get(); button('Hide Protected child').click(); await settle();
  check((await get()).document.nodes.find(node => node.id === 'child').hidden, 'Explicit layer visibility');
  await undo(); equal((await get()).document, visibility.document, 'Exact visibility undo'); checks++;
  button('Unlock Locked frame').click(); await select('child');
  const unlocked = await get(), name = document.querySelector('[aria-label="Layer name"]');
  check(!name.matches(':disabled'), 'Unlock restores editing');
  name.value = 'Intentional edit'; name.dispatchEvent(new Event('input', { bubbles: true })); name.dispatchEvent(new Event('change', { bubbles: true })); await settle();
  check((await get()).revision === unlocked.revision + 1, 'Unlocked edit commits once');
  await undo(); equal((await get()).document, unlocked.document, 'Exact unlocked edit undo'); checks++;
  button('Lock Protected child').click(); await select('parent');
  const contained = await checkpoint(); button('Delete').click(); await settle();
  equal(await checkpoint(), contained, 'Locked descendant protects container deletion'); checks++;
  const agent = await get(); await tx([{ type: 'node.update', id: 'child', patch: { name: 'Explicit agent edit' } }]);
  check((await get()).revision === agent.revision + 1, 'Explicit agent lock policy remains independent');
  await undo(); equal((await get()).document, agent.document, 'Exact agent edit undo'); checks++;
  check(Array.isArray(window.canvasTransformErrors) && window.canvasTransformErrors.length === 0, 'No WK runtime errors'); checks++;
  return { passed: true, checks, scope: 'Production WK controls and synthetic DOM keyboard input; separate from OS input and VoiceOver' };
};
