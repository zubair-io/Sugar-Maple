import { MuiSelectComponent } from '../chrome/maple/ui/select/mui-select.component';
import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EditorService } from '../editor.service';
@Component({
  selector: 'page-comments',
  standalone: true,
  imports: [FormsModule, DatePipe, MuiSelectComponent],
  templateUrl: './comments-panel.html',
  styleUrl: './comments-panel.scss',
})
export class CommentsPanel {
  readonly e = inject(EditorService);
  readonly pageOptions = computed(() =>
    this.e.doc().pages.map((p) => ({ value: p.id, label: p.name })),
  );
  readonly scopeOptions = [
    { value: 'page', label: 'This page' },
    { value: 'all', label: 'All pages' },
  ];
  readonly statusOptions = [
    { value: 'open', label: 'Open' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'all', label: 'All' },
  ];
  readonly status = signal('open');
  readonly scope = signal('page');
  readonly drafts = signal<Record<string, string>>({});
  readonly replies = signal<Record<string, string>>({});
  readonly notice = signal('');
  readonly key = computed(() => this.e.doc().id + ':' + this.e.pageId());
  readonly draft = computed(() => this.drafts()[this.key()] ?? '');
  readonly page = computed(() => this.e.doc().pages.find((p) => p.id === this.e.pageId()));
  readonly threads = computed(() =>
    this.e
      .doc()
      .comments.filter(
        (c) =>
          (this.scope() === 'all' || c.pageId === this.e.pageId()) &&
          (this.status() === 'all' || c.resolved === (this.status() === 'resolved')),
      ),
  );
  setDraft(text: string) {
    this.drafts.update((d) => ({ ...d, [this.key()]: text }));
  }
  setReply(id: string, text: string) {
    this.replies.update((d) => ({ ...d, [id]: text }));
  }
  selectPage(id: string) {
    this.e.pageId.set(id);
    this.e.select(null);
    this.notice.set('');
  }
  pageName(id: string) {
    return this.e.doc().pages.find((p) => p.id === id)?.name ?? 'Page';
  }
  add() {
    if (!this.draft().trim()) return;
    const r = this.e.perform([
      { type: 'comment.add', pageId: this.e.pageId(), text: this.draft() },
    ]);
    if (r) {
      this.setDraft('');
      this.status.set('open');
      this.notice.set('Comment added');
    }
  }
  reply(id: string) {
    const text = this.replies()[id] ?? '';
    if (!text.trim()) return;
    if (this.e.perform([{ type: 'comment.reply', id, text }])) {
      this.setReply(id, '');
      this.notice.set('Reply added; thread is open');
    }
  }
  resolve(id: string, resolved: boolean) {
    if (this.e.perform([{ type: 'comment.resolve', id, resolved }]))
      this.notice.set(resolved ? 'Comment resolved' : 'Comment reopened');
  }
}
