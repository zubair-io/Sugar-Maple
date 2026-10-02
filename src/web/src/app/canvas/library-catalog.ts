import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { KeyValuePipe } from '@angular/common';
import { EditorService } from '../editor.service';
import { DocumentStore } from '../model/store';
import {
  libraryKey,
  libraryProps,
  validateManifest,
  type LibraryManifest,
  type LibraryValue,
} from '../model/library-schema';
import { webAwesomeManifest } from '../model/bundled-library';
import { type Operation, uid } from '../model/schema';
import { libraryAppearance } from '../model/library-appearance';

@Component({
  selector: 'library-catalog',
  imports: [FormsModule, KeyValuePipe],
  template: `
    @if (!inspector()) {
      <section aria-label="Component libraries">
        <h3>Component libraries</h3>
        <p>Import a pinned manifest. Design and preview remain editable semantic components.</p>
        <label
          >Library manifest file<input
            type="file"
            accept=".json,application/json"
            aria-label="Library manifest file"
            (change)="read($event)"
        /></label>
        <label
          >Library manifest<textarea
            aria-label="Library manifest"
            [ngModel]="source()"
            (ngModelChange)="editSource($event)"
            placeholder="Paste a version 1 library manifest"
          ></textarea>
        </label>
        <button [disabled]="e.mode() !== 'Design'" (click)="preview(source())">
          Validate library
        </button>
        <button [disabled]="e.mode() !== 'Design'" (click)="previewExample()">
          Preview Web Awesome 3.14.0
        </button>
        @if (fileName()) {
          <p>Loaded {{ fileName() }}</p>
        }
        @if (pending(); as ready) {
          <div role="status">
            Validated {{ ready.manifest.name }} {{ ready.manifest.package.version }} ·
            {{ componentNames(ready.manifest).length }} components
          </div>
          <p>{{ ready.manifest.package.name }} · exact dependency versions · metadata only</p>
          <button [disabled]="e.mode() !== 'Design'" (click)="apply()">Import library</button>
          <button (click)="cancel()">Cancel library import</button>
        }
        @for (library of e.doc().libraries | keyvalue; track library.key) {
          <h4>{{ library.value.name }} {{ library.value.package.version }}</h4>
          <p>Mapping {{ library.value.revision }} · {{ library.value.package.name }}</p>
          @for (name of componentNames(library.value); track name) {
            <button
              [disabled]="e.mode() !== 'Design'"
              [attr.aria-label]="'Insert library ' + name + ' ' + library.key"
              (click)="insert(library.key, name)"
            >
              {{ name }}
            </button>
          }
        }
      </section>
    } @else if (e.node()?.libraryRef; as ref) {
      <section aria-label="Library component identity">
        <h3>Library component</h3>
        <p>{{ ref.key }} / {{ ref.component }}</p>
        @if (manifest(); as m) {
          <p>
            {{ m.package.name }} · {{ m.package.version }} ·
            {{ component()?.web?.symbol || 'Web unsupported' }} ·
            {{ component()?.swift?.symbol || 'Swift unsupported' }}
          </p>
          @if (appearance(); as support) {
            <section aria-label="Library appearance diagnostics" class="appearance">
              <p>Canvas and Preview use authored semantic appearance.</p>
              <p>Source: {{ support.source }}</p>
              <p>Package appearance is shown only in the isolated library preview experiment.</p>
              @if (support.appearance.length) {
                <p>
                  Source appearance:
                  @for (property of support.appearance; track property.name) {
                    <span>{{ property.name }} = {{ property.value }} </span>
                  }
                </p>
              }
              <p [attr.data-supported]="support.web.available">
                Mapped web copy: {{ support.web.message }}
              </p>
              <p [attr.data-supported]="support.swift.available">
                Mapped SwiftUI copy (macOS): {{ support.swift.message }}
              </p>
              <div role="status" aria-label="Native library preview support">
                @if (support.native.length) {
                  <p>Isolated native preview:</p>
                  @for (diagnostic of support.native; track diagnostic) {
                    <p>{{ diagnostic }}</p>
                  }
                } @else {
                  <p>
                    Isolated native preview: supported properties for {{ ref.variant }}. Native
                    control appearance differs from Canvas and the web package.
                  </p>
                }
              </div>
            </section>
          }
          @if (component(); as c) {
            <label
              >Library variant<select
                aria-label="Library variant"
                [ngModel]="ref.variant"
                (ngModelChange)="variant($event)"
                [disabled]="e.mode() !== 'Design'"
              >
                @for (name of variantNames(); track name) {
                  <option [value]="name">{{ name }}</option>
                }
              </select></label
            >
            @for (entry of c.props | keyvalue; track entry.key) {
              <label
                >{{ entry.key }}
                @if (entry.value.type === 'boolean') {
                  <input
                    type="checkbox"
                    [attr.aria-label]="'Library prop ' + entry.key"
                    [checked]="effective()[entry.key]"
                    (change)="prop(entry.key, $event, 'boolean')"
                    [disabled]="e.mode() !== 'Design'"
                  />
                } @else if (entry.value.type === 'enum') {
                  <select
                    [attr.aria-label]="'Library prop ' + entry.key"
                    [ngModel]="effective()[entry.key]"
                    (ngModelChange)="setProp(entry.key, $event)"
                    [disabled]="e.mode() !== 'Design'"
                  >
                    @for (value of entry.value.values; track value) {
                      <option [value]="value">{{ value }}</option>
                    }
                  </select>
                } @else {
                  <input
                    [type]="entry.value.type === 'number' ? 'number' : 'text'"
                    [attr.aria-label]="'Library prop ' + entry.key"
                    [value]="effective()[entry.key]"
                    (change)="prop(entry.key, $event, entry.value.type)"
                    [disabled]="e.mode() !== 'Design'"
                  />
                }
              </label>
            }
            <p>
              Local semantic overrides: {{ ref.localOverrides.join(', ') || 'none' }}. Source props
              stay pinned; local overrides apply to semantic design. Mapped copy support is listed
              above.
            </p>
            <button [disabled]="e.mode() !== 'Design'" (click)="reset()">
              Reset library overrides
            </button>
            <label
              >Remap library version<select
                aria-label="Remap library version"
                [ngModel]="ref.key"
                (ngModelChange)="remap($event)"
                [disabled]="e.mode() !== 'Design'"
              >
                @for (entry of compatible(); track entry.key) {
                  <option [value]="entry.key">{{ entry.key }}</option>
                }
              </select></label
            >
          }
        } @else {
          <p role="status">
            Library metadata is missing. This semantic component is still editable; mapped output
            requires the pinned manifest.
          </p>
        }
      </section>
    }
    @if (inspector() && e.mode() === 'Design' && parentSlots().length) {
      <label
        >Parent library slot<select
          aria-label="Parent library slot"
          [ngModel]="e.node()?.librarySlot || ''"
          (ngModelChange)="slot($event)"
        >
          @for (name of parentSlots(); track name) {
            <option [value]="name">{{ name || 'Default content' }}</option>
          }
        </select></label
      >
    }

    @if (message()) {
      <p role="alert">{{ message() }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
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
    .appearance {
      padding: 8px 0;
      gap: 6px;
      border-block: 1px solid var(--chrome-border, #cbd5e1);
    }
    h3 {
      font-size: 14px;
    }
    h4,
    label,
    p {
      font-size: 12px;
    }
    p {
      line-height: 1.5;
      overflow-wrap: anywhere;
    }
    label {
      display: grid;
      gap: 4px;
    }
    input,
    select,
    textarea,
    button {
      font: inherit;
      min-width: 0;
      max-width: 100%;
    }
    input,
    select,
    textarea {
      padding: 7px;
      border: 1px solid var(--chrome-border, #cbd5e1);
      border-radius: 6px;
      background: var(--chrome-surface, #fff);
      color: var(--chrome-text, #111827);
    }
    textarea {
      min-height: 90px;
    }
    button {
      padding: 7px;
      cursor: pointer;
    }
    input[type='checkbox'] {
      justify-self: start;
    }
    button:disabled {
      cursor: default;
      opacity: 0.6;
    }
  `,
})
export class LibraryCatalog {
  readonly e = inject(EditorService);
  readonly inspector = input(false);
  readonly source = signal('');
  readonly fileName = signal('');
  readonly message = signal('');
  readonly pending = signal<{
    manifest: LibraryManifest;
    documentId: string;
    revision: number;
  } | null>(null);
  readonly manifest = computed(() => {
    const ref = this.e.node()?.libraryRef;
    return ref ? (this.e.doc().libraries[ref.key] ?? null) : null;
  });
  readonly component = computed(() => {
    const ref = this.e.node()?.libraryRef;
    return ref ? (this.manifest()?.components[ref.component] ?? null) : null;
  });
  readonly effective = computed(() =>
    this.component() && this.e.node()?.libraryRef
      ? libraryProps(this.component()!, this.e.node()!.libraryRef!)
      : {},
  );
  readonly variantNames = computed(() => Object.keys(this.component()?.variants ?? {}));
  readonly appearance = computed(() => {
    const node = this.e.node();
    return node ? libraryAppearance(this.e.doc(), node) : null;
  });
  readonly compatible = computed(() =>
    Object.entries(this.e.doc().libraries)
      .filter(
        ([, m]) =>
          m.id === this.manifest()?.id &&
          m.components[this.e.node()?.libraryRef?.component ?? '']?.semanticKind ===
            this.e.node()?.kind,
      )
      .map(([key]) => ({ key })),
  );
  readonly parentSlots = computed(() => {
    const node = this.e.doc().nodes.find((n) => n.id === this.e.node()?.parentId),
      ref = node?.libraryRef;
    return ref ? (this.e.doc().libraries[ref.key]?.components[ref.component]?.slots ?? []) : [];
  });
  private serial = 0;
  constructor() {
    effect(() => {
      const current = this.pending();
      if (
        current &&
        (current.documentId !== this.e.doc().id || current.revision !== this.e.revision())
      )
        this.pending.set(null);
    });
  }
  componentNames(manifest: LibraryManifest) {
    return Object.keys(manifest.components);
  }
  private attempt(action: () => void) {
    this.message.set('');
    try {
      action();
    } catch (e) {
      this.message.set(e instanceof Error ? e.message : String(e));
    }
  }
  async read(event: Event) {
    const control = event.target as HTMLInputElement,
      file = control.files?.[0];
    if (!file) return;
    control.value = '';
    const serial = ++this.serial,
      documentId = this.e.doc().id,
      revision = this.e.revision();
    this.pending.set(null);
    this.message.set('');
    try {
      if (file.size > 1_000_000) throw Error('Library manifest exceeds 1 MB');
      const text = await file.text();
      if (
        serial !== this.serial ||
        documentId !== this.e.doc().id ||
        revision !== this.e.revision()
      )
        return;
      this.source.set(text);
      this.fileName.set(file.name);
      this.preview(text);
    } catch (e) {
      if (serial === this.serial) this.message.set(e instanceof Error ? e.message : String(e));
    }
  }
  editSource(text: string) {
    this.fileName.set('');
    ++this.serial;
    this.source.set(text);
    this.pending.set(null);
  }
  previewExample() {
    this.fileName.set('');
    ++this.serial;
    this.source.set(JSON.stringify(webAwesomeManifest, null, 2));
    this.preview(this.source());
  }
  preview(text: string) {
    this.pending.set(null);
    this.attempt(() => {
      if (new TextEncoder().encode(text).length > 1_000_000)
        throw Error('Library manifest exceeds 1 MB');
      const manifest = validateManifest(JSON.parse(text));
      const probe = DocumentStore.fromCheckpoint(this.e.store.checkpoint());
      probe.transact({
        documentId: probe.document.id,
        expectedRevision: probe.revision,
        requestId: uid(),
        operations: [{ type: 'library.import', manifest }],
      });
      this.pending.set({ manifest, documentId: this.e.doc().id, revision: this.e.revision() });
    });
  }
  apply() {
    this.attempt(() => {
      const ready = this.pending();
      if (!ready || ready.documentId !== this.e.doc().id || ready.revision !== this.e.revision())
        throw Error('Document changed; validate the library again');
      this.e.command([{ type: 'library.import', manifest: ready.manifest }]);
      this.pending.set(null);
    });
  }
  cancel() {
    ++this.serial;
    this.source.set('');
    this.fileName.set('');
    this.pending.set(null);
    this.message.set('');
  }
  insert(key: string, component: string) {
    this.attempt(() => {
      const id = uid();
      this.e.command([
        {
          type: 'library.insert',
          key,
          component,
          id,
          pageId: this.e.pageId(),
          x: 40,
          y: 40,
          props: {},
        },
      ]);
      if (this.e.doc().nodes.some((n) => n.id === id)) this.e.select(id);
    });
  }
  private perform(operation: Operation) {
    this.attempt(() => this.e.command([operation]));
  }
  setProp(name: string, value: LibraryValue) {
    this.perform({ type: 'library.props', id: this.e.node()!.id, props: { [name]: value } });
  }
  prop(name: string, event: Event, type: string) {
    const input = event.target as HTMLInputElement;
    this.setProp(
      name,
      type === 'boolean' ? input.checked : type === 'number' ? Number(input.value) : input.value,
    );
  }
  variant(name: string) {
    this.perform({ type: 'library.props', id: this.e.node()!.id, props: {}, variant: name });
  }
  reset() {
    this.perform({ type: 'library.reset', id: this.e.node()!.id });
  }
  remap(key: string) {
    this.perform({ type: 'library.remap', id: this.e.node()!.id, key });
  }
  slot(name: string) {
    this.perform({ type: 'node.update', id: this.e.node()!.id, patch: { librarySlot: name } });
  }
}
