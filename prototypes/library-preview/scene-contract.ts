import { z } from "../../src/web/node_modules/zod";
import { boundedPacket } from "./contract";
import { webAwesomeManifest as manifest } from "../../src/web/src/app/model/bundled-library";
import {
  LibraryBindingSchema,
  LibraryPropsSchema,
  libraryKey,
  libraryProps,
  sameManifest,
} from "../../src/web/src/app/model/library-schema";
import {
  validateDocument,
  NodeSchema,
  type SceneDocument,
} from "../../src/web/src/app/model/schema";
import { flatten, type Item } from "../../src/web/src/app/canvas/scene-layout";

export const SCENE_PROTOCOL = 2;
const id = z.string().min(1).max(128),
  color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const coordinate = z.number().finite().min(-10000).max(10000);
const component = z.enum(["Button", "Input", "Card"]);
const source = z
  .object({
    component,
    variant: z.string().min(1).max(80),
    props: LibraryPropsSchema,
    localOverrides: z.array(LibraryBindingSchema).max(20),
    tokens: z.partialRecord(
      z.literal("--wa-color-brand-fill-loud"),
      z
        .object({
          name: z
            .string()
            .min(1)
            .max(128)
            .regex(/^[\w.-]+$/),
          value: color,
        })
        .strict(),
    ),
  })
  .strict();
export const SceneElementSchema = z
  .object({
    id,
    parentId: id.nullable(),
    kind: z.enum(["frame", "text", "button", "input"]),
    slot: z.enum(["", "header", "footer"]),
    x: coordinate,
    y: coordinate,
    width: z.number().finite().min(1).max(1600),
    height: z.number().finite().min(1).max(2000),
    rotation: coordinate,
    text: z.string().max(20000),
    value: z
      .string()
      .max(20000)
      .regex(/^[^\r\n]*$/),
    label: z.string().max(200),
    disabled: z.boolean(),
    inputType: z.enum(["text", "email", "password"]),
    style: z
      .object({
        fill: color,
        fillEnabled: z.boolean(),
        color,
        stroke: color,
        strokeWidth: z.number().finite().min(0).max(50),
        radius: z.number().finite().min(0).max(500),
        opacity: z.number().finite().min(0).max(1),
        padding: z.number().finite().min(0).max(1000),
        gap: z.number().finite().min(0).max(1000),
        fontSize: z.number().finite().min(6).max(500),
        fontWeight: z.number().finite().min(100).max(900),
        fontFamily: z.enum(["system-ui", "sans-serif", "serif", "monospace"]),
        lineHeight: z.number().finite().min(0.5).max(5),
        letterSpacing: z.number().finite().min(-20).max(100),
        textAlign: z.enum(["auto", "left", "center", "right"]),
      })
      .strict(),
    library: source.nullable(),
  })
  .strict();
export const LibrarySceneSchema = z
  .object({
    documentId: id,
    sourceRevision: z.number().int().min(0).max(2147483647),
    rootId: id,
    width: z.number().finite().min(1).max(1600),
    height: z.number().finite().min(1).max(2000),
    elements: z.array(SceneElementSchema).min(1).max(100),
  })
  .strict();
export type LibraryScene = z.infer<typeof LibrarySceneSchema>;
export type SceneElement = z.infer<typeof SceneElementSchema>;
export const SceneSnapshotSchema = z
  .object({
    version: z.literal(SCENE_PROTOCOL),
    session: z.string().uuid(),
    revision: z.number().int().min(0).max(2147483647),
    kind: z.literal("render-scene"),
    scene: LibrarySceneSchema,
    reset: z.boolean(),
  })
  .strict();
export const SceneEventSchema = z.discriminatedUnion("kind", [
  z
    .object({
      version: z.literal(SCENE_PROTOCOL),
      session: z.string().uuid(),
      revision: z.number().int().min(0).max(2147483647),
      kind: z.literal("rendered"),
    })
    .strict(),
  z
    .object({
      version: z.literal(SCENE_PROTOCOL),
      session: z.string().uuid(),
      revision: z.number().int().min(0).max(2147483647),
      kind: z.literal("action"),
      nodeId: id,
    })
    .strict(),
  z
    .object({
      version: z.literal(SCENE_PROTOCOL),
      session: z.string().uuid(),
      revision: z.number().int().min(0).max(2147483647),
      kind: z.literal("change"),
      nodeId: id,
      value: z
        .string()
        .max(20000)
        .regex(/^[^\r\n]*$/),
    })
    .strict(),
  z
    .object({
      version: z.literal(SCENE_PROTOCOL),
      session: z.string().uuid(),
      revision: z.number().int().min(0).max(2147483647),
      kind: z.literal("error"),
      code: z.enum(["invalid_scene", "stale_revision", "runtime_error"]),
      message: z.string().max(200),
    })
    .strict(),
]);

