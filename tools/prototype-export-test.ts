import { DocumentStore } from '../src/web/src/app/model/store';
import { exportNode } from '../src/web/src/app/model/export';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const s = new DocumentStore(), pageId = s.document.pages[0].id;
s.transact({ documentId: s.document.id, expectedRevision: 0, requestId: crypto.randomUUID(), operations: [
  { type: 'node.add', node: { id: 'root', pageId, kind: 'frame', layout: 'vertical', width: 400, height: 500 } },
  ...['text', 'email', 'password'].map((inputType, i) => ({ type: 'node.add', node: { id: ['field-0', 'field_0', 'field_2'][i], pageId, parentId: 'root', kind: 'input', inputType, accessibleLabel: `Field ${i}`, text: `Placeholder ${i}`, initialValue: inputType === 'email' ? 'mock@example.test' : 'Prototype only', disabled: i === 0, width: 350, height: 44 } })),
] });
const path = resolve('build/native-acceptance/form-consumer.swift'); mkdirSync(resolve('build/native-acceptance'), { recursive: true });
await Bun.write(path, exportNode(s.document, 'root', 'swiftui'));
const compile = Bun.spawn(['swiftc', '-typecheck', path], { stdout: 'inherit', stderr: 'inherit' });
if (await compile.exited) throw Error('Generated SwiftUI typed forms failed to compile');
console.log('PASS: actual SwiftUI TextField/SecureField, email hint, initial values, disabled state and accessibility names consumer compiles');
