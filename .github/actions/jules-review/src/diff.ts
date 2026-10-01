interface FileDiff { path: string; text: string; priority: number; }

// Keep shipping source, tests and workflow changes ahead of large design archives.
// Whole-file hunks are retained; shipping-source overflow is an error.
export function selectReviewDiff(diff: string, maxChars = 350_000): { text: string; truncatedNote?: string } {
  const files: FileDiff[] = diff.split(/(?=^diff --git )/m).filter(Boolean).map(text => {
    const header = text.split('\n', 1)[0];
    const path = header.match(/ "?b\/(.*?)"?$/)?.[1] ?? header;
    const priority = /^(src\/|tools\/|\.github\/)/.test(path) ? 0 :
      /^(docs\/|designs\/|prototypes\/)|(?:^|\/)(?:bun|package)\.lock(?:b|\.json)?$/.test(path) ? 2 : 1;
    return { path, text, priority };
  }).sort((a, b) => a.priority - b.priority);
  const included: string[] = [], omitted: string[] = [];
  let used = 0;
  for (const file of files) {
    if (used + file.text.length <= maxChars) {
      included.push(file.text); used += file.text.length;
    } else if (file.priority === 0) {
      throw new Error(`Shipping source diff exceeds the ${maxChars}-character review budget.`);
    } else omitted.push(file.path);
  }
  return {
    text: included.join(''),
    ...(omitted.length ? { truncatedNote: `All shipping source, tools, tests and workflows are included. ${omitted.length} other file diffs were omitted to fit the ${maxChars}-character budget. Omitted paths: ${omitted.slice(0, 40).join(', ')}${omitted.length > 40 ? ', …' : ''}.` } : {}),
  };
}