export type SceneEvent = z.infer<typeof SceneEventSchema>;

// Platform chrome has intrinsic styling. These authored changes are rejected
// rather than silently accepted by a native control that cannot display them.
export const nativeSceneStyleSupport = {
  lineHeight: NodeSchema.shape.lineHeight.parse(undefined),
  input: {
    fill: NodeSchema.shape.fill.parse(undefined),
    fillEnabled: NodeSchema.shape.fillEnabled.parse(undefined),
    radius: NodeSchema.shape.radius.parse(undefined),
    strokeWidth: NodeSchema.shape.strokeWidth.parse(undefined),
    letterSpacing: NodeSchema.shape.letterSpacing.parse(undefined),
  },
};

/** The transport carries resolved presentation data, never commands, code or a writable document. */
export function validateLibraryScene(value: unknown): LibraryScene {
  const scene = LibrarySceneSchema.parse(boundedPacket(value));
  const seen = new Map<string, SceneElement>();
  for (const [index, node] of scene.elements.entries()) {
    if (seen.has(node.id)) throw Error("Duplicate preview node ID: " + node.id);
    if (index === 0) {
      if (
        node.id !== scene.rootId ||
        node.parentId !== null ||
        node.kind !== "frame" ||
        node.x !== 0 ||
        node.y !== 0 ||
        node.width !== scene.width ||
        node.height !== scene.height ||
        node.rotation !== 0 ||
        node.slot !== ""
      )
        throw Error(
          "Preview root must be an unrotated frame matching its declared viewport",
        );
    } else {
      const parent = seen.get(node.parentId ?? "");
      if (!parent || parent.kind !== "frame")
        throw Error("Preview nodes require an earlier frame parent");
      if (node.slot && parent.library?.component !== "Card")
        throw Error("Named preview slots require a mapped Card parent");
    }
    if (node.library) {
      const c = manifest.components[node.library.component];
      if (node.kind !== c.semanticKind)
        throw Error("Preview component kind does not match pinned mapping");
      if (
        Object.keys(node.library.props).length !==
          Object.keys(c.props).length ||
        Object.keys(c.props).some(
          (name) => !Object.hasOwn(node.library!.props, name),
        )
      )
        throw Error(
          "Preview scene requires complete resolved library properties",
        );
      libraryProps(c, node.library);
      const semantic = {
        text: node.text,
        initialValue: node.value,
        accessibleLabel: node.label,
        disabled: node.disabled,
        inputType: node.inputType,
        ...node.style,
      };
      for (const [name, property] of Object.entries(c.props))
        if (
          property.semantic &&
          node.library.props[name] !== semantic[property.semantic]
        )
          throw Error(
            "Preview source props disagree with resolved semantic property: " +
              name,
          );
      if (
        new Set(node.library.localOverrides).size !==
        node.library.localOverrides.length
      )
        throw Error("Duplicate preview overrides");
      if (
        node.library.component === "Card" &&
        scene.elements.some(
          (n) => n.parentId === node.id && !c.slots.includes(n.slot),
        )
      )
        throw Error("Unknown pinned Card slot");
    }
    seen.set(node.id, node);
  }
  return scene;
}

/** Use the editor's settled model projection from the same immutable source revision.
 * Resolved boxes retain stack/grid/fill/percent/hug geometry. No DOM scraping or intrinsic
 * package layout is used to reconstruct authoring semantics. */
