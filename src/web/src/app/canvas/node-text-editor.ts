import { Directive, ElementRef, HostListener, OnDestroy, effect, inject, input, untracked } from '@angular/core';
import { EditorService, type TextEditControl } from '../editor.service';
import type { SceneNode } from '../model/schema';

/** Own the native textarea value while editing; document refreshes never rewrite a draft/caret. */
@Directive({ selector: 'textarea[nodeTextEditor]', standalone: true })
export class NodeTextEditor implements OnDestroy {
  readonly node = input.required<SceneNode>({ alias: 'nodeTextEditor' });
  private readonly e = inject(EditorService);
  private readonly element = inject<ElementRef<HTMLTextAreaElement>>(ElementRef).nativeElement;
  private session: { documentId: string; nodeId: string; text: string } | null = null;
  private composing = false;
  private deferredChange = false;
  private readonly control: TextEditControl = {
    pending: () => !!this.session && (this.composing || this.element.value !== this.session.text),
    finish: () => this.finish(),
    cancel: () => this.cancel(),
  };
  private readonly unregister = this.e.registerTextEdit(this.control);
  constructor() {
    effect(() => {
      const node = this.node(), documentId = this.e.doc().id;
      untracked(() => {
        if (this.control.pending()) return;
        const start = this.element.selectionStart, end = this.element.selectionEnd;
        if (this.element.value !== node.text) {
          this.element.value = node.text;
          if (document.activeElement === this.element)
            this.element.setSelectionRange(Math.min(start, node.text.length), Math.min(end, node.text.length));
        }
        if (this.session) this.session = { documentId, nodeId: node.id, text: node.text };
      });
    });
  }
  @HostListener('focus') begin() {
    if (!this.session) this.session = { documentId: this.e.doc().id, nodeId: this.node().id, text: this.node().text };
  }
  @HostListener('input') changed() {
    this.begin(); this.e.textDraft.set(this.control.pending());
  }
  @HostListener('compositionstart') compositionStart() {
    this.begin(); this.composing = true; this.e.textDraft.set(true);
  }
  @HostListener('compositionend') compositionEnd() {
    this.composing = false; this.e.textDraft.set(this.control.pending());
    if (this.deferredChange) { this.deferredChange = false; this.commit(); }
  }
  @HostListener('change') change() {
    if (this.composing) this.deferredChange = true;
    else this.commit();
  }
  @HostListener('blur') blur() {
    if (this.composing) this.deferredChange = true;
    else this.commit();
  }
  @HostListener('keydown', ['$event']) key(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault(); event.stopImmediatePropagation(); this.cancel();
  }
  private commit(): boolean {
    const session = this.session;
    if (!session) return true;
    if (this.composing) {
      this.e.error.set('Finish text composition, or cancel the text edit, before changing context.'); return false;
    }
    if (this.element.value === session.text) {
      this.session = null; this.e.textDraft.set(false); return true;
    }
    const node = this.e.doc().nodes.find(node => node.id === session.nodeId);
    if (this.e.doc().id !== session.documentId || !node || node.text !== session.text) {
      this.e.error.set('Text changed elsewhere. Your draft is preserved; cancel it before changing context.'); return false;
    }
    if (this.e.mode() !== 'Design') {
      this.e.error.set('Return to Design to finish this text edit, or cancel it.'); return false;
    }
    this.session = null; this.e.textDraft.set(false);
    if (!this.e.perform([{ type: 'node.update', id: session.nodeId, patch: { text: this.element.value } }])) {
      this.session = session; this.e.textDraft.set(true); return false;
    }
    return true;
  }
  private finish(): boolean {
    if (!this.commit()) return false;
    if (document.activeElement === this.element) this.element.blur();
    return true;
  }
  private cancel() {
    this.session = null; this.composing = false; this.deferredChange = false;
    this.element.value = this.node().text; this.e.textDraft.set(false); this.element.blur(); this.e.error.set('');
  }
  ngOnDestroy() { this.unregister(); }
}
