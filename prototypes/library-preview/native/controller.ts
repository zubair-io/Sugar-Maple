import { z } from '../../../src/web/node_modules/zod';
import { effectiveProps, validateProps, type PreviewProps, MAX_PACKET_BYTES } from '../contract';
import { supervise } from './supervise';
import type { buildNativeFixture } from './build';

const session = z.string().uuid(), revision = z.number().int().min(0).max(2147483647);
const common = { version: z.literal(1), session };
const reply = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('ready'), canaryDenied: z.boolean().nullable(), networkDenied: z.boolean().nullable() }).strict(),
  z.object({ ...common, revision, kind: z.literal('rendered'), width: z.number().int().min(1).max(1600), height: z.number().int().min(1).max(2000), png: z.string().max(3500000) }).strict(),
  z.object({ ...common, revision, kind: z.literal('action'), component: z.literal('Button') }).strict(),
  z.object({ ...common, revision, kind: z.literal('change'), component: z.literal('Input'), value: z.string().max(20000) }).strict(),
  z.object({ ...common, revision, kind: z.literal('error'), code: z.enum(['invalid_props', 'stale_revision']) }).strict(),
]);
export type NativeReply = z.infer<typeof reply>;
export function nativeProps(value: PreviewProps) {
  const props = validateProps(value), values = effectiveProps(props);
  if (!['Default', 'Disabled'].includes(props.Button.variant) || !['Default', 'Disabled'].includes(props.Input.variant) ||
      values.Button.variant !== 'neutral' || values.Button.appearance !== 'accent') throw Error('Unsupported native variant/property; the pinned mapping only supports Default/Disabled');
  return { label: values.Button.label, disabled: values.Button.disabled, inputLabel: values.Input.label,
    placeholder: values.Input.placeholder, value: values.Input.value, inputType: values.Input.type,
    inputDisabled: values.Input.disabled, padding: values.Card.padding };
}
export class NativePreview {
  readonly session = crypto.randomUUID();
  readonly owner;
  private revision = -1;
  private closed = false;
  private buffer = Buffer.alloc(0);
  private waiting: { resolve: (event: NativeReply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  readonly ready: Promise<NativeReply>;
  constructor(build: Awaited<ReturnType<typeof buildNativeFixture>>, onEvent: (event: NativeReply) => void,
      options: { signal?: AbortSignal; canary?: string; testPort?: number } = {}) {
    if (options.signal?.aborted) throw Error('Native preview cancelled');
    this.ready = this.pending();
    const env = { PATH: '/usr/bin:/bin', ...(options.canary ? { MAPLE_PREVIEW_TEST_CANARY: options.canary } : {}),
      ...(options.testPort ? { MAPLE_PREVIEW_TEST_PORT: String(options.testPort) } : {}) };
    this.owner = supervise([build.limit, '15', build.executable, this.session], {
      wallMilliseconds: 60000, rssKiB: 524288, outputBytes: 64000000, signal: options.signal,
      onOutput: chunk => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        if (this.buffer.length > 4000000) { this.stop('Native packet too large'); return; }
        let end: number;
        while ((end = this.buffer.indexOf(10)) >= 0) {
          const line = this.buffer.subarray(0, end); this.buffer = this.buffer.subarray(end + 1);
          try {
            const event = reply.parse(JSON.parse(line.toString()));
            if (event.session !== this.session || this.closed ||
                (event.kind === 'ready' ? this.revision !== -1 : event.revision !== this.revision)) continue;
            if (['ready', 'rendered', 'error'].includes(event.kind)) {
              const pending = this.waiting; this.waiting = null;
              if (pending) { clearTimeout(pending.timer); event.kind === 'error' ? pending.reject(Error(event.code)) : pending.resolve(event); }
            }
            onEvent(event);
          } catch { this.stop('Invalid native reply'); }
        }
      },
    }, env);
    void this.owner.done.catch(error => this.stop(String(error)));
  }
  private pending() {
    if (this.waiting) { clearTimeout(this.waiting.timer); this.waiting.reject(Error('Native request superseded')); }
    return new Promise<NativeReply>((resolve, reject) => {
      const timer = setTimeout(() => this.stop('Native reply timed out'), 5000);
      this.waiting = { resolve, reject, timer };
    });
  }
  render(value: PreviewProps) {
    const props = nativeProps(value);
    if (this.closed || this.revision === -1 && this.waiting) throw Error('Wait for native ready before rendering');
    const result = this.pending(); this.revision++;
    const text = JSON.stringify({ version: 1, session: this.session, revision: this.revision, kind: 'render', ...props }) + '\n';
    if (Buffer.byteLength(text) > MAX_PACKET_BYTES) { this.stop('Native request too large'); return result; }
    this.owner.child.stdin.write(text, error => { if (error) this.stop(String(error)); });
    return result;
  }
  stop(reason = 'Native preview stopped') {
    if (this.closed) return;
    this.closed = true;
    if (this.waiting) { clearTimeout(this.waiting.timer); this.waiting.reject(Error(reason)); this.waiting = null; }
    this.owner?.stop(reason);
  }
}