export function projectLibraryScene(
  doc: SceneDocument,
  root: Item,
  sourceRevision: number,
): LibraryScene {
  validateDocument(doc);
  if (root.ancestors.some((item) => item.node.rotation !== 0))
    throw Error(
      "Preview root has rotated external ancestors; use semantic preview",
    );
  const originals = new Map(doc.nodes.map((n) => [n.id, n]));
  const items = flatten([root]);
  if (items.length > 100)
    throw Error("Preview supports at most 100 visible nodes");
  const elements = items.map((item) => {
    const n = originals.get(item.node.id);
    if (!n || JSON.stringify(n) !== JSON.stringify(item.node))
      throw Error("Layout/source changed; project the current revision again");
    if (!["frame", "artboard", "text", "button", "input"].includes(n.kind))
      throw Error(`${n.id}: unsupported preview kind ${n.kind}`);
    if (n.gradient)
      throw Error(
        `${n.id}: gradients are unsupported by this library preview; use semantic preview`,
      );
    if (
      !["system-ui", "sans-serif", "serif", "monospace"].includes(n.fontFamily)
    )
      throw Error(
        `${n.id}: unsupported preview font ${n.fontFamily}; use semantic preview`,
      );
    if (n.fillToken && !Object.hasOwn(doc.tokens, n.fillToken))
      throw Error(`${n.id}: missing fill token ${n.fillToken}`);
    let library: SceneElement["library"] = null;
    if (n.libraryRef) {
      const ref = n.libraryRef,
        pinned = doc.libraries[ref.key];
      if (
        ref.key !== libraryKey(manifest) ||
        !pinned ||
        !sameManifest(pinned, manifest) ||
        !Object.hasOwn(manifest.components, ref.component)
      )
        throw Error(
          `${n.id}: only the exact trusted Web Awesome 3.14.0 mapping can run in this preview`,
        );
      const c = manifest.components[ref.component],
        props = libraryProps(c, ref);
      // Semantic properties contain authored local overrides; library-only props retain
      // the pinned variant. Keep both identities so fallback paint cannot imply parity.
      for (const [name, p] of Object.entries(c.props))
        if (p.semantic)
          props[name] =
            p.semantic === "fill" && n.fillToken
              ? doc.tokens[n.fillToken]
              : n[p.semantic];
      const tokens: NonNullable<SceneElement["library"]>["tokens"] = {};
      for (const [variable, fallback] of Object.entries(pinned.tokenMappings)) {
        const name = ref.tokenBindings[variable] ?? fallback;
        if (Object.hasOwn(doc.tokens, name))
          tokens[variable as "--wa-color-brand-fill-loud"] = {
            name,
            value: doc.tokens[name],
          };
        else if (Object.hasOwn(ref.tokenBindings, variable))
          throw Error(`${n.id}: missing mapped token ${name}`);
      }
      library = {
        component: ref.component as "Button" | "Input" | "Card",
        variant: ref.variant,
        props,
        localOverrides: [...ref.localOverrides],
        tokens,
      };
    }
    const parent = item.ancestors.at(-1);
    return {
      id: n.id,
      parentId: item === root ? null : parent!.node.id,
      kind: n.kind === "artboard" ? "frame" : n.kind,
      slot: item === root ? "" : n.librarySlot,
      x: item === root ? 0 : item.x - parent!.x,
      y: item === root ? 0 : item.y - parent!.y,
      width: item.width,
      height: item.height,
      rotation: n.rotation,
      text: n.text,
      value: n.initialValue,
      label: n.accessibleLabel,
      disabled: n.disabled,
      inputType: n.inputType,
      library,
      style: {
        fill: n.fillToken ? doc.tokens[n.fillToken] : n.fill,
        fillEnabled: n.fillEnabled,
        color: n.color,
        stroke: n.stroke,
        strokeWidth: n.strokeWidth,
        radius: n.radius,
        opacity: n.opacity,
        padding: n.padding,
        gap: n.gap,
        fontSize: n.fontSize,
        fontWeight: n.fontWeight,
        fontFamily: n.fontFamily,
        lineHeight: n.lineHeight,
        letterSpacing: n.letterSpacing,
        textAlign: n.textAlign,
      },
    };
  });
  return validateLibraryScene({
    documentId: doc.id,
    sourceRevision,
    rootId: root.node.id,
    width: root.width,
    height: root.height,
    elements,
  });
}

/** Report platform mapping gaps before starting a renderer or changing its current scene. */
export function nativeSceneDiagnostics(scene: LibraryScene): string[] {
  return scene.elements.flatMap((node) => {
    const styles: string[] = [];
    if (
      node.kind !== "frame" &&
      (node.text.includes("\n") || node.text.includes("\r"))
    )
      styles.push(
        `${node.id}: native multiline text is unsupported; use semantic preview`,
      );
    if (
      node.kind !== "frame" &&
      node.style.lineHeight !== nativeSceneStyleSupport.lineHeight
    )
      styles.push(
        `${node.id}: native lineHeight is unsupported; use semantic preview`,
      );
    if (node.kind === "input")
      for (const [name, value] of Object.entries(nativeSceneStyleSupport.input))
        if (
          node.style[name as keyof typeof nativeSceneStyleSupport.input] !==
          value
        )
          styles.push(
            `${node.id}: native Input style ${name} is unsupported; use semantic preview`,
          );
    const ref = node.library;
    if (!ref) return styles;
    const c = manifest.components[ref.component],
      swift = c.swift;
    if (
      !swift?.platforms.includes("macOS") ||
      !swift.supportedVariants.includes(ref.variant)
    )
      return [
        ...styles,
        `${node.id}: native ${ref.component} variant ${ref.variant} is unsupported; use the semantic preview or a supported variant`,
      ];
    return styles.concat(
      Object.entries(c.props)
        .filter(([name, p]) => !p.semantic && ref.props[name] !== p.default)
        .map(
          ([name]) =>
            `${node.id}: native ${ref.component} property ${name} is unsupported; use semantic preview`,
        ),
    );
  });
}
