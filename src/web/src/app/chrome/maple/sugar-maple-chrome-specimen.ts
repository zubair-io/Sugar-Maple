import { Component, computed, inject, signal } from '@angular/core';
import {
  MuiButtonComponent,
  MuiInputComponent,
  MuiSelectComponent,
  MuiToolbarComponent,
  MuiTreeRowComponent,
  MuiInspectorPanelComponent,
  MuiFieldComponent,
  MuiSectionComponent,
  type MuiToolbarEntry,
} from './sugar-maple-chrome';

import { ChromeTheme } from './sugar-maple-chrome-theme';

/** Internal specimen route instantiates no editor service or native bridge. */
@Component({
  selector: 'app-root',
  host: { '[attr.data-chrome-theme]': 'theme.appearance()' },
  imports: [
    MuiButtonComponent,
    MuiInputComponent,
    MuiSelectComponent,
    MuiToolbarComponent,
    MuiTreeRowComponent,
    MuiInspectorPanelComponent,
    MuiFieldComponent,
    MuiSectionComponent,
  ],
  template: `
    <main class="maple-chrome specimen">
      <header>
        <mui-select
          ariaLabel="Chrome appearance"
          [value]="theme.appearance()"
          [options]="theme.options"
          (valueChange)="theme.set($event)"
        />
        <h1>Maple chrome specimen</h1>
        <p>Pinned chrome primitives · isolated from authored content</p>
      </header>
      <section aria-label="Buttons and inputs">
        <h2>Buttons and inputs</h2>
        <div class="examples">
          <mui-button variant="primary" (pressed)="count.set(count() + 1)">Primary</mui-button>
          <mui-button variant="secondary" (pressed)="count.set(count() + 1)">Secondary</mui-button>
          <mui-button variant="ghost" (pressed)="count.set(count() + 1)">Ghost</mui-button>
          <mui-button variant="destructive" (pressed)="count.set(count() + 1)"
            >Destructive</mui-button
          >
          <mui-button [disabled]="true">Disabled</mui-button>
          <mui-button [loading]="true">Loading</mui-button>
        </div>
        <p role="status">Activations: {{ count() }}</p>
        <mui-field label="Search"
          ><mui-input
            variant="search"
            ariaLabel="Specimen search"
            [value]="search()"
            (valueChange)="search.set($event)"
            (committed)="committed.set($event)"
            placeholder="Search layers"
        /></mui-field>
        <mui-field label="Numeric"
          ><mui-input
            variant="numeric"
            ariaLabel="Specimen numeric"
            [value]="numeric()"
            (valueChange)="numeric.set($event)"
            [min]="0"
            [max]="10"
            [step]="2"
        /></mui-field>
        <mui-field label="Read only"
          ><mui-input ariaLabel="Specimen read only" value="Pinned value" [readOnly]="true"
        /></mui-field>
        <mui-field label="Disabled"
          ><mui-input ariaLabel="Specimen disabled" value="Disabled input" [disabled]="true"
        /></mui-field>
        <mui-field label="Choice"
          ><mui-select
            ariaLabel="Specimen choice"
            [value]="choice()"
            (valueChange)="choice.set($event)"
            [options]="choices"
        /></mui-field>
        <mui-input ariaLabel="First invalid input" error="First field error" />
        <mui-input ariaLabel="Second invalid input" error="Second field error" />
        <p>Committed input: {{ committed() }}</p>
      </section>
      <section aria-label="Toolbar specimen">
        <h2>Toolbar and overflow</h2>
        <mui-toolbar [entries]="actions" [maxVisible]="2" (itemSelected)="lastAction.set($event)" />
        <p>Action: {{ lastAction() }}</p>
      </section>
      <section aria-label="Tree specimen">
        <h2>Tree and nested activation</h2>
        <div role="tree" aria-label="Specimen layers">
          <mui-tree-row
            label="Root frame"
            icon="folder"
            [expandable]="true"
            [expanded]="expanded()"
            (expandedChange)="expanded.set($event)"
            [count]="3"
            [active]="selected() === 'root'"
            (pressed)="selected.set('root')"
          />
          @if (expanded()) {
            <mui-tree-row
              label="Nested text"
              icon="folder"
              [depth]="1"
              [active]="selected() === 'text'"
              (pressed)="selected.set('text')"
            />
            <mui-tree-row
              label="Busy layer"
              icon="folder"
              [depth]="1"
              [expandable]="true"
              [expandBusy]="true"
              [loading]="true"
            />
            <mui-tree-row
              label="Disabled layer"
              icon="folder"
              [depth]="1"
              [disabled]="true"
              (pressed)="selected.set('disabled')"
            />
          }
        </div>
        <p>Selected: {{ selected() }}</p>
      </section>
      <section aria-label="Inspector specimen">
        <h2>Inspector and tabs</h2>
        <mui-button (pressed)="toggleExtraTab()">Toggle extra inspector tab</mui-button>
        <mui-inspector-panel
          title="Inspector"
          [tabs]="tabs()"
          [activeTabId]="activeTab()"
          (activeTabIdChange)="activeTab.set($event)"
          [showBack]="true"
          [showMore]="true"
          (back)="lastAction.set('back')"
          (more)="lastAction.set('more')"
        >
          <div role="tabpanel" [attr.aria-label]="activeTab()">
            <mui-section
              title="Properties"
              sectionId="specimen-properties"
              description="Projected content"
              ><p>Active inspector tab: {{ activeTab() }}</p></mui-section
            >
          </div>
        </mui-inspector-panel>
      </section>
    </main>
    <section
      aria-label="Isolated authored fixture"
      class="authored"
      style="background:#ffffff;color:#123456;font-family:Georgia,serif;padding:24px"
    >
      <h2>Authored fixture</h2>
      <div class="flex bg-primary p-4" data-testid="unscoped-classes">
        <button style="color:#ffffff;background:#176644;font-family:Georgia,serif">
          Independent UI
        </button>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      overflow: auto;
      padding: 28px;
      background: var(--color-bg);
    }
    :host([data-chrome-theme='light']) {
      background: #fafaf9;
    }
    .specimen {
      max-width: 980px;
      margin: auto;
      display: grid;
      gap: 20px;
    }
    h1 {
      font-size: 24px;
      margin: 0 0 8px;
    }
    h2 {
      font-size: 17px;
      margin: 0 0 16px;
    }
    p {
      font-size: 13px;
    }
    section {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 12px;
      padding: 20px;
    }
    .examples {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    mui-field {
      margin: 12px 0;
    }
    .authored {
      max-width: 980px;
      margin: 24px auto;
    }
  `,
})
export class SugarMapleChromeSpecimen {
  readonly theme = inject(ChromeTheme);
  readonly count = signal(0);
  readonly search = signal('');
  readonly numeric = signal('4');
  readonly committed = signal('');
  readonly choice = signal('first');
  readonly lastAction = signal('none');
  readonly selected = signal('root');
  readonly expanded = signal(true);
  readonly activeTab = signal('Details');
  readonly choices = [
    { value: 'first', label: 'First' },
    { value: 'second', label: 'Second' },
    { value: 'blocked', label: 'Disabled option', disabled: true },
  ];
  readonly actions: MuiToolbarEntry[] = [
    { id: 'create', label: 'Create', icon: 'plus' },
    { id: 'save', label: 'Save', icon: 'folder' },
    { id: 'export', label: 'Export', icon: 'share-up-square' },
    { id: 'blocked', label: 'Unavailable', icon: 'folder', disabled: true },
  ];
  readonly extraTab = signal(false);
  readonly tabs = computed(() => [
    { id: 'Details', label: 'Details' },
    { id: 'Comments', label: 'Comments' },
    ...(this.extraTab() ? [{ id: 'History', label: 'History' }] : []),
  ]);
  toggleExtraTab(): void {
    if (this.extraTab() && this.activeTab() === 'History') this.activeTab.set('Details');
    this.extraTab.update(value => !value);
  }
}
