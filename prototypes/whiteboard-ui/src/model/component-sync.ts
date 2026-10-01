import { NodeSchema, componentOrder, uid, type SceneDocument, type SceneNode } from './schema';
import { subtree, propagate } from './composition';
/** Reconcile master structure after the whole batch validates, preserving instance identity. */
export function synchronizeComponents(doc: SceneDocument, before: SceneDocument) {
  for (const masterId of componentOrder(doc)) {
    const master = doc.nodes.find((n) => n.id === masterId)!;
    const source = subtree(doc, master.id);
    const sourceIds = new Set(source.map((n) => n.id));
    const oldSources = new Set(subtree(before, master.id).map((n) => n.id));
    const oldLinks = new Map(before.nodes.map((n) => [n.id, n.componentId]));
    for (const instance of doc.nodes.filter((n) => n.componentId === master.id)) {
      const members = subtree(doc, instance.id);
      const removed = new Set(
        members
          .filter((n) => {
            const link = oldLinks.get(n.id);
            return link && oldSources.has(link) && !sourceIds.has(link);
          })
          .flatMap((n) => subtree(doc, n.id).map((v) => v.id)),
      );
      doc.nodes = doc.nodes.filter((n) => !removed.has(n.id));
      const mapping = new Map(
        members
          .filter((n) => n.componentId && !removed.has(n.id))
          .map((n) => [n.componentId!, n.id]),
      );
      mapping.set(master.id, instance.id);
      for (const n of source) if (!mapping.has(n.id)) mapping.set(n.id, uid());
      for (const n of source) {
        if (n.id === master.id) continue;
        const id = mapping.get(n.id)!;
        const existing = doc.nodes.find((v) => v.id === id);
        if (existing) {
          existing.parentId = mapping.get(n.parentId!)!;
          existing.order = n.order;
        } else
          doc.nodes.push(
            NodeSchema.parse({
              ...n,
              id,
              pageId: instance.pageId,
              parentId: mapping.get(n.parentId!),
              componentId: n.id,
              isComponent: false,
              overrides: [],
              variants: {},
              repeatTemplateId: n.repeatTemplateId ? mapping.get(n.repeatTemplateId) : null,
              targetId: n.targetId ? (mapping.get(n.targetId) ?? n.targetId) : null,
            }),
          );
      }
    }
  }
  const existing = new Set(doc.nodes.map((n) => n.id));
  for (const n of doc.nodes) {
    if (n.targetId && !existing.has(n.targetId)) n.targetId = null;
    if (n.componentId && !existing.has(n.componentId)) n.componentId = null;
    if (n.repeatTemplateId && !existing.has(n.repeatTemplateId)) n.repeatTemplateId = null;
  }
  // Variants are explicit style deltas on the master; per-instance overrides win.
  const masters = new Map(doc.nodes.filter((n) => n.isComponent).map((n) => [n.id, n]));
  for (const n of doc.nodes) {
    const master = masters.get(n.componentId ?? '');
    if (!master) continue;
    const oldMaster = before.nodes.find((m) => m.id === master.id);
    if (n.variantName !== 'Default' && !master.variants[n.variantName]) n.variantName = 'Default';
    const patch = master.variants[n.variantName] ?? {};
    const fields = new Set(
      [...Object.values(master.variants), ...Object.values(oldMaster?.variants ?? {})].flatMap(
        (v) => Object.keys(v),
      ),
    );
    const changes: Partial<SceneNode> = {};
    for (const key of fields)
      if (!n.overrides.includes(key)) {
        (n as any)[key] = (patch as any)[key] ?? (master as any)[key];
        (changes as any)[key] = (n as any)[key];
      }
    propagate(doc, n, changes, false);
  }
}
