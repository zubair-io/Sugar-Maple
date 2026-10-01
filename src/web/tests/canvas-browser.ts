import { expect, type Page } from '@playwright/test';
export const inspect = (page: Page) =>
  page.evaluate(() => window.sugarMaple.dispatch('layout.inspect'));
export async function nodeBox(page: Page, id: string) {
  const result = await inspect(page),
    node = result.nodes.find((n: any) => n.id === id);
  if (!node?.rendered || !node.bounds) throw Error(`Node ${id} is not projected by the canvas`);
  return node.bounds as { x: number; y: number; width: number; height: number };
}
export async function clickNode(page: Page, id: string, shift = false) {
  const b = await nodeBox(page, id);
  if (shift) await page.keyboard.down('Shift');
  try {
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  } finally {
    if (shift) await page.keyboard.up('Shift');
  }
}
export async function expectSceneCount(page: Page, count: number) {
  await expect
    .poll(async () => (await inspect(page)).nodes.filter((n: any) => n.rendered).length)
    .toBe(count);
  await expect(page.locator('.viewport canvas')).toHaveCount(1);
  await expect(page.locator('.viewport [data-node-id]')).toHaveCount(0);
}
export async function expectSelectionCount(page: Page, count: number) {
  await expect
    .poll(async () => (await inspect(page)).nodes.filter((n: any) => n.selected).length)
    .toBe(count);
}
