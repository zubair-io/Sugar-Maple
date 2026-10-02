// Production WK controls/geometry with synthetic DOM events. A local capture
// shim permits synthetic pointer IDs; OS pointer capture is verified separately.
window.canvasTransformAcceptance = async function () {
  let checks = 0;
  const lineInputs = [];
  const check = (condition, message) => { if (!condition) throw Error(message); };
  const get = () => window.sugarMaple.dispatch('document.get');
  const checkpoint = () => window.sugarMaple.dispatch('document.checkpoint');
  const settle = () => window.sugarMaple.dispatch('layout.inspect');
  const equal = (a, b, message) => check(JSON.stringify(a) === JSON.stringify(b), message);
  const button = name => { const element = [...document.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === name || button.textContent.trim() === name);
    check(element, 'Missing button: ' + name); return element; };
  const select = async () => { await window.sugarMaple.dispatch('selection.set', { id: 'frame' }); await settle(); };
  const tx = async operations => { const d = await get(); await window.sugarMaple.dispatch('transaction.apply', {
    documentId: d.documentId, expectedRevision: d.revision, requestId: crypto.randomUUID(), operations }); await settle(); };
  const undo = async () => { const d = await get(); await window.sugarMaple.dispatch('history.undo', { documentId: d.documentId, expectedRevision: d.revision }); await settle(); };
  const canvas = document.querySelector('.viewport canvas');
  const captureMethods = ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'].map(name => [name, canvas[name]]);
  let captured = false;
  canvas.setPointerCapture = () => { captured = true; }; canvas.releasePointerCapture = () => { captured = false; }; canvas.hasPointerCapture = () => captured;
  const point = (x, y) => {
    const angle = 25 * Math.PI / 180, dx = 42 + x - 290, dy = 42 + y - 240;
    const wx = 290 + Math.cos(angle) * dx - Math.sin(angle) * dy, wy = 240 + Math.sin(angle) * dx + Math.cos(angle) * dy;
    const rect = document.querySelector('.viewport').getBoundingClientRect(), camera = window.sugarMaple.viewport.camera();
    return { clientX: rect.x + camera.pan.x + wx * camera.zoom, clientY: rect.y + camera.pan.y + wy * camera.zoom };
  };
  const pointer = (type, x, y, pressure = 0.5, integerCoordinates = false) => {
    const coordinates = point(x, y);
    if (integerCoordinates) {
      coordinates.clientX = Math.round(coordinates.clientX);
      coordinates.clientY = Math.round(coordinates.clientY);
    }
    const event = new PointerEvent(type, {
      ...coordinates, pointerId: 1, isPrimary: true, pointerType: 'pen', button: 0, buttons: type === 'pointerup' ? 0 : 1,
      pressure, bubbles: true, cancelable: true });
    // Compare against delivered coordinates, including platform input rounding.
    // This inverse is independent of the editor geometry implementation.
    const rect = document.querySelector('.viewport').getBoundingClientRect(), camera = window.sugarMaple.viewport.camera();
    const dx = (event.clientX - rect.x - camera.pan.x) / camera.zoom - 290,
      dy = (event.clientY - rect.y - camera.pan.y) / camera.zoom - 240, angle = 25 * Math.PI / 180;
    const delivered = { x: Math.cos(angle) * dx + Math.sin(angle) * dy + 290 - 42,
      y: -Math.sin(angle) * dx + Math.cos(angle) * dy + 240 - 42 };
    canvas.dispatchEvent(event); return delivered;
  };
  const key = (key, shiftKey = false) => { check(document.activeElement === canvas, 'Pointer transfers toolbar focus to Canvas'); document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })); };
  try {
    await select(); button('Fit').click(); await settle();
    const width = document.querySelector('[aria-label="Drawing stroke width"]'); width.value = '8'; width.dispatchEvent(new Event('input', { bubbles: true })); width.dispatchEvent(new Event('change', { bubbles: true }));
    // A real input can arrive before Angular publishes the derived Whiteboard
    // camera. Preserve the host camera's mapping across that handoff.
    for (const [fromZoom, toZoom] of [[0.5, 1.5], [1.5, 0.5]]) {
      const slider = document.querySelector('[aria-label="Zoom"]');
      slider.value = String(fromZoom); slider.dispatchEvent(new Event('input', { bubbles: true })); await settle();
      await select(); button('Draw line').click(); await settle(); const before = await get();
      slider.value = String(toZoom); slider.dispatchEvent(new Event('input', { bubbles: true }));
      const start = pointer('pointerdown', 120, 130, .5, true); // Deliberately no settle between input and pointer.
      await settle(); const end = pointer('pointerup', 240, 180, .5, true); await settle();
      const after = await get(), node = after.document.nodes.find(node => node.id !== 'frame');
      check(after.revision === before.revision + 1 && node?.kind === 'path', 'WK camera handoff commits one line');
      const values = node.pathData.match(/-?\d+(?:\.\d+)?/g).map(Number);
      check(Math.abs(node.x + values[0] - start.x) < .1 && Math.abs(node.y + values[1] - start.y) < .1 &&
        Math.abs(node.x + values[2] - end.x) < .1 && Math.abs(node.y + values[3] - end.y) < .1,
        'WK camera handoff geometry ' + JSON.stringify({fromZoom,toZoom,start,end,node,values}));
      lineInputs.push({ fromZoom, toZoom, handoff: true, deliveredStart: start, deliveredEnd: end,
        projectedStart: { x: node.x + values[0], y: node.y + values[1] },
        projectedEnd: { x: node.x + values[2], y: node.y + values[3] }, tolerance: .1 });
      await undo(); equal((await get()).document, before.document, 'WK handoff exact undo'); checks++;
    }
    for (const zoom of [0.5, 1.5]) {
      const slider = document.querySelector('[aria-label="Zoom"]'); slider.value = String(zoom); slider.dispatchEvent(new Event('input', { bubbles: true })); await settle();
      for (const kind of ['line', 'arrow', 'freehand']) {
        await select(); const before = await get(); button('Draw ' + kind).click(); await settle();
        const start = pointer('pointerdown', 120, 130, 0.2, kind === 'line');
        for (let i = 1; i <= 10; i++) pointer('pointermove', 120 + i * 12, 130 + i * 5, 0.2 + i * 0.06, kind === 'line');
        await settle(); equal((await get()).document, before.document, 'WK draft is not authored');
        const end = pointer('pointerup', 240, 180, 0.8, kind === 'line'); await settle();
        const after = await get(), node = after.document.nodes.find(node => node.id !== 'frame');
        check(after.revision === before.revision + 1 && node?.kind === 'path' && node.parentId === 'frame', 'WK one drawing command');
        check(node.fillEnabled === (kind === 'freehand') && node.pathData.length > 0, 'WK portable outline');
        if (kind === 'line') {
          const values = node.pathData.match(/-?\d+(?:\.\d+)?/g).map(Number);
          check(Math.abs(node.x + values[0] - start.x) < 0.1 && Math.abs(node.y + values[1] - start.y) < 0.1 &&
            Math.abs(node.x + values[2] - end.x) < 0.1 && Math.abs(node.y + values[3] - end.y) < 0.1,
            'WK rotated-parent endpoint geometry ' + JSON.stringify({ start, end, node, values, zoom }));
          lineInputs.push({ zoom, screenCoordinates: 'integer', deliveredStart: start, deliveredEnd: end,
            projectedStart: { x: node.x + values[0], y: node.y + values[1] },
            projectedEnd: { x: node.x + values[2], y: node.y + values[3] }, tolerance: 0.1 });
        }
        await undo(); equal((await get()).document, before.document, 'WK exact drawing undo'); checks++;
      }
      await select(); const polyline = await get(); button('Draw path').focus(); button('Draw path').click(); await settle();
      for (const [x, y] of [[120, 130], [240, 130], [200, 200]]) { pointer('pointerdown', x, y); pointer('pointerup', x, y); }
      key('Backspace'); await settle(); equal((await get()).document, polyline.document, 'WK point removal stays ephemeral');
      pointer('pointerdown', 200, 200); pointer('pointerup', 200, 200); key('Enter', true); await settle();
      const closed = await get(); check(closed.revision === polyline.revision + 1 && closed.document.nodes.find(node => node.id !== 'frame').pathData.endsWith(' Z'), 'WK closed polyline');
      await undo(); equal((await get()).document, polyline.document, 'WK closed-path exact undo'); checks++;
      await select(); const canceled = await checkpoint(); button('Draw arrow').click(); await settle();
      pointer('pointerdown', 120, 130); pointer('pointermove', 240, 180); pointer('pointercancel', 240, 180); pointer('pointerup', 240, 180); await settle();
      equal(await checkpoint(), canceled, 'WK canceled stroke has no history'); checks++;
      button('Draw path').click(); await settle();
      pointer('pointerdown', 120, 130); pointer('pointerup', 120, 130); pointer('pointerdown', 240, 180); pointer('pointerup', 240, 180);
      key('Escape'); await settle(); equal(await checkpoint(), canceled, 'WK Escape has no history'); checks++;
      await tx([{ type: 'node.update', id: 'frame', patch: { locked: true } }]);
      check(button('Draw line').disabled, 'WK locked destination disables drawing');
      await tx([{ type: 'node.update', id: 'frame', patch: { locked: false, layout: 'vertical' } }]);
      check(button('Draw freehand').disabled, 'WK managed destination disables drawing');
      await tx([{ type: 'node.update', id: 'frame', patch: { layout: 'free' } }]); checks++;
      button('Draw line').click(); await settle(); const stale = await get(); pointer('pointerdown', 120, 130); pointer('pointermove', 240, 180);
      let rejected = false; try { await window.sugarMaple.dispatch('render.ready', { documentId: stale.documentId, expectedRevision: stale.revision }); }
      catch (error) { rejected = String(error).includes('Finish or cancel'); }
      check(rejected, 'WK committed capture rejects pending drawing');
      await tx([{ type: 'document.rename', name: 'Concurrent drawing edit ' + zoom }]); pointer('pointerup', 240, 180); await settle();
      check((await get()).revision === stale.revision + 1 && (await get()).document.nodes.length === 1, 'WK stale stroke rejected'); checks++;
      button('Draw path').click(); await settle(); pointer('pointerdown', 120, 130); pointer('pointerup', 120, 130); await settle();
      check(document.querySelector('[aria-label="Drawing stroke width"]').disabled, 'WK stroke controls stable while pending');
      key('Escape'); await settle(); checks++;
    }
    check(Array.isArray(window.canvasTransformErrors) && window.canvasTransformErrors.length === 0, 'No WK errors');
    return { passed: true, checks, lineInputs, scope: 'Production WK controls/geometry at both zooms; synthetic DOM pointer events use a local capture shim; separate OS input evidence required' };
  } finally { for (const [name, method] of captureMethods) canvas[name] = method; }
};
