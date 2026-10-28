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
  readonly mcpURL = signal('');
  readonly canCopyToken = signal(false);
  readonly copyingConnection = signal(false);
  readonly connectionFeedback = signal('');
  async toggleMCP() {
    this.mcpOpen.update((open) => !open);
    this.connectionFeedback.set('');
    if (!this.mcpOpen() || !this.e.native) return;
    this.canCopyToken.set(false);
    try {
      const state = await this.e.bridge('status');
      this.e.mcp.set(state.status);
      this.mcpURL.set(state.mcpURL);
      this.canCopyToken.set(state.canCopyToken === true);
    } catch {
      this.connectionFeedback.set('Could not read MCP connection details. Close and reopen this panel to retry.');
    }
  }
  async copyConnection(kind: 'url' | 'token') {
    this.copyingConnection.set(true);
    this.connectionFeedback.set('');
    try {
      if (kind === 'token') await this.e.bridge('mcp.copyToken');
      else await this.e.bridge('clipboard.write', { text: this.mcpURL() });
      this.connectionFeedback.set(kind === 'token' ? 'Token copied. Paste it into your MCP client’s bearer token field.' : 'MCP URL copied.');
    } catch (error) {
      this.connectionFeedback.set(error instanceof Error ? error.message : 'Copy failed. Please try again.');
    } finally {
      this.copyingConnection.set(false);
    }
  }
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
