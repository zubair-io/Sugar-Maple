(() => {
  const api = (method, args = {}) => window.sugarMaple.dispatch(method, args);
  const equal = (a, b, name) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(name); };
  const check = (value, name) => { if (!value) throw Error(name); };
  const settle = () => api('layout.inspect');
  const tick = () => new Promise(resolve => setTimeout(resolve, 20));
  async function tx(operations) {
    const d = await api('document.get');
    await api('transaction.apply', { documentId: d.documentId, expectedRevision: d.revision, requestId: crypto.randomUUID(), operations });
    await settle();
  }
  async function undo() {
    const d = await api('document.get');
    await api('history.undo', { documentId: d.documentId, expectedRevision: d.revision }); await settle();
  }
  const control = name => document.querySelector(`select[aria-label="${name}"]`);
  function choose(name, value) {
    const element = control(name); check(element && !element.disabled, `${name} enabled`);
    element.value = value; element.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const button = name => [...document.querySelectorAll('button')].find(element => element.textContent.trim() === name);
  async function preview(parent) {
    choose('Parent', parent);
    const deadline = Date.now() + 3000;
    while (!button('Apply layer move')) { if (Date.now() > deadline) throw Error('Preview timed out'); await tick(); }
  }
  function sameBounds(a, b) {
    for (const id of ['child', 'text']) {
      const aa = a.nodes.find(node => node.id === id).bounds, bb = b.nodes.find(node => node.id === id).bounds;
      for (const key of ['x', 'y', 'width', 'height']) check(Math.abs(aa[key] - bb[key]) < 1e-5, `${id} ${key}`);
    }
  }
  async function select() {
    await api('selection.set', { id: 'child' }); await settle();
    document.querySelector('[data-layer-id="text"] [role="treeitem"]').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    await settle();
  }
  window.canvasTransformAcceptance = async () => {
    const d = await api('document.get'), pageId = d.document.pages[0].id;
    await tx([
      { type: 'node.add', node: { id: 'destination', name: 'Destination', pageId, kind: 'frame', x: 20, y: 20,
        width: 700, height: 600, rotation: -15, strokeWidth: 9 } },
      { type: 'node.add', node: { id: 'text', name: 'Text', pageId, kind: 'text', parentId: 'parent',
        x: 80, y: 300, widthMode: 'hug', heightMode: 'hug', text: '世界 café', rotation: -20 } },
    ]);
    button('Layers').click(); await settle();
    let checks = 0;
    for (const zoom of [0.5, 1.5]) {
      const z = document.querySelector('input[aria-label="Zoom"]'); z.value = String(zoom);
      z.dispatchEvent(new Event('change', { bubbles: true })); await select();
      choose('Reparent placement', 'preserve-world'); await settle();
      const before = await api('document.get'), bounds = await settle(), checkpoint = await api('document.checkpoint');
      await preview('destination');
      check(document.querySelector('[aria-label="Move layer preview"]').textContent.includes('responsive sizing becomes fixed'), 'Responsive warning');
      equal(await api('document.checkpoint'), checkpoint, 'Preview unchanged');
      button('Cancel layer move').click(); await settle();
      equal(await api('document.checkpoint'), checkpoint, 'Cancel unchanged'); checks++;
      await preview('destination'); button('Apply layer move').click(); await settle();
      const changed = await api('document.get'); check(changed.revision === before.revision + 1, 'One move');
      sameBounds(bounds, await settle()); await undo(); equal((await api('document.get')).document, before.document, 'Exact world undo'); checks++;
      await tx([{ type: 'node.update', id: 'destination', patch: { layout: 'vertical' } }]);
      await select(); choose('Reparent placement', 'layout'); await settle();
      const flow = await api('document.get');
      await preview('destination'); button('Apply layer move').click(); await settle();
      check((await api('document.get')).document.nodes.find(node => node.id === 'text').widthMode === 'hug', 'Layout rules retained');
      await undo(); equal((await api('document.get')).document, flow.document, 'Exact flow undo'); await undo(); checks++;
      await select(); choose('Reparent placement', 'preserve-world'); await settle();
      await preview('destination');
      await tx([{ type: 'node.update', id: 'child', patch: { fill: '#ff0000' } }]);
      check(!button('Apply layer move'), 'Concurrent edit cancels preview');
      await undo(); checks++;
      await tx([{ type: 'node.update', id: 'parent', patch: { locked: true } }]); await select();
      check(control('Parent').disabled, 'Inherited lock disables parent control');
      check(control('Parent').value === 'parent', 'Locked parent identity retained'); await undo(); checks++;
      await tx([{ type: 'node.update', id: 'parent', patch: { hidden: true } }]);
      const hidden = await api('document.get'), saved = await api('document.checkpoint');
      let message = '';
      try { await api('nodes.reparent', { documentId: hidden.documentId, expectedRevision: hidden.revision,
        ids: ['child'], parentId: 'destination', placement: 'preserve-world' }); }
      catch (error) { message = String(error); }
      check(message.includes('Unlock and show'), 'Hidden ancestor rejected'); equal(await api('document.checkpoint'), saved, 'Rejected move atomic'); await undo(); checks++;
      equal((await api('document.get')).document, before.document, 'Fixture restored');
    }
    check(window.canvasTransformErrors.length === 0, 'No console errors');
    return { passed: true, checks, consoleErrors: window.canvasTransformErrors,
      scope: 'Production WKWebView reparent preview/cancel/apply and layout controls, world geometry, inherited guards, stale preview cancellation and exact undo at zoom 0.5/1.5. Inputs are synthetic DOM, not native OS pointer/VoiceOver acceptance.' };
  };
})();
