import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { EditorService } from '../editor.service';

@Injectable({ providedIn: 'root' })
export class CommentUi {
  readonly e = inject(EditorService);
  readonly panel = signal('Details');
  readonly placing = signal(false);
  readonly drafts = signal<Record<string, { x: number; y: number; text: string }>>({});
  readonly replies = signal<Record<string, string>>({});
  readonly draft = computed(() => this.drafts()[this.pageKey()] ?? null);
  readonly focused = signal<{ id: string; request: number } | null>(null);
  readonly status = signal('open');
  readonly openRequest = signal(0);
  readonly pageKey = computed(() => this.e.doc().id + ':' + this.e.pageId());
  readonly comments = computed(() =>
    this.e.doc().comments.filter((c) => c.pageId === this.e.pageId()),
  );
  constructor() {
    effect(() => {
      this.pageKey();
      this.placing.set(false);
      this.focused.set(null);
    });
  }
  start() {
    this.clearDraft();
    this.placing.set(!this.placing());
  }
  cancel() {
    this.placing.set(false);
    this.clearDraft();
  }
  place(x: number, y: number) {
    this.placing.set(false);
    this.drafts.update((d) => ({ ...d, [this.pageKey()]: { x, y, text: '' } }));
  }
  setText(text: string) {
    const current = this.draft();
    if (current) this.drafts.update((d) => ({ ...d, [this.pageKey()]: { ...current, text } }));
  }
  clearDraft() {
    this.drafts.update((d) => {
      const next = { ...d };
      delete next[this.pageKey()];
      return next;
    });
  }
  show(id: string) {
    const comment = this.comments().find((c) => c.id === id);
    if (!comment) return;
    this.placing.set(false);
    this.panel.set('Comments');
    this.status.set(comment.resolved ? 'resolved' : 'open');
    const request = this.openRequest() + 1;
    this.focused.set({ id, request });
    this.openRequest.set(request);
  }
  post() {
    const draft = this.draft();
    if (!draft?.text.trim()) return;
    const result = this.e.perform([
      {
        type: 'comment.add',
        pageId: this.e.pageId(),
        text: draft.text,
        anchor: { x: draft.x, y: draft.y },
      },
    ]);
    if (result) {
      this.clearDraft();
      this.show(result.ids[0]);
    }
  }
}
