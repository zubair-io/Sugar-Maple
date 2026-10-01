import { afterNextRender, Component, computed, effect, ElementRef, HostListener, inject, Injector, input, OnDestroy, output, signal, untracked } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { NgTemplateOutlet } from '@angular/common';
import { hasPrototypeAction } from '../model/form';
import { PreviewScreen } from './preview-screen';
import { PrototypeSession } from './prototype-session';
import type { SceneDocument, SceneNode } from '../model/schema';
@Component({
  selector: 'prototype-preview',
  imports: [PreviewScreen, NgTemplateOutlet],
  providers: [PrototypeSession],
  template: `
    <div class="preview-backdrop" role="dialog" aria-modal="true" aria-label="Prototype preview" tabindex="-1">
      <header [inert]="overlays().length > 0">
        <strong data-preview-heading tabindex="-1">{{ current()?.name }} · Preview</strong>
        <select aria-label="Preview viewport" [value]="viewport()" (change)="setViewport($any($event.target).value)">
          @for (v of viewports; track v.value) { <option [value]="v.value">{{ v.label }}</option> }
          <option value="custom">Custom viewport</option>
        </select>
        @if (viewport() === 'custom') { <label>Width <input aria-label="Custom preview width" type="number" min="240" max="4096" step="1" [value]="width()" (change)="setCustomWidth($any($event.target).value)" /></label> }
        @if (viewport() === 'custom') { <label>Height <input aria-label="Custom preview height" type="number" min="240" max="4096" step="1" [value]="height()" (change)="setCustomHeight($any($event.target).value)" /></label> }
        <button [attr.aria-pressed]="inspect()" (click)="toggleInspect()">Developer Inspect</button>
        <button [disabled]="!canBack()" (click)="back()">Back</button>
        <button (click)="reset()">Reset preview</button>
        <button (click)="exit()">{{ standalone() ? 'Return to editor' : 'Close preview' }}</button>
      </header>
      @if (error()) { <p class="preview-error" role="alert">{{ error() }}</p> }
      <div class="preview-scroll" [inert]="overlays().length > 0">
        @if (current(); as n) {
          <div class="preview-stage" [style.width.px]="n.width" [style.height.px]="n.height">
            <preview-screen [node]="n" [previous]="previous()" [document]="document()" [inspect]="inspect()" [selected]="inspectSelection()" (pick)="inspectNode($event)" (activate)="activate($event)" />
          </div>
        }
      </div>
      <ng-template #details>
        <aside class="inspect-panel" aria-label="Developer Inspect details" aria-live="polite">
          @if (inspected(); as n) {
            <strong>{{ n.name }}</strong><span>{{ n.kind }} · {{ n.id }}</span>
            <span>{{ n.width }} × {{ n.height }} · {{ n.layout }}</span>
            @if (componentName()) { <span>Component: {{ componentName() }}</span> }
            @if (n.fillToken) { <span>Fill token: {{ n.fillToken }} · {{ document().tokens[n.fillToken] }}</span> }
            @if (hasAction(n)) { <span>Action: {{ n.prototypeAction }} · {{ n.targetId || 'History' }}</span> }
          } @else { <span>Select a layer to inspect. Prototype actions and form editing are paused.</span> }
        </aside>
      </ng-template>
      @if (inspect() && !overlays().length) { <ng-container *ngTemplateOutlet="details" /> }
      @for (n of overlays(); track $index; let last = $last) {
        <div class="overlay-backdrop" [inert]="!last">
          <div class="overlay-dialog" role="dialog" aria-modal="true" [attr.aria-label]="n.name" tabindex="-1">
            <header><strong>{{ n.name }}</strong><button (click)="closeOverlay()">Close overlay</button></header>
            <div class="overlay-scroll"><div class="overlay-stage" [style.width.px]="n.width" [style.height.px]="n.height">
              <preview-screen [node]="n" [document]="document()" [inspect]="inspect()" [selected]="inspectSelection()" (pick)="inspectNode($event)" (activate)="activate($event)" />
            </div></div>
            @if (inspect() && last) { <ng-container *ngTemplateOutlet="details" /> }
          </div>
        </div>
      }
    </div>`,
  styles: `
    .preview-backdrop { position:fixed; inset:0; background:#131212f5; z-index:1000; display:flex; flex-direction:column; }
    header { min-height:50px; display:flex; align-items:center; gap:12px; padding:8px 20px; border-bottom:1px solid #ffffff15; }
    strong { margin-right:auto; } button { background:#2a2929; color:#f5f5f5; border:1px solid #ffffff30; border-radius:5px; padding:6px 10px; }
    button:disabled { opacity:.4; } select { width:170px; background:#2a2929; color:#f5f5f5; padding:6px; } input { width:80px; background:#2a2929; color:#f5f5f5; }
    header { flex-wrap:wrap; } .inspect-panel { display:flex; gap:16px; flex-wrap:wrap; padding:12px 20px; background:#252424; color:#f5f5f5; }
    .preview-scroll { overflow:auto; flex:1; padding:40px; }
    .preview-stage,.overlay-stage { position:relative; margin:auto; color-scheme:light; }
    .preview-error { margin:0; padding:8px 20px; color:#fbbf24; }
    .overlay-backdrop { position:absolute; inset:0; display:grid; place-items:center; background:#0008; padding:24px; animation:appear 180ms ease-out; }
    .overlay-dialog { max-width:100%; max-height:90vh; display:flex; flex-direction:column; background:#252424; border:1px solid #ffffff30; border-radius:8px; overflow:hidden; box-shadow:0 20px 60px #0008; }
    .overlay-scroll { overflow:auto; flex:1; } .overlay-stage { margin:0; }
    @keyframes appear { from {opacity:0} to {opacity:1} }
    @media(prefers-reduced-motion:reduce) { .overlay-backdrop {animation:none;} }
  `,
})
export class PrototypePreview implements OnDestroy {
  readonly document = input.required<SceneDocument>();
  readonly rootId = input.required<string>();
  readonly standalone = input(false);
  readonly closed = output<string>();
  readonly session = inject(PrototypeSession);
  private readonly element: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly dom = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly opener = this.dom.activeElement as HTMLElement | null;
  private focusStack: (HTMLElement | null)[] = [];
  private initializedRoot = '';
  private initializedDocument = '';
  private destroyed = false;
  private timer?: ReturnType<typeof setTimeout>;
  readonly width = signal<number | null>(null);
  readonly height = signal<number | null>(null);
  readonly hasAction = hasPrototypeAction;
  readonly viewport = signal('');
  readonly inspect = signal(false);
  readonly inspectSelection = signal<string[]>([]);
  readonly inspected = computed(() => this.document().nodes.find(n => n.id === this.inspectSelection()[0]) ?? null);
  readonly componentName = computed(() => {
    let node = this.inspected();
    while (node) {
      if (node.componentId) return this.document().nodes.find(n => n.id === node!.componentId)?.name ?? node.componentId;
      if (node.isComponent) return node.name;
      node = this.document().nodes.find(n => n.id === node!.parentId) ?? null;
    }
    return '';
  });
  readonly previous = signal<SceneNode | null>(null);
  readonly viewports = [ { value: '', label: 'Authored size' }, { value: '1440', label: 'Desktop · 1440' }, { value: '834', label: 'Tablet · 834' }, { value: '393', label: 'Mobile · 393' } ];
  readonly current = computed(() => {
    this.session.version();
    const n = this.document().nodes.find(n => n.id === this.session.state.currentId);
    return n ? { ...n, x: 0, y: 0, width: this.width() ?? n.width, height: this.height() ?? n.height, widthMode: 'fixed' as const, heightMode: this.height() === null ? n.heightMode : 'fixed' as const } : null;
  });
  readonly overlays = computed(() => {
    this.session.version();
    return this.session.state.overlays.map(id => this.document().nodes.find(n => n.id === id)!).filter(Boolean).map(n => ({ ...n, x: 0, y: 0, widthMode: 'fixed' as const }));
  });
  readonly canBack = computed(() => { this.session.version(); return !!(this.session.state.history.length || this.session.state.overlays.length); });
  readonly error = computed(() => { this.session.version(); return this.session.state.error; });
  constructor() {
    effect(() => {
      const doc = this.document(), root = this.rootId();
      untracked(() => {
        if (this.initializedDocument && this.initializedDocument !== doc.id) { this.exit('Document changed. Start a new preview.'); return; }
        if (!doc.nodes.some(n => n.id === root && n.kind === 'artboard' && !n.hidden)) { this.exit('The starting artboard is no longer available.'); return; }
        if (this.initializedRoot !== root) {
          this.session.state.start(doc, root); this.initializedRoot = root; this.initializedDocument = doc.id; this.focus();
        } else {
          const count = this.session.state.overlays.length, priorId = this.session.state.currentId;
          this.session.state.reconcile(doc);
          if (!this.session.state.currentId) { this.exit(this.session.state.error); return; }
          if (this.session.state.overlays.length < count) {
            const target = this.focusStack[this.session.state.overlays.length];
            this.focusStack.splice(this.session.state.overlays.length); this.focus(target);
          } else if (priorId !== this.session.state.currentId && !this.session.state.overlays.length) {
            clearTimeout(this.timer); this.previous.set(null); this.focusStack = []; this.focus();
          }
        }
        this.session.version.update(v => v + 1);
      });
    });
  }
  private focus(target?: HTMLElement | null) {
    afterNextRender(() => {
      if (this.destroyed) return;
      const activeOverlay = [...this.element.nativeElement.querySelectorAll<HTMLElement>('.overlay-dialog')].at(-1);
      if (target?.isConnected && !target.closest('[inert]')) target.focus();
      else if (activeOverlay) (activeOverlay.querySelector<HTMLElement>('button') ?? activeOverlay).focus();
      else this.element.nativeElement.querySelector<HTMLElement>('[data-preview-heading]')?.focus();
    }, { injector: this.injector });
  }
  activate(n: SceneNode) {
    if (this.inspect()) return;
    const oldCount = this.session.state.overlays.length, prior = this.current(), trigger = this.dom.activeElement as HTMLElement | null;
    if (!this.session.state.activate(this.document(), n)) { this.session.version.update(v => v + 1); return; }
    const count = this.session.state.overlays.length;
    if (n.prototypeAction === 'navigate') {
      clearTimeout(this.timer);
      this.previous.set(n.transition === 'dissolve' && !matchMedia('(prefers-reduced-motion: reduce)').matches ? prior : null);
      if (this.previous()) this.timer = setTimeout(() => this.previous.set(null), 200);
      this.focusStack = []; this.focus();
    } else if (count > oldCount) { this.focusStack.push(trigger); this.focus(); }
    else if (count < oldCount) this.focus(this.focusStack.pop());
    else this.focus();
    this.session.version.update(v => v + 1);
  }
  closeOverlay() {
    if (this.session.state.closeOverlay()) { this.focus(this.focusStack.pop()); this.session.version.update(v => v + 1); }
  }
  back() {
    if (this.session.state.overlays.length) { this.closeOverlay(); return; }
    if (this.session.state.back()) { clearTimeout(this.timer); this.previous.set(null); this.session.version.update(v => v + 1); this.focus(); }
  }
  reset() {
    clearTimeout(this.timer); this.previous.set(null); this.session.state.reset(this.document());
    this.inspectSelection.set([]);
    this.focusStack = []; this.session.version.update(v => v + 1); this.focus();
  }
  exit(error = '') { this.closed.emit(error); }
  setViewport(value: string) {
    this.viewport.set(value);
    this.width.set(value === 'custom' ? Math.max(240, Math.min(4096, this.width() ?? this.current()?.width ?? 393)) : value ? +value : null);
    this.height.set(value === 'custom' ? Math.max(240, Math.min(4096, this.height() ?? this.current()?.height ?? 852)) : null);
  }
  setCustomWidth(value: string) {
    const width = Number(value);
    if (Number.isInteger(width) && width >= 240 && width <= 4096) { this.width.set(width); this.session.state.error = ''; this.session.version.update(v => v + 1); }
    else { this.session.state.error = 'Preview width must be a whole number from 240 to 4096 pixels.'; this.session.version.update(v => v + 1); }
  }
  setCustomHeight(value: string) {
    const height = Number(value);
    if (Number.isInteger(height) && height >= 240 && height <= 4096) { this.height.set(height); this.session.state.error = ''; this.session.version.update(v => v + 1); }
    else { this.session.state.error = 'Preview height must be a whole number from 240 to 4096 pixels.'; this.session.version.update(v => v + 1); }
  }
  toggleInspect() { this.inspect.update(v => !v); clearTimeout(this.timer); this.previous.set(null); }
  inspectNode(value: {event: PointerEvent; node: SceneNode}) {
    if (!this.inspect()) return;
    value.event.preventDefault(); value.event.stopPropagation(); this.inspectSelection.set([value.node.id]);
  }
  @HostListener('window:keydown', ['$event']) key(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      this.session.state.overlays.length ? this.closeOverlay() : this.exit();
    } else if (event.key === 'Tab') {
      const scope = [...this.element.nativeElement.querySelectorAll<HTMLElement>('.overlay-dialog')].at(-1) ?? this.element.nativeElement;
      const targets = [...scope.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(el => el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length);
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && (!targets.includes(this.dom.activeElement as HTMLElement) || this.dom.activeElement === first)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (!targets.includes(this.dom.activeElement as HTMLElement) || this.dom.activeElement === last)) { event.preventDefault(); first?.focus(); }
    }
  }
  ngOnDestroy() {
    this.destroyed = true; clearTimeout(this.timer);
    queueMicrotask(() => { if (this.opener?.isConnected) this.opener.focus(); });
  }
}
