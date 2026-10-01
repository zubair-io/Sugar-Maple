import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Consistent label/value row for dense editor forms. */
@Component({
  selector: 'mui-field',
  standalone: true,
  template: '<label class="mui-field" [class.is-stacked]="stacked()"><span>{{ label() }}</span><ng-content /></label>',
  styleUrl: './mui-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MuiFieldComponent {
  readonly label = input.required<string>();
  readonly stacked = input(false);
}
