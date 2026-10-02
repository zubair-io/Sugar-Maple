import { Injectable, signal } from '@angular/core';

export type ChromeAppearance = 'dark' | 'light';
const preferenceKey = 'sugar-maple.chrome-appearance';

/** Local chrome preference; never participates in document state or undo. */
@Injectable({ providedIn: 'root' })
export class ChromeTheme {
  readonly appearance = signal<ChromeAppearance>(this.read());
  readonly options = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
  ];

  set(value: string): void {
    if (value !== 'dark' && value !== 'light') return;
    this.appearance.set(value);
    try {
      localStorage.setItem(preferenceKey, value);
    } catch {
      /* Storage may be unavailable. */
    }
  }

  private read(): ChromeAppearance {
    try {
      return localStorage.getItem(preferenceKey) === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  }
}
