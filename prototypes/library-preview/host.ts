import { WebPreview } from './web-controller';
import { fixtureProps, effectiveProps, type PreviewProps } from './contract';

const props = fixtureProps(), log = document.querySelector<HTMLElement>('#events')!, status = document.querySelector<HTMLElement>('#status')!;
const events: unknown[] = [];
const preview = new WebPreview(document.querySelector('#runtime')!, event => {
  events.push(event); if (events.length > 100) events.shift(); log.textContent = JSON.stringify(events, null, 2);
  if (event.kind === 'change') { props.Input.props.value = event.value; document.querySelector<HTMLInputElement>('#value')!.value = event.value; updateSemantic(props); }
});
const alert = document.querySelector<HTMLElement>('#error')!;
let started = false;
let renderGeneration = 0, lifecycle = 0, loading: AbortController | null = null;
const semantic = document.querySelector<HTMLIFrameElement>('#semantic')!;
function updateSemantic(value: PreviewProps) {
  const values = effectiveProps(value), doc = semantic.contentDocument;
  if (!doc) return;
  const button = doc.querySelector('button'), input = doc.querySelector('input'), card = doc.querySelector<HTMLElement>('[data-node-id=card]');
  if (button) { button.textContent = String(values.Button.label); button.disabled = Boolean(values.Button.disabled); }
  if (input) { input.value = String(values.Input.value); input.disabled = Boolean(values.Input.disabled); input.setAttribute('aria-label', String(values.Input.label)); }
  if (card) card.style.padding = String(values.Card.padding) + 'px';
}
async function render() {
  const generation = ++renderGeneration;
  updateSemantic(props);
  if (!started) return;
  try { alert.textContent = ''; await preview.render(props); if (generation === renderGeneration && started) status.textContent = 'Running locally'; }
  catch (error) { if (generation === renderGeneration && started) alert.textContent = String(error); }
}
document.querySelector('#start')!.addEventListener('click', async () => {
  const generation = ++lifecycle; loading?.abort(); loading = new AbortController();
  started = false; renderGeneration++; preview.stop();
  try {
    alert.textContent = ''; status.textContent = 'Starting…';
    const [js, css] = await Promise.all(['/runtime.js', '/runtime.css'].map(async url => {
      const response = await fetch(url, { signal: loading!.signal }); if (!response.ok) throw Error('Build the pinned offline fixture first'); return response.text();
    }));
    if (generation !== lifecycle) return;
    await preview.start(js, css, document.querySelector<HTMLMetaElement>('meta[name=preview-nonce]')!.content);
    if (generation !== lifecycle) return;
    started = true; await render();
  } catch (error) { if (generation === lifecycle) { started = false; alert.textContent = String(error); status.textContent = 'Stopped'; } }
});
document.querySelector('#stop')!.addEventListener('click', () => { lifecycle++; renderGeneration++; loading?.abort(); loading = null; started = false; preview.stop(); status.textContent = 'Stopped'; });
document.querySelector<HTMLInputElement>('#label')!.addEventListener('input', event => { props.Button.props.label = (event.target as HTMLInputElement).value; void render(); });
document.querySelector<HTMLInputElement>('#value')!.addEventListener('input', event => { props.Input.props.value = (event.target as HTMLInputElement).value; void render(); });
document.querySelector<HTMLInputElement>('#disabled')!.addEventListener('change', event => { props.Button.props.disabled = (event.target as HTMLInputElement).checked; void render(); });
document.querySelector<HTMLSelectElement>('#variant')!.addEventListener('change', event => {
  props.Button.variant = (event.target as HTMLSelectElement).value; delete props.Button.props.disabled;
  document.querySelector<HTMLInputElement>('#disabled')!.checked = Boolean(effectiveProps(props).Button.disabled); void render();
});
window.addEventListener('pagehide', () => preview.stop());
semantic.addEventListener('load', () => updateSemantic(props));
// This standalone fixture owns no document/command/native/file capability.
Object.assign(window, { preview, previewEvents: events, previewProps: props });
