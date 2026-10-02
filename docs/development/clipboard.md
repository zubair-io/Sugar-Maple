# Editable clipboard transport

Editable copy produces version-two `sugar-maple-elements` JSON, including subtree/master/token/assets dependencies. Browser copy uses plain text because custom MIME availability varies. Native copy carries the same text in both `public.utf8-plain-text` and `io.zubair.sugarmaple.elements` representations on one NSPasteboard item; ordinary code/name copy uses text only. The custom UTI conforms to public JSON and is not a document-opening association.

Native reads prefer the custom representation. When it is absent, the plain-text fallback is read, supporting browser or older app exchange. Invalid structured data rejects explicitly rather than silently choosing an unrelated fallback. The native transport accepts format/version envelopes 1 and 2, validates UTF-8 and a 32 MiB bound, and leaves full scene/dependency/asset validation to the shared editor parser. Existing atomic paste/node/asset limits still apply. No JavaScript, Swift or HTML is executed by this transport.

`clipboard.write` receives `{text, format: 'editable' | 'text'}`; omitted format is legacy text. `clipboard.read` returns `{text}`. Validation occurs before clipboard clearing, and native write failures propagate to the editor. The same body enters only through the existing trusted authoring bridge.

Run `bun src/web/tests/file-menu-e2e.ts` against the dev server and, after `bun run build:mac`, `bun tools/native-acceptance.ts`. The native clipboard fixture uses a private named pasteboard and inspects the real built type declaration. Browser native-I/O stubs validate editor routing but are not evidence of macOS cross-app or clipboard-permission behavior. Full #18 manual/denied/cross-app/external-import acceptance remains tracked separately.
