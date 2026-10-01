// Narrow type surface of Just-Maple's whiteboard schema. No host/server services.
export interface Camera { x:number; y:number; zoom:number }
export type WhiteboardToolType='select'|'pen'|'line'|'rectangle'|'ellipse'|'arrow'|'text'|'eraser';
export interface WhiteboardAwarenessState { user?:{id:string;color?:string}; selectedIds?:string[]; pendingStroke?:{points:{x:number;y:number;pressure?:number}[];color:string;size:number}; pendingShape?:{startPoint:{x:number;y:number};endPoint:{x:number;y:number}} }
export interface Base { id:string;createdBy:string;createdAt:number;updatedAt:number;transform:{x:number;y:number;rotation:number;scaleX:number;scaleY:number} }
export interface StrokeElement extends Base {type:'stroke';points:{x:number;y:number;pressure?:number}[];style:{color:string;size:number;opacity?:number} }
export interface ShapeElement extends Base {type:'shape';shapeType:'rectangle'|'ellipse'|'line'|'arrow';width:number;height:number;style:{strokeColor:string;fillColor?:string;strokeWidth:number;opacity?:number} }
export interface TextElement extends Base {type:'text';content:string;fontSize:number;fontFamily:string;color:string}
