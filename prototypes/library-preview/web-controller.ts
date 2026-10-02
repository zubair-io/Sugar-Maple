import { PROTOCOL, EventSchema, boundedPacket, validateProps, type PreviewProps, type PreviewEvent } from './contract';

export class WebPreview {
  private frame: HTMLIFrameElement | null = null;
  private port: MessagePort | null = null;
  private transferPort: MessagePort | null = null;
  private session = '';
  private revision = -1;
  private wait: { resolve: (event: PreviewEvent) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  constructor(private container: HTMLElement, private onEvent: (event: PreviewEvent) => void) {}
  private pending() {
    this.wait?.reject(new Error('Preview request superseded')); if (this.wait) clearTimeout(this.wait.timer);
    return new Promise<PreviewEvent>((resolve, reject) => {
      const timer = setTimeout(() => { this.wait = null; this.stop(); reject(new Error('Preview timed out')); }, 5000);
      this.wait = { resolve, reject, timer };
    });
  }
  async start(js: string, css: string, nonce: string) {
    if (!/^[a-zA-Z0-9+/=]+$/.test(nonce)) throw Error('Invalid preview nonce');
    this.stop(); this.session = crypto.randomUUID(); this.revision = -1;
    const frame = document.createElement('iframe'); this.frame = frame;
    frame.title = 'Isolated Web Awesome preview'; frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; display-capture 'none'");
    frame.referrerPolicy = 'no-referrer';
    const channel = new MessageChannel(), session = this.session;
    this.port = channel.port1;
    this.transferPort = channel.port2;
    channel.port1.onmessage = message => {
      if (this.frame !== frame || this.session !== session) return;
      try {
        const event = EventSchema.parse(boundedPacket(message.data));
        if (event.session !== session || (event.kind !== 'ready' && event.revision !== this.revision)) return;
        if (event.kind === 'ready' && this.revision !== -1) return;
        if (event.kind === 'ready' || event.kind === 'rendered' || event.kind === 'error') {
          const waiting = this.wait; this.wait = null;
          if (waiting) { clearTimeout(waiting.timer); event.kind === 'error' ? waiting.reject(new Error(event.message)) : waiting.resolve(event); }
        }
        this.onEvent(event);
      } catch { /* Invalid/privileged events are rejected, never interpreted as commands. */ }
    };
    channel.port1.start();
    frame.onload = () => {
      frame.onload = null;
      if (this.frame === frame) {
        frame.contentWindow!.postMessage({ kind: 'maple-library-preview-connect-v1', session }, '*', [channel.port2]);
        this.transferPort = null;
      }
    };
    const policy = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'`;
    frame.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="preview-session" content="${session}"><style>${css.replace(/<\/style/gi, '<\\/style')}\nbody{margin:16px;font-family:system-ui}wa-card{width:360px}h2{font-size:18px;margin:0}</style><script type="module" nonce="${nonce}">${js.replace(/<\/script/gi, '<\\/script')}</script>`;
    const ready = this.pending(); this.container.append(frame); return ready;
  }
  render(value: PreviewProps) {
    const props = validateProps(value);
    if (!this.port || !this.frame) throw Error('Start the preview first');
    const reply = this.pending(); this.revision++;
    this.port.postMessage({ version: PROTOCOL, session: this.session, kind: 'render', revision: this.revision, props });
    return reply;
  }
  stop() {
    this.wait?.reject(new Error('Preview stopped')); if (this.wait) clearTimeout(this.wait.timer); this.wait = null;
    this.port?.close(); this.port = null; this.frame?.remove(); this.frame = null; this.session = ''; this.revision = -1;
    this.transferPort?.close(); this.transferPort = null;
  }
}
