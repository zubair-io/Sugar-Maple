import { Component, ElementRef, afterEveryRender, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MuiButtonComponent } from '../chrome/maple/ui/button/mui-button.component';
import { CommentUi } from './comment-ui';
@Component({
  selector: 'comment-canvas',
  imports: [FormsModule, MuiButtonComponent],
  templateUrl: './comment-canvas.html',
  styleUrl: './comment-canvas.scss',
})
export class CommentCanvas {
  readonly ui = inject(CommentUi);
  readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly zoom = input.required<number>();
  readonly pan = input.required<{ x: number; y: number }>();
  private focusedDraft: object | null = null;
  private wasPlacing = false;
  constructor() {
    afterEveryRender(() => {
      if (this.ui.placing() && !this.wasPlacing)
        this.host.nativeElement.querySelector<HTMLButtonElement>('.placement')?.focus();
      this.wasPlacing = this.ui.placing();
      const draft = this.ui.draft();
      if (draft && !this.focusedDraft)
        this.host.nativeElement.querySelector<HTMLTextAreaElement>('textarea')?.focus();
      this.focusedDraft = draft;
    });
  }
  x(x: number) {
    return x * this.zoom() + this.pan().x;
  }
  y(y: number) {
    return y * this.zoom() + this.pan().y;
  }
  place(event: PointerEvent) {
    event.stopPropagation();
    if (event.button !== 0) return;
    event.preventDefault();
    const box = this.host.nativeElement.getBoundingClientRect();
    this.ui.place(
      (event.clientX - box.x - this.pan().x) / this.zoom(),
      (event.clientY - box.y - this.pan().y) / this.zoom(),
    );
  }
  center(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    const box = this.host.nativeElement.getBoundingClientRect();
    this.ui.place(
      (box.width / 2 - this.pan().x) / this.zoom(),
      (box.height / 2 - this.pan().y) / this.zoom(),
    );
  }
}
