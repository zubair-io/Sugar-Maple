import {
  validateLibraryScene,
  type LibraryScene,
  type SceneElement,
} from "./scene-contract";
export type SceneControlEvent =
  | { kind: "action"; nodeId: string }
  | { kind: "change"; nodeId: string; value: string };
interface Control extends HTMLElement {
  value?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
  variant?: string;
  appearance?: string;
  updateComplete?: Promise<unknown>;
}
const geometryCSS = `
.scene-node{position:absolute;box-sizing:border-box;transform-origin:center;min-width:0;min-height:0}
.scene-root{position:relative;overflow:hidden}
.scene-text{white-space:pre-wrap;overflow:hidden}
.scene-node::part(base){box-sizing:border-box;min-height:0;height:100%;width:100%}
wa-input.scene-node::part(form-control){height:100%;min-height:0}
wa-input.scene-node::part(form-control-label),wa-input.scene-node::part(form-control-help-text){display:none}
wa-card.scene-node::part(base){position:static}
wa-card.scene-node::part(header),wa-card.scene-node::part(body),wa-card.scene-node::part(footer){position:static;padding:0;margin:0;border:0}
.scene-node[data-override-fill="true"]::part(base){background:var(--scene-fill)}
.scene-node[data-override-color="true"]::part(base){color:var(--scene-color)}
.scene-node[data-override-radius="true"]::part(base){border-radius:var(--scene-radius)}
`;
/** Read-only projection with ephemeral control state. No source document or command dispatcher. */
export class WebScene {
  private nodes = new Map<string, Control>();
  private source: LibraryScene | null = null;
  private values = new Map<string, { source: string; value: string }>();
  private generation = 0;
  private settled = 0;
  private readonly style: HTMLStyleElement;
  constructor(
    private container: HTMLElement,
    private onEvent: (event: SceneControlEvent) => void,
  ) {
    this.style = document.createElement("style");
    this.style.textContent = geometryCSS;
    container.append(this.style);
  }
  async render(value: unknown, reset = false) {
    const scene = validateLibraryScene(value); // Reject the entire feed before touching controls.
    if (
      this.source?.documentId === scene.documentId &&
      scene.sourceRevision < this.source.sourceRevision
    )
      throw Error("Authored scene revision is stale");
    const generation = ++this.generation;
    if (reset || scene.documentId !== this.source?.documentId)
      this.values.clear();
    this.source = scene;
    const live = new Set(scene.elements.map((n) => n.id));
    for (const [id, element] of this.nodes)
      if (!live.has(id)) {
        element.remove();
        this.nodes.delete(id);
        this.values.delete(id);
      }
    for (const n of scene.elements) {
      const tag = n.library
        ? (
            { Button: "wa-button", Input: "wa-input", Card: "wa-card" } as const
          )[n.library.component]
        : (
            {
              frame: "div",
              text: "div",
              button: "button",
              input: "input",
            } as const
          )[n.kind];
      let el = this.nodes.get(n.id);
      if (el?.localName !== tag) {
        el?.remove();
        this.values.delete(n.id);
        el = document.createElement(tag) as Control;
        this.nodes.set(n.id, el);
        const id = n.id;
        el.addEventListener("click", () => {
          const current = this.source?.elements.find((n) => n.id === id);
          if (
            current?.kind === "button" &&
            !current.disabled &&
            this.settled === this.generation
          )
            this.onEvent({ kind: "action", nodeId: id });
        });
        el.addEventListener("input", () => {
          const current = this.source?.elements.find((n) => n.id === id),
            control = this.nodes.get(id);
          if (
            current?.kind !== "input" ||
            current.disabled ||
            this.settled !== this.generation ||
            typeof control?.value !== "string" ||
            control.value.length > 20000 ||
            /[\r\n]/.test(control.value)
          )
            return;
          this.values.set(id, { source: current.value, value: control.value });
          this.onEvent({ kind: "change", nodeId: id, value: control.value });
        });
      }
      el.dataset.nodeId = n.id;
      el.className =
        "scene-node" +
        (n.id === scene.rootId ? " scene-root" : "") +
        (n.kind === "text" ? " scene-text" : "");
      el.setAttribute("slot", n.slot);
      this.geometry(el, n);
      this.appearance(el, n);
      if (n.kind === "text" || n.kind === "button") el.textContent = n.text;
      if (n.kind === "button") {
        el.disabled = n.disabled;
        if (n.library) {
          el.variant = String(n.library.props.variant);
          el.appearance = String(n.library.props.appearance);
        }
      }
      if (n.kind === "input") {
        const local = this.values.get(n.id),
          current = local?.source === n.value ? local.value : n.value;
        this.values.set(n.id, { source: n.value, value: current });
        el.type = n.inputType;
        el.label = n.label;
        el.setAttribute("aria-label", n.label);
        el.placeholder = n.text;
        el.disabled = n.disabled;
        // Preserve a focused native/shadow input's caret across unrelated updates.
        if (el.value !== current) el.value = current;
        el.setAttribute("maxlength", "20000");
      }
      const parent = n.parentId ? this.nodes.get(n.parentId)! : this.container;
      const siblings = scene.elements.filter(
        (child) => child.parentId === n.parentId,
      );
      const index = siblings.findIndex((child) => child.id === n.id);
      const actual = [...parent.children].filter(
        (child) => child !== this.style,
      )[index];
      if (actual !== el) parent.insertBefore(el, actual ?? null);
    }
    await Promise.all([...this.nodes.values()].map((el) => el.updateComplete));
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    if (this.generation === generation) this.settled = generation;
  }
  private geometry(el: Control, n: SceneElement) {
    Object.assign(el.style, {
      left: n.x + "px",
      top: n.y + "px",
      width: n.width + "px",
      height: n.height + "px",
      opacity: String(n.style.opacity),
      transform: `rotate(${n.rotation}deg)`,
      fontSize: n.style.fontSize + "px",
      fontWeight: String(n.style.fontWeight),
      fontFamily: n.style.fontFamily,
      lineHeight: String(n.style.lineHeight),
      letterSpacing: n.style.letterSpacing + "px",
      textAlign:
        n.style.textAlign === "auto"
          ? n.kind === "button"
            ? "center"
            : "left"
          : n.style.textAlign,
    });
  }
  private appearance(el: Control, n: SceneElement) {
    const style = n.style,
      overrides = n.library?.localOverrides;
    // Source tokens are constrained to the pinned manifest variable; no arbitrary CSS.
    el.style.removeProperty("--wa-color-brand-fill-loud");
    for (const [variable, token] of Object.entries(n.library?.tokens ?? {}))
      el.style.setProperty(variable, token!.value);
    if (n.library) {
      // Package Default/Primary styles remain actual package styles. Apply explicit
      // semantic overrides to the real control's base, not merely its outer host.
      el.style.setProperty(
        "--scene-fill",
        style.fillEnabled ? style.fill : "transparent",
      );
      el.style.setProperty("--scene-color", style.color);
      el.style.setProperty("--scene-radius", style.radius + "px");
      el.dataset.overrideFill = String(!!overrides?.includes("fill"));
      el.dataset.overrideColor = String(!!overrides?.includes("color"));
      el.dataset.overrideRadius = String(!!overrides?.includes("radius"));
      if (n.library.component === "Card") {
        el.style.setProperty("--spacing", "0px");
        // The package Card's host border otherwise shifts every authored child
        // by its intrinsic one-pixel inset. Children already include source borders.
        Object.assign(el.style, {
          border: style.strokeWidth + "px solid " + style.stroke,
          borderRadius: style.radius + "px",
          background: style.fillEnabled ? style.fill : "transparent",
          color: style.color,
        });
      }
    } else {
      Object.assign(el.style, {
        background:
          style.fillEnabled && n.kind !== "text" ? style.fill : "transparent",
        color: style.color,
        border: style.strokeWidth + "px solid " + style.stroke,
        borderRadius: style.radius + "px",
      });
    }
  }
  dispose() {
    this.generation++;
    this.source = null;
    for (const el of this.nodes.values()) el.remove();
    this.nodes.clear();
    this.values.clear();
    this.style.remove();
  }
}
