import type * as Y from 'yjs';
import type {Awareness} from 'y-protocols/awareness';
// Only the canvas contract is reused. The Sugar Maple store owns authored data.
export interface WhiteboardYDoc { ydoc:Y.Doc; awareness:Awareness; metadata:Y.Map<unknown>;layers:Y.Array<Y.Map<unknown>>;elements:Y.Map<Y.Map<unknown>> }
