import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EditorService } from '../editor.service';
import { DocumentStore } from '../model/store';
import { repeatCells, repeatTargets } from '../model/repeat';
import { parseRepeatData, repeatImportOperations } from '../model/repeat-data';
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
        >CSV or JSON file<input
          type="file"
          aria-label="Grid data file"
          accept=".csv,.json,text/csv,application/json"
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
      background: #242428;
      border: 1px solid #555;
      border-radius: 4px;
      color: inherit;
    }
    .dimensions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .hint {
      color: #aaa;
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
      border: 1px solid #555;
      overflow-wrap: anywhere;
      text-align: left;
    }
    button {
      padding: 6px;
      border: 1px solid #555;
      border-radius: 4px;
      background: #333;
      color: inherit;
    }
    button:disabled {
      opacity: 0.5;
    }
    [role='alert'] {
      color: #fca5a5;
    }
  `,
})
export class RepeatInspector {
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
  invalidate() {
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
  async readData(event: Event) {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0];
    this.invalidate();
    const serial = this.serial;
    try {
      if (file) {
        if (file.size > 1_000_000) throw Error('Data file exceeds 1 MB');
        const text = await file.text();
        if (serial !== this.serial) return;
        this.format = file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv';
        this.text.set(text);
        this.parse();
      }
    } catch (error) {
      this.fail(error);
    } finally {
      input.value = '';
    }
  }
  async readImages(event: Event) {
    const input = event.target as HTMLInputElement,
      files = [...(input.files ?? [])];
    this.invalidate();
    this.images = {};
    const serial = this.serial;
    this.busy.set(true);
    try {
      if (files.length > 100) throw Error('Choose at most 100 local images');
      const images: Record<string, string> = {};
      let total = 0;
      for (const file of files) {
        if (Object.hasOwn(images, file.name)) throw Error('Duplicate image filename: ' + file.name);
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5_000_000)
          throw Error('Choose PNG, JPEG or WebP images at most 5 MB each');
        total += file.size;
        if (total > 8_000_000) throw Error('Chosen images exceed 8 MB');
        images[file.name] = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(Error('Image could not be read'));
          reader.readAsDataURL(file);
        });
      }
      if (serial === this.serial) this.images = images;
    } catch (error) {
      if (serial === this.serial) this.fail(error);
    } finally {
      this.busy.set(false);
      input.value = '';
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
      this.busy.set(false);
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
      this.busy.set(false);
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
