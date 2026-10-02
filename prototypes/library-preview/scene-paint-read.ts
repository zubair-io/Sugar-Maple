import type { Page } from "../../src/web/node_modules/@playwright/test";
import type { Box } from "../../src/web/src/app/canvas/scene-layout";

/** Inspect actual raster paint, not source fields or CSS declarations. Detached
 * image decoding never modifies the authoring document or preview controls. */
export async function nativePaint(
  page: Page,
  png: string,
  box: Box,
  width: number,
) {
  return page.evaluate(
    async ({ png, box, width }) => {
      const image = new Image();
      image.src = "data:image/png;base64," + png;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const scale = image.width / width,
        x = Math.max(0, Math.floor(box.x * scale)),
        y = Math.max(0, Math.floor(box.y * scale));
      const pixels = ctx.getImageData(
        x,
        y,
        Math.min(image.width - x, Math.ceil(box.width * scale)),
        Math.min(image.height - y, Math.ceil(box.height * scale)),
      ).data;
      let purple = 0,
        yellow = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 220) continue;
        if (
          Math.abs(pixels[i] - 118) <= 3 &&
          Math.abs(pixels[i + 1] - 60) <= 3 &&
          Math.abs(pixels[i + 2] - 186) <= 3
        )
          purple++;
        if (pixels[i] > 220 && pixels[i + 1] > 220 && pixels[i + 2] < 50)
          yellow++;
      }
      return {
        purple,
        yellow,
        scope:
          "Actual native PNG pixels within the Button presentation bounds, sRGB decoded in Chrome; solid-fill RGB tolerance 3/255",
      };
    },
    { png, box, width },
  );
}
export async function canvasPaint(page: Page, box: Box) {
  return page.evaluate((box) => {
    const canvas = document.querySelector<HTMLCanvasElement>(
        "canvas.drawing-canvas",
      )!,
      rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width,
      x = Math.max(0, Math.floor((box.x - rect.x) * scale)),
      y = Math.max(0, Math.floor((box.y - rect.y) * scale));
    const pixels = canvas
      .getContext("2d")!
      .getImageData(
        x,
        y,
        Math.min(canvas.width - x, Math.ceil(box.width * scale)),
        Math.min(canvas.height - y, Math.ceil(box.height * scale)),
      ).data;
    let purple = 0,
      yellow = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 220) continue;
      if (
        Math.abs(pixels[i] - 118) <= 3 &&
        Math.abs(pixels[i + 1] - 60) <= 3 &&
        Math.abs(pixels[i + 2] - 186) <= 3
      )
        purple++;
      if (pixels[i] > 220 && pixels[i + 1] > 220 && pixels[i + 2] < 50)
        yellow++;
    }
    return {
      purple,
      yellow,
      scope:
        "Actual production Canvas pixels within the screen-projected Button bounds; solid-fill RGB tolerance 3/255",
    };
  }, box);
}
