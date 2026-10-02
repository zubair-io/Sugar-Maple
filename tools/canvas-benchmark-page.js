// Injected only by benchmark runners, never imported into the editor bundle.
// rAF observations include normal event handling, Angular scheduling and Canvas
// painting. They are NOT hardware input-to-photon or compositor presentation times.
window.canvasBenchmark = async function (total, samples = 360) {
  const fail = message => { throw Error(message); };
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const summary = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return { count: sorted.length, median: sorted[Math.ceil(sorted.length * .5) - 1], p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1) };
  };
  if (document.visibilityState !== 'visible') fail('Benchmark must run in a visible foreground window');
  const initial = await window.sugarMaple.dispatch('document.checkpoint');
  if (initial.document.nodes.length !== total) fail(`Wrong fixture: expected ${total}, found ${initial.document.nodes.length}. ${document.querySelector('[role="alert"]')?.textContent ?? ''}`);
  const canvas = document.querySelector('.viewport canvas');
  if (!canvas || document.querySelector('.viewport [data-node-id]')) fail('Design must use the real Canvas renderer');
  // Wait on the regular renderer and decoded images, without using viewport.flush.
  const deadline = performance.now() + 15000;
  while (window.sugarMaple.viewport.stats().total !== total || window.sugarMaple.viewport.stats().drawn !== 200 ||
    document.querySelector('asset-inspector [role="alert"]')) {
    if (performance.now() > deadline) fail('The requested 200-visible fixture did not paint');
    await nextFrame();
  }
  await document.fonts.ready;
  await Promise.all(Object.values(initial.document.assets).map(async source => {
    const image = new Image(); image.src = source; await image.decode();
  }));
  const startup = { navigationToObservedPaintMs: performance.now(), timeOrigin: performance.timeOrigin,
    canvas: { width: canvas.width, height: canvas.height }, viewport: { width: canvas.clientWidth, height: canvas.clientHeight },
    initialStats: window.sugarMaple.viewport.stats(), initialCamera: window.sugarMaple.viewport.camera() };
  for (let i = 0; i < 10; i++) await nextFrame();
  // Pixel proof runs before timing phases. Inspect directly (no settle/flush),
  // and check every visible image really painted the fixture's blue checker.
  const imageIds = new Set(initial.document.nodes.filter(n => n.kind === 'image').map(n => n.id));
  const rect = canvas.getBoundingClientRect(), scale = canvas.width / rect.width;
  const imagePixels = window.sugarMaple.viewport.inspect().nodes.filter(n => n.painted && imageIds.has(n.id)).map(n => {
    const b = n.bounds;
    const pixel = [...canvas.getContext('2d').getImageData(
      Math.round((b.x + b.width * .1 - rect.x) * scale),
      Math.round((b.y + b.height * .1 - rect.y) * scale), 1, 1).data];
    if (JSON.stringify(pixel) !== '[37,99,235,255]') fail(`Image ${n.id} did not paint the known checker pixel: ${pixel}`);
    return { id: n.id, pixel };
  });
  if (imagePixels.length !== 20) fail('Expected 20 visible, decoded image nodes');
  const baselineCamera = window.sugarMaple.viewport.camera();
  const phases = [];
  let layersOpenMs = null;
  for (const mode of ['idle', 'pan', 'zoom', 'pan-with-layers']) {
    if (mode === 'pan-with-layers') {
      const layers = [...document.querySelectorAll('nav[aria-label="Sidebar sections"] button')].find(n => n.textContent.trim() === 'Layers');
      if (!layers) fail('Missing actual Layers tab');
      const openedAt = performance.now(); layers.click();
      for (let i = 0; i < 2; i++) await nextFrame();
      const tree = document.querySelector('[role="tree"][aria-label="Layers"]');
      const mounted = document.querySelectorAll('.layer-row').length;
      if (!tree || Number(tree.dataset.layerCount ?? mounted) !== total) fail('Wrong full Layers model count');
      if (tree.dataset.layerCount !== undefined && (mounted < 1 || mounted > Math.ceil(tree.clientHeight / 36) + 18))
        fail('Virtual Layers panel exceeded its viewport and focus-pin bound');
      layersOpenMs = performance.now() - openedAt;
      for (let i = 0; i < 10; i++) await nextFrame();
    }
    const intervals = [], inputToObservedPaintMs = [], paintMs = [], drawn = [];
    let previousFrame = await nextFrame(), sentAt = null, frameAtSend = null;
    const startFrames = window.sugarMaple.viewport.stats().frames;
    const cameraBefore = window.sugarMaple.viewport.camera();
    for (let i = 0; i <= samples; i++) {
      const frame = await nextFrame();
      const stats = window.sugarMaple.viewport.stats();
      if (i > 0) intervals.push(frame - previousFrame);
      previousFrame = frame;
      if (sentAt !== null) {
        if (stats.frames <= frameAtSend) fail('A wheel input did not advance the normal renderer by the next observed frame');
        inputToObservedPaintMs.push(performance.now() - sentAt);
        paintMs.push(stats.paintMs); drawn.push(stats.drawn);
      }
      if (i === samples || mode === 'idle') continue;
      const rect = canvas.getBoundingClientRect();
      const camera = window.sugarMaple.viewport.camera();
      frameAtSend = stats.frames; sentAt = performance.now();
      canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true,
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
        deltaX: mode.startsWith('pan') ? (i % 2 ? -3 : 3) : 0,
        deltaY: mode.startsWith('pan') ? (i % 2 ? -2 : 2) : camera.zoom >= baselineCamera.zoom ? 1 : -1,
        ctrlKey: mode === 'zoom' }));
    }
    const cameraAfter = window.sugarMaple.viewport.camera();
    const paintFrames = window.sugarMaple.viewport.stats().frames - startFrames;
    if (mode !== 'idle' && paintFrames < samples) fail('Too few paint frames for sampled wheel events');
    phases.push({ mode, cameraBefore, cameraAfter, paintFrames, frameIntervalMs: summary(intervals),
      inputToObservedPaintMs: inputToObservedPaintMs.length ? summary(inputToObservedPaintMs) : null,
      paintCpuMs: paintMs.length ? summary(paintMs) : null,
      drawnRange: drawn.length ? [Math.min(...drawn), Math.max(...drawn)] : null,
      raw: { intervals, inputToObservedPaintMs, paintMs, drawn } });
  }
  const final = await window.sugarMaple.dispatch('document.checkpoint');
  if (JSON.stringify(final) !== JSON.stringify(initial)) fail('Camera benchmark mutated the document or history');
  const cadence = phases[0].frameIntervalMs.median;
  for (const phase of phases) phase.missedCadenceIntervals = phase.raw.intervals.filter(v => v > cadence * 1.5).length;
  return { total, visibleAtStart: 200, startup, phases, userAgent: navigator.userAgent,
    dpr: devicePixelRatio, visibility: document.visibilityState, imagePixels, layersOpenMs,
    layerRows: document.querySelectorAll('.layer-row').length, authoredCheckpointUnchanged: true,
    metrics: { raf: 'Refresh callback intervals; includes event/Angular/paint scheduling, excludes proof of physical presentation',
      input: 'Synthetic WheelEvent dispatch to next rAF observing an advanced paint count; excludes OS dispatch and input hardware',
      startup: 'Fresh navigation to observed fixture paint, including bundle load/recovery; filesystem caches may be warm' } };
};
