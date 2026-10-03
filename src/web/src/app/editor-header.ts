import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { EditorService } from './editor.service';
import { MuiButtonComponent } from './chrome/maple/ui/button/mui-button.component';
import { MuiPopoverComponent } from './chrome/maple/ui/popover/mui-popover.component';

@Component({
  selector: 'editor-header',
  imports: [MuiButtonComponent, MuiPopoverComponent],
  templateUrl: './editor-header.html',
  styleUrl: './editor-header.scss',
})
export class EditorHeader {
  readonly e = inject(EditorService);
  readonly preview = output<void>();
  readonly mcpOpen = signal(false);
  readonly agentOutcomes = computed(() =>
    this.e.agentOutcomes().filter((o) => o.documentId === this.e.doc().id),
  );
  readonly modes = ['Design', 'Prototype', 'Developer'] as const;
  readonly editing = signal<string | null>(null);
  readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  startPreview(event: MouseEvent) {
    (event.currentTarget as HTMLElement).focus();
    this.preview.emit();
  }
  constructor() {
    effect(() => {
      const input = this.nameInput()?.nativeElement;
      if (input) {
        input.focus();
        input.select();
      }
    });
  }
  rename(id: string) {
    if (id === this.e.doc().id) this.editing.set(id);
  }
  finishRename(event: Event) {
    if (!this.editing()) return;
    const name = (event.target as HTMLInputElement).value.trim();
    this.editing.set(null);
    if (name && name !== this.e.doc().name) this.e.perform([{ type: 'document.rename', name }]);
  }
  cancelRename(event: Event) {
    event.preventDefault();
    this.editing.set(null);
  }
  async activate(id: string) {
    this.editing.set(null);
    await this.e.switchFile(id);
  }
  dragHeader(event: MouseEvent) {
    if (
      this.e.native &&
      event.button === 0 &&
      !(event.target as HTMLElement).closest(
        'button, input, select, .file-tab, mui-button, mui-popover, .mcp-details',
      )
    ) {
      void this.e.bridge('window.drag').catch((error) => this.e.report(error));
    }
  }
}
