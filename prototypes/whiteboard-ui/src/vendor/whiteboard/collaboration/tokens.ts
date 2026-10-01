import {InjectionToken,Signal} from '@angular/core';
export const WHITEBOARD_USER_PROVIDER=new InjectionToken<{user:Signal<{_id:string}|null>}>('WHITEBOARD_USER_PROVIDER');
