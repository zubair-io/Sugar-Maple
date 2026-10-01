import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
// The preview route instantiates no editor service, recovery store, or native
// authoring bridge. Native navigation keeps this window on that route.
if (location.hash === '#preview') {
  import('./app/canvas/preview-application').then(({ PreviewApplication }) =>
    bootstrapApplication(PreviewApplication, appConfig)).catch(console.error);
} else {
  window.sugarMaple = { ready: false };
  import('./app/app').then(({ App }) => bootstrapApplication(App, appConfig)).catch(console.error);
}
