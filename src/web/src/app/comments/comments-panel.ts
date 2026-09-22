import { MuiSelectComponent } from '../chrome/maple/ui/select/mui-select.component';
import { CommentUi } from './comment-ui';
import { Component, computed, inject, signal, ElementRef, afterEveryRender } from '@angular/core';
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
  readonly ui = inject(CommentUi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private highlightedRequest = -1;
  readonly statusOptions = [
    { value: 'open', label: 'Open' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'all', label: 'All' },
  ];
  readonly status = this.ui.status;
  readonly replies = this.ui.replies;
  readonly notice = signal('');
  readonly page = computed(() => this.e.doc().pages.find((p) => p.id === this.e.pageId()));
  readonly threads = computed(() =>
    this.e
      .doc()
      .comments.filter(
        (c) =>
          c.pageId === this.e.pageId() &&
          (this.status() === 'all' || c.resolved === (this.status() === 'resolved')),
      ),
  );
  constructor() {
    afterEveryRender(() => {
      const focused = this.ui.focused();
      if (!focused || focused.request === this.highlightedRequest) return;
      const article = this.host.nativeElement.querySelector<HTMLElement>(
        `[data-comment-id="${CSS.escape(focused.id)}"]`,
      );
      if (!article || !article.getClientRects().length) return;
      this.highlightedRequest = focused.request;
      article.scrollIntoView({
        block: 'nearest',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
      article.focus({ preventScroll: true });
      article.classList.remove('pulse');
      void article.offsetWidth;
      article.classList.add('pulse');
    });
  }
  setReply(id: string, text: string) {
    this.replies.update((d) => ({ ...d, [id]: text }));
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
