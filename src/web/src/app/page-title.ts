import {
  Component,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { EditorService } from './editor.service';
@Component({
  selector: 'page-title',
  standalone: true,
  templateUrl: './page-title.html',
  styleUrl: './page-title.scss',
})
export class PageTitle {
  readonly e = inject(EditorService);
  private readonly injector = inject(Injector);
  readonly id = input.required<string>();
  readonly name = input.required<string>();
  readonly active = input(false);
  readonly selected = output<void>();
  readonly editing = signal(false);
  readonly draft = signal('');
  readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  readonly button = viewChild<ElementRef<HTMLButtonElement>>('button');
  constructor() {
    effect(() => {
      const input = this.field()?.nativeElement;
      if (input) {
        input.focus();
        input.select();
      }
    });
  }
  start(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.draft.set(this.name());
    this.editing.set(true);
  }
  finish(event: Event) {
    if (!this.editing()) return;
    const name = this.draft().trim();
    if (!name || name.length > 128) {
      this.e.error.set('Page names need 1–128 characters.');
      return;
    }
    if (name !== this.name() && !this.e.perform([{ type: 'page.update', id: this.id(), name }]))
      return;
    this.editing.set(false);
    if (event.type === 'keydown') {
      event.preventDefault();
      event.stopPropagation();
      this.returnFocus();
    }
  }
  cancel(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.editing.set(false);
    this.returnFocus();
  }
  private returnFocus() {
    afterNextRender(() => this.button()?.nativeElement.focus(), { injector: this.injector });
  }
}
