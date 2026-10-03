import { Component, computed, effect, inject, input, signal, type OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EditorService } from '../editor.service';
import { DocumentStore } from '../model/store';
import { repeatCells, repeatTargets } from '../model/repeat';
import { parseRepeatData, repeatImportOperations } from '../model/repeat-data';
import { embeddedAsset } from '../model/assets';
import {
  collectRepeatDrop,
  readRepeatFiles,
  repeatFileList,
  orderedImageData,
  type RepeatFile,
} from './repeat-files';
import { supportsRepeatHandles } from './repeat-geometry';
import { type SceneNode, type Operation, uid } from '../model/schema';

@Component({
  selector: 'repeat-inspector',
  imports: [FormsModule],
  template: `
    <section aria-label="Repeat Grid data">
      <h3>Repeat Grid</h3>
      <p>{{ cells().length }} cells · row-major order, left to right then down</p>
      <div class="dimensions">
        <label
          >Rows<input aria-label="Grid rows" type="number" min="1" max="100" [(ngModel)]="rows"
        /></label>
        <label
          >Columns<input
            aria-label="Grid columns"
            type="number"
            min="1"
            max="20"
            [(ngModel)]="columns"
        /></label>
      </div>
      <button (click)="resize()">Resize grid</button>
      @if (hasCanvasControls()) {
        <p class="hint">
          Use the green Canvas controls to repeat columns/rows or adjust gutters. Their arrow keys
          and Home/End provide keyboard alternatives.
        </p>
      } @else {
        <p class="hint">
          Canvas repeat controls require fixed grid and template dimensions. Set their width and
          height sizing to Fixed, or use the row and column fields here.
        </p>
      }
      <button (click)="editTemplate()">Edit template</button>
      <p class="hint">
        Resizing keeps surviving cell IDs and data. New cells use the template; shrinking removes
        the last cells. Maximum 100 cells.
      </p>
      <div
        class="drop-zone"
        role="region"
        aria-label="Drop Repeat Grid files"
        [class.drop-active]="dropActive()"
        [attr.aria-busy]="busy()"
        (dragover)="dragOver($event)"
        (dragleave)="dropActive.set(false)"
        (drop)="dropFiles($event)"
      >
        <p>Drop CSV, JSON, a text list, local images or an image folder here.</p>
        <p class="hint">
          Choose files below for the same workflow. Review field mappings and preview before
          applying. Images use filename order, then cells left to right and down.
        </p>
      </div>
      <label
        >Choose image folder<input
          type="file"
          multiple
          webkitdirectory
          aria-label="Grid image folder"
          (change)="readImages($event)"
      /></label>
      <label
        >Data format<select
          aria-label="Grid data format"
          [(ngModel)]="format"
          (ngModelChange)="invalidate()"
        >
          <option value="csv">CSV</option>
          <option value="json">JSON</option>
        </select></label
      >
      <label
        >CSV, JSON or text file<input
          type="file"
          aria-label="Grid data file"
          accept=".csv,.json,.txt,text/csv,application/json,text/plain"
          (change)="readData($event)"
      /></label>
      <label
        >Named grid data<textarea
          aria-label="Named grid data"
          [ngModel]="text()"
          (ngModelChange)="text.set($event); invalidate()"
          placeholder="title,photo&#10;First,first.png"
        ></textarea>
      </label>
      <button (click)="parse()">Read fields</button>
      @if (data(); as source) {
        <h4>Field mapping</h4>
        @for (target of targets(); track target.id + ':' + target.property) {
          <label
            >{{ target.name }} · {{ target.property }}
            <select
              [attr.aria-label]="'Map ' + target.name + ' ' + target.property"
              [(ngModel)]="mapping[target.id + ':' + target.property]"
              (ngModelChange)="invalidate()"
            >
              <option value="">Do not import</option>
              @for (field of source.fields; track field) {
                <option [value]="field">{{ field }}</option>
              }
            </select>
          </label>
        }
        <label
          >Local images<input
            type="file"
            multiple
            aria-label="Grid local images"
            accept="image/png,image/jpeg,image/webp"
            (change)="readImages($event)"
        /></label>
        <p class="hint">
          Image fields name an exact chosen file, such as first.png. PNG, JPEG or WebP, at most 5 MB
          each and 8 MB shared per document. Paths and URLs are rejected.
        </p>
        <label
          >Missing or empty values<select
            aria-label="Grid missing values"
            [(ngModel)]="missing"
            (ngModelChange)="invalidate()"
          >
            <option value="retain">Keep current value</option>
            <option value="clear">Clear mapped value</option>
            <option value="error">Reject import</option>
          </select></label
        >
        <label class="check"
          ><input type="checkbox" [(ngModel)]="truncate" (ngModelChange)="invalidate()" /> Allow
          truncation of rows beyond the grid</label
        >
        <p>
          {{ source.rows.length }} data rows ·
          {{ Math.min(source.rows.length, cells().length) }} cells to update ·
          {{ Math.max(0, source.rows.length - cells().length) }} rows beyond capacity
        </p>
        <p class="hint">
          Only mapped fields change. Unmapped fields and cells after the final row remain unchanged.
          Empty CSV cells, absent JSON fields and empty strings use the missing-value rule. JSON
          values must be strings.
        </p>
        <button [disabled]="busy()" (click)="preview()">Preview import</button>
        <button (click)="cancel()">Cancel import</button>
      }
      @if (prepared(); as ready) {
        <div role="status">Import validated · {{ ready.count }} cells · one undoable batch</div>
        <table aria-label="Grid mapping preview">
          <thead>
            <tr>
              <th>Cell</th>
              @for (field of ready.labels; track field) {
                <th>{{ field }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of ready.preview; track $index) {
              <tr>
                <td>{{ $index + 1 }}</td>
                @for (value of row; track $index) {
                  <td>{{ value }}</td>
                }
              </tr>
            }
          </tbody>
        </table>
        <p class="hint">
          Showing the first {{ ready.preview.length }} rows. {{ ready.ignored }} source fields are
          not mapped.
        </p>
        <button [disabled]="busy()" (click)="apply()">Apply grid data</button>
      }
      @if (message()) {
        <p role="alert">{{ message() }}</p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    section {
      display: grid;
      gap: 10px;
      padding: 12px 0;
    }
    h3,
    h4,
    p {
      margin: 0;
    }
    h3 {
      font-size: 14px;
    }
    h4,
    label,
    button,
    p,
    table {
      font-size: 12px;
    }
    label {
      display: grid;
      gap: 5px;
    }
    textarea {
      min-height: 96px;
      resize: vertical;
    }
    input,
    textarea,
    select {
      min-width: 0;
      max-width: 100%;
      width: 100%;
      padding: 6px;
      background: var(--chrome-control-bg, var(--color-input-bg));
      border: 1px solid var(--color-border);
      border-radius: 4px;
      color: inherit;
    }
    .drop-zone {
      padding: 10px;
      border: 1px dashed var(--color-border-hi);
      border-radius: 4px;
      display: grid;
      gap: 6px;
    }
    .drop-zone > p {
      pointer-events: none;
    }
    .drop-active {
      border-color: var(--color-success-text);
      background: var(--color-success-bg);
    }
    .dimensions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .hint {
      color: var(--color-text-muted);
      line-height: 1.5;
    }
    .check {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .check input {
      width: auto;
    }
    table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
    }
    td,
    th {
      padding: 4px;
      border: 1px solid var(--color-border);
      overflow-wrap: anywhere;
      text-align: left;
    }
    button {
      padding: 6px;
      border: 1px solid var(--color-border);
      border-radius: 4px;
      background: var(--color-surface);
      color: inherit;
    }
    input:focus-visible,
    textarea:focus-visible,
    select:focus-visible,
    button:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }
    button:enabled:hover {
      background: var(--color-surface-hover);
    }
    button:disabled {
      opacity: 0.5;
    }
    [role='alert'] {
      color: var(--color-error-text);
    }
  `,
})
export class RepeatInspector implements OnDestroy {
  readonly e = inject(EditorService);
  readonly grid = input.required<SceneNode>();
  readonly Math = Math;
  readonly hasCanvasControls = computed(() => supportsRepeatHandles(this.e.doc(), this.grid()));
  readonly cells = computed(() => repeatCells(this.e.doc(), this.grid().id));
  readonly targets = computed(() => repeatTargets(this.e.doc(), this.grid().id));
  rows = 1;
  columns = 1;
  format: 'csv' | 'json' = 'csv';
  missing: 'retain' | 'clear' | 'error' = 'retain';
  truncate = false;
  readonly text = signal('');
  readonly data = signal<ReturnType<typeof parseRepeatData> | null>(null);
  readonly message = signal('');
  readonly busy = signal(false);
  readonly dropActive = signal(false);
  private reader: AbortController | null = null;
  private images: Record<string, string> = {};
  mapping: Record<string, string> = {};
  readonly prepared = signal<{
    operations: Operation[];
    documentId: string;
    revision: number;
    count: number;
    labels: string[];
    preview: string[][];
    ignored: number;
  } | null>(null);
  private serial = 0;
  constructor() {
    effect(() => {
      this.grid().id;
      this.e.revision();
      this.rows = Math.ceil(this.cells().length / this.grid().columns);
      this.columns = this.grid().columns;
      this.invalidate();
    });
  }
  ngOnDestroy() {
    this.invalidate();
  }
  invalidate() {
    this.reader?.abort();
    this.reader = null;
    this.busy.set(false);
    this.dropActive.set(false);
    this.serial++;
    this.prepared.set(null);
    this.message.set('');
  }
  resize() {
    this.invalidate();
    this.e.perform([
      { type: 'repeat.resize', id: this.grid().id, rows: this.rows, columns: this.columns },
    ]);
  }
  editTemplate() {
    const template = this.e.doc().nodes.find((n) => n.id === this.grid().repeatTemplateId);
    if (template?.hidden && template.repeatIndex === null && template.isComponent) {
      this.e.select(template.id);
      return;
    }
    const result = this.e.perform([{ type: 'repeat.prepare', id: this.grid().id }]);
    if (result) this.e.select(result.ids[0]);
  }
  parse() {
    this.invalidate();
    try {
      this.data.set(parseRepeatData(this.text(), this.format));
      this.mapping = {};
    } catch (error) {
      this.data.set(null);
      this.fail(error);
    }
  }
  dragOver(event: DragEvent) {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    this.dropActive.set(true);
  }
  async dropFiles(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dropActive.set(false);
    if (!event.dataTransfer) return;
    const transfer = event.dataTransfer;
    await this.stageFiles((signal) => collectRepeatDrop(transfer, signal), true);
  }
  async readData(event: Event) {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0];
    if (file) await this.stageFiles(async () => repeatFileList([file]), false);
    input.value = '';
  }
  async readImages(event: Event) {
    const input = event.target as HTMLInputElement,
      files = repeatFileList(input.files ?? []);
    if (files.length) await this.stageFiles(async () => files, false);
    input.value = '';
  }
  private async stageFiles(
    collect: (signal: AbortSignal) => Promise<RepeatFile[]>,
    decode: boolean,
  ) {
    this.invalidate();
    const serial = this.serial,
      reader = new AbortController();
    this.reader = reader;
    this.busy.set(true);
    try {
      const staged = await readRepeatFiles(await collect(reader.signal), reader.signal);
      if (decode)
        await this.e.validateAssetOperations(
          Object.values(staged.images).map((source) => {
            const asset = embeddedAsset(source);
            return { type: 'asset.set', key: asset.key, source: asset.source };
          }),
        );
      if (serial !== this.serial || reader.signal.aborted) return;
      if (staged.data) {
        this.data.set(staged.data);
        this.text.set(staged.text!);
        this.format = staged.format!;
        this.mapping = {};
      } else if (!this.data() && staged.imageNames.length) {
        const data = orderedImageData(staged.imageNames);
        this.data.set(data);
        this.text.set(JSON.stringify(data.rows));
        this.format = 'json';
        this.mapping = {};
      }
      if (staged.imageNames.length) this.images = staged.images;
    } catch (error) {
      if (serial === this.serial && !reader.signal.aborted) this.fail(error);
    } finally {
      if (serial === this.serial) {
        this.busy.set(false);
        this.reader = null;
      }
    }
  }
  async preview() {
    this.invalidate();
    const data = this.data();
    if (!data) return;
    const serial = this.serial,
      documentId = this.e.doc().id,
      revision = this.e.revision();
    this.busy.set(true);
    try {
      const fields = this.targets().flatMap((target) => {
        const field = this.mapping[target.id + ':' + target.property];
        return field ? [{ field, targetId: target.id, property: target.property }] : [];
      });
      const operations = repeatImportOperations(
        this.grid().id,
        data,
        fields,
        this.images,
        this.missing,
        this.truncate,
      );
      await this.e.validateAssetOperations(operations);
      if (
        serial !== this.serial ||
        revision !== this.e.revision() ||
        documentId !== this.e.doc().id
      )
        return;
      const check = DocumentStore.fromCheckpoint(this.e.store.checkpoint());
      check.transact({ documentId, expectedRevision: revision, requestId: uid(), operations });
      this.prepared.set({
        operations,
        documentId,
        revision,
        count: Math.min(data.rows.length, this.cells().length),
        labels: fields.map(
          (f) =>
            f.field +
            ' → ' +
            this.targets().find((t) => t.id === f.targetId && t.property === f.property)!.name,
        ),
        preview: data.rows
          .slice(0, Math.min(8, this.cells().length))
          .map((row) => fields.map((f) => row[f.field] || `(${this.missing})`)),
        ignored: data.fields.filter((f) => !fields.some((m) => m.field === f)).length,
      });
    } catch (error) {
      if (serial === this.serial) this.fail(error);
    } finally {
      if (serial === this.serial) this.busy.set(false);
    }
  }
  async apply() {
    const ready = this.prepared();
    if (!ready) return;
    const serial = this.serial;
    this.busy.set(true);
    try {
      await this.e.performDecoded(
        ready.operations,
        ready.documentId,
        ready.revision,
        () => serial === this.serial,
      );
      this.cancel();
    } catch (error) {
      this.fail(error);
    } finally {
      if (serial === this.serial) this.busy.set(false);
    }
  }
  cancel() {
    this.invalidate();
    this.data.set(null);
    this.text.set('');
    this.images = {};
    this.mapping = {};
  }
  private fail(error: unknown) {
    this.message.set(error instanceof Error ? error.message : String(error));
    this.prepared.set(null);
  }
}
