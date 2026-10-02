import { PROTOCOL, SnapshotSchema, boundedPacket, effectiveProps } from './contract';

const session = document.querySelector<HTMLMetaElement>('meta[name=preview-session]')!.content;
let port: MessagePort | null = null, latest = -1, rendered = -1;
const card = document.createElement('wa-card') as any, input = document.createElement('wa-input') as any,
  button = document.createElement('wa-button') as any, header = document.createElement('h2');
header.slot = 'header'; header.textContent = 'Pinned library consumer'; button.slot = 'footer';
card.append(header, input, button); document.body.append(card);
const send = (event: object) => port?.postMessage({ version: PROTOCOL, session, ...event });
button.addEventListener('click', () => {
  if (!button.disabled && rendered === latest) send({ kind: 'action', component: 'Button', revision: rendered });
});
input.addEventListener('input', () => {
  if (!input.disabled && rendered === latest && typeof input.value === 'string' && input.value.length <= 20000)
    send({ kind: 'change', component: 'Input', value: input.value, revision: rendered });
});
async function render(value: unknown) {
  let revision = Math.max(0, latest);
  try {
    const packet = SnapshotSchema.parse(boundedPacket(value));
    if (packet.session !== session) return;
    revision = packet.revision;
    if (revision <= latest) { send({ kind: 'error', revision, code: 'stale_revision', message: 'Render a newer revision' }); return; }
    const props = effectiveProps(packet.props); // Validate everything before touching controls.
    latest = revision;
    button.textContent = String(props.Button.label); button.disabled = props.Button.disabled;
    button.variant = props.Button.variant; button.appearance = props.Button.appearance;
    input.label = props.Input.label; input.placeholder = props.Input.placeholder; input.value = props.Input.value;
    input.type = props.Input.type; input.disabled = props.Input.disabled; input.setAttribute('maxlength', '20000');
    card.style.setProperty('--spacing', String(props.Card.padding) + 'px');
    await Promise.all([button.updateComplete, input.updateComplete, card.updateComplete]);
    // Include scheduled layout/paint opportunities, not only Lit's microtask.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (latest !== revision || !port) return;
    rendered = revision; send({ kind: 'rendered', revision });
  } catch {
    send({ kind: 'error', revision, code: 'invalid_props', message: 'Props do not match the pinned fixture manifest' });
  }
}
function connect(event: MessageEvent) {
  if (event.source !== window.parent || event.data?.kind !== 'maple-library-preview-connect-v1' ||
    event.data?.session !== session || event.ports.length !== 1 || port) return;
  port = event.ports[0]; window.removeEventListener('message', connect);
  port.onmessage = event => { void render(event.data); }; port.start(); send({ kind: 'ready' });
}
window.addEventListener('message', connect);
window.addEventListener('pagehide', () => { port?.close(); port = null; });
