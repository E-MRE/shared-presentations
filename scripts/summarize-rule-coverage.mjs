import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Coverage is aggregate instrumentation, not a per-request quota profiler.
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const source = input.rules.files[0].content;
const ranges = [];
for (const match of source.matchAll(/function\s+(\w+)\([^)]*\)\s*\{/g)) {
  let depth = 1, offset = match.index + match[0].length, quote;
  while (depth && offset < source.length) {
    const char = source[offset];
    if (quote) {
      if (char === '\\') offset++;
      else if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '{') depth++;
    else if (char === '}') depth--;
    offset++;
  }
  ranges.push({ start: match.index, end: offset, name: match[1] });
}
const functions = Object.fromEntries(ranges.map(({ name }) => [name, { recorded: 0, undefined: 0, unexecutedMarkers: 0 }]));
function visit(node) {
  const offset = node.sourcePosition.currentOffset;
  const name = ranges.find(range => range.start <= offset && offset < range.end)?.name ?? 'matchStatements';
  const row = functions[name] ??= { recorded: 0, undefined: 0, unexecutedMarkers: 0 };
  for (const entry of node.values ?? []) {
    if (!entry.value || !Object.keys(entry.value).length) row.unexecutedMarkers += entry.count;
    else {
      row.recorded += entry.count;
      if (JSON.stringify(entry.value).includes('undefined')) row.undefined += entry.count;
    }
  }
  for (const child of node.children ?? []) visit(child);
}
for (const node of input.report) visit(node);
writeFileSync(process.argv[3], JSON.stringify({
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  scope: 'Recorded AST evaluations across the trial; NOT exact per-document budget charge. Helpers exclusive, unexecuted markers excluded.',
  functions,
}, null, 2) + '\n');
