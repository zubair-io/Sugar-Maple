// Production WK textarea lifecycle and composition events. This is synthetic
// DOM composition; it does not establish a hardware IME/candidate-window gate.
window.canvasTransformAcceptance = async function () {
  let checks = 0;
  const check = (condition, message) => { if (!condition) throw Error(message); };
  const get = () => window.sugarMaple.dispatch('document.get');
  const checkpoint = () => window.sugarMaple.dispatch('document.checkpoint');
  const settle = () => window.sugarMaple.dispatch('layout.inspect');
  const equal = (a, b, message) => check(JSON.stringify(a) === JSON.stringify(b), message);
  const field = () => document.querySelector('[aria-label="Text content"]');
  const button = name => [...document.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === name || button.textContent.trim() === name);
  const select = async id => { await window.sugarMaple.dispatch('selection.set', { id }); await settle(); };
  const input = value => { field().focus(); field().value = value; field().dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value })); };
  const fail = async (method, extra = {}) => {
    const d = await get(); try { await window.sugarMaple.dispatch(method, { documentId: d.documentId, expectedRevision: d.revision, ...extra }); return ''; }
    catch (error) { return String(error); }
  };
  const undo = async () => { const d = await get(); await window.sugarMaple.dispatch('history.undo', { documentId: d.documentId, expectedRevision: d.revision }); await settle(); };
  button('Layers').click(); await select('a'); const before = await checkpoint();
  input('Café — 日本語\nNative draft'); field().setSelectionRange(3, 3); await settle();
  equal(await checkpoint(), before, 'WK draft is not authored'); check(document.activeElement === field() && field().selectionStart === 3, 'WK caret remains focused'); checks++;
  check((await fail('render.ready')).includes('Finish or cancel') && (await fail('history.undo')).includes('Finish or cancel'), 'WK capture/history draft boundary'); checks++;
  check((await fail('transaction.apply', { requestId: crypto.randomUUID(), operations: [{ type: 'document.rename', name: 'While typing' }] })).includes('Finish or cancel'), 'WK agent guard');
  check((await fail('nodes.reparent', { ids: ['a'], parentId: null, placement: 'preserve-world' })).includes('Finish or cancel'), 'WK no-op reparent request still respects a pending draft');
  equal(await checkpoint(), before, 'WK rejected mutation leaves checkpoint'); checks++;
  await select('b'); const committed = await checkpoint();
  check(committed.journal.length === before.journal.length + 1 && committed.journal.at(-1).origin === 'human', 'WK one human text entry');
  check(committed.document.nodes.find(node => node.id === 'a').text === 'Café — 日本語\nNative draft' && committed.document.nodes.find(node => node.id === 'b').text === 'Beta', 'WK owns original text node');
  check(field().value === 'Beta' && document.activeElement !== field(), 'WK selection finishes and blurs old text');
  await undo(); equal((await get()).document, before.document, 'WK exact text undo'); checks++;
  await select('a'); const composedBefore = await checkpoint(); field().focus();
  field().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); field().value = '仮の入力'; field().setSelectionRange(2, 2);
  field().dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, inputType: 'insertCompositionText', data: field().value }));
  let selectionError = ''; try { await window.sugarMaple.dispatch('selection.set', { id: 'b' }); } catch (error) { selectionError = String(error); }
  check(selectionError.includes('Finish text composition'), 'WK in-progress composition cannot change owner');
  equal(await checkpoint(), composedBefore, 'WK composition remains ephemeral'); check(field().value === '仮の入力' && field().selectionStart === 2, 'WK composition caret intact'); checks++;
  field().blur(); button('Developer').click(); await settle();
  check(button('Design').getAttribute('aria-pressed') === 'true' && field().value === '仮の入力', 'WK deferred composition keeps mode and draft'); checks++;
  field().value = '確定した入力'; field().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: field().value }));
  field().dispatchEvent(new Event('change', { bubbles: true })); await settle();
  const composed = await checkpoint(); check(composed.journal.length === composedBefore.journal.length + 1 && composed.document.nodes.find(node => node.id === 'a').text === '確定した入力', 'WK deferred composition commits once');
  await undo(); equal((await get()).document, composedBefore.document, 'WK composition exact undo'); checks++;
  await select('a'); const canceled = await checkpoint(); input('Cancel edit');
  field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await settle();
  equal(await checkpoint(), canceled, 'WK canceled text has no history'); check(field().value === 'Alpha', 'WK canceled field restores source'); checks++;
  input('x'.repeat(20001)); field().blur(); await settle(); equal(await checkpoint(), canceled, 'WK oversized edit rejected');
  check(field().value.length === 20001, 'WK rejected draft retained'); button('Cancel text edit').click();
  check(field().value === 'Alpha', 'WK explicit cancel exits rejected draft'); checks++;
  field().focus(); field().setSelectionRange(3, 3); const clean = await get();
  await window.sugarMaple.dispatch('transaction.apply', { documentId: clean.documentId, expectedRevision: clean.revision, requestId: crypto.randomUUID(),
    operations: [{ type: 'node.update', id: 'a', patch: { text: 'Omega' } }] }); await settle();
  check(field().value === 'Omega' && field().selectionStart === 3, 'WK clean external text preserves bounded caret');
  field().blur(); await undo(); equal((await get()).document, canceled.document, 'WK clean external change has no extra human edit'); checks++;
  await select('a'); const endBeforeBlur = await checkpoint(); field().focus();
  field().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); field().value = '入力';
  field().dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
  field().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '入力' }));
  field().value = '入力完了'; field().dispatchEvent(new InputEvent('input', { bubbles: true }));
  equal(await checkpoint(), endBeforeBlur, 'WK composition end alone does not create a partial edit'); field().blur(); await settle();
  const final = await checkpoint(); check(final.journal.length === endBeforeBlur.journal.length + 1 && final.document.nodes.find(node => node.id === 'a').text === '入力完了', 'WK final input and blur commit once');
  await undo(); equal((await get()).document, endBeforeBlur.document, 'WK final composition exact undo'); checks++;
  await select('a'); const humanBefore = await checkpoint(); input('Human layer switch'); field().blur();
  document.querySelector('[data-layer-id="b"] [role="treeitem"]').click(); await settle();
  check((await get()).document.nodes.find(node => node.id === 'a').text === 'Human layer switch', 'WK human layer switch retains original edit');
  await undo(); equal((await get()).document, humanBefore.document, 'WK human switch exact undo'); checks++;
  check(window.canvasTransformErrors.length === 0, 'No WK errors');
  return { passed: true, checks, scope: 'Production WK textarea/caret, ownership, deferred synthetic composition ordering and committed history guards; hardware IME/OS input is separate' };
};
