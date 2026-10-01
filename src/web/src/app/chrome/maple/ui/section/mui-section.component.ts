import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

/** Shared collapsible inspector section used by editor chrome. */
@Component({
  selector: 'mui-section',
  standalone: true,
  templateUrl: './mui-section.component.html',
  styleUrl: './mui-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MuiSectionComponent {
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
  readonly sectionId = input.required<string>();
  readonly open = signal(true);

  toggle(): void {
    this.open.update((open) => !open);
  }
}
