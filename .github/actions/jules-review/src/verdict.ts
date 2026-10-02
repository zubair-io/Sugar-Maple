export type Verdict = 'approve' | 'comment' | 'block';
export type FailOn = 'never' | 'blocking' | 'any';

/** Exactly one terminal, top-level verdict; examples/prose never authorize publication. */
export function parseFinalVerdict(message: string): Verdict | null {
  if (message.includes('\0')) return null;
  const lines = message.replace(/<!--[\s\S]*?(?:-->|$)/g, '').split(/\r?\n/);
  const finalLine = lines.filter(line => line.trim()).at(-1);
  const found: { line: string; verdict: Verdict }[] = [];
  let fence: { char: string; length: number } | null = null;
  for (const line of lines) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (fence) continue;
    const match = line.match(/^(?:VERDICT:[ \t]*(approve|comment|block)|`VERDICT:[ \t]*(approve|comment|block)`)[ \t]*$/i);
    if (match) found.push({ line, verdict: (match[1] ?? match[2]).toLowerCase() as Verdict });
  }
  return found.length === 1 && found[0].line === finalLine ? found[0].verdict : null;
}

export function statusFromVerdict(verdict: Verdict, failOn: FailOn): { state: 'success' | 'failure'; description: string } {
  if (failOn === 'never') return { state: 'success', description: `Review complete (verdict: ${verdict})` };
  if (failOn === 'any') return verdict === 'approve'
    ? { state: 'success', description: 'Approved' }
    : { state: 'failure', description: `Review verdict: ${verdict}` };
  return verdict === 'block'
    ? { state: 'failure', description: 'Blocking issues found' }
    : { state: 'success', description: `Review complete (verdict: ${verdict})` };
}
