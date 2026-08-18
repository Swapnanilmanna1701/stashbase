import { parseTree, printParseErrorCode, type Node, type ParseError } from 'jsonc-parser';

export const JSON_TREE_LIMITS = Object.freeze({ bytes: 512_000, nodes: 20_000, depth: 80 });

export type JsonPath = Array<string | number>;
export interface JsonTreeSearchOptions { wholeWord: boolean; caseSensitive: boolean }

export interface JsonSourceNode {
  type: Node['type'];
  path: JsonPath;
  key?: string;
  offset: number;
  length: number;
  valueOffset: number;
  valueLength: number;
  children: JsonSourceNode[];
  raw: string;
}

export type JsonTreeAnalysis =
  | { available: true; root: JsonSourceNode; nodeCount: number; maxDepth: number }
  | { available: false; reason: 'empty' | 'invalid' | 'duplicate-keys' | 'over-limit'; message: string };

/** Strict, bounded analysis. The source string remains authoritative; values are never materialized through JSON.parse. */
export function analyzeJsonSource(source: string): JsonTreeAnalysis {
  const byteLength = new TextEncoder().encode(source).length;
  if (byteLength > JSON_TREE_LIMITS.bytes) {
    return unavailable('over-limit', `Tree mode supports JSON up to ${formatBytes(JSON_TREE_LIMITS.bytes)}; this file is ${formatBytes(byteLength)}. Use Source mode.`);
  }
  const bom = source.startsWith('\uFEFF') ? 1 : 0;
  const text = source.slice(bom);
  if (!text.trim()) return unavailable('empty', 'Tree mode needs a JSON value. Add one in Source mode.');
  const errors: ParseError[] = [];
  const parsed = parseTree(text, errors, { allowTrailingComma: false, disallowComments: true, allowEmptyContent: false });
  if (!parsed || errors.length) {
    const error = errors[0];
    const offset = bom + (error?.offset ?? 0);
    const location = sourceLocation(source, offset);
    const detail = error ? humanizeError(printParseErrorCode(error.error)) : 'Expected a JSON value';
    return unavailable('invalid', `${detail} at line ${location.line}, column ${location.column}. Fix it in Source mode.`);
  }
  let nodeCount = 0;
  let maxDepth = 0;
  let exceededStructureLimit = false;
  let duplicatePath: string | null = null;
  const visit = (node: Node, path: JsonPath, depth: number, key?: string): JsonSourceNode => {
    nodeCount++;
    maxDepth = Math.max(maxDepth, depth);
    const offset = node.offset + bom;
    const children: JsonSourceNode[] = [];
    if (nodeCount > JSON_TREE_LIMITS.nodes || depth > JSON_TREE_LIMITS.depth) exceededStructureLimit = true;
    else if (node.type === 'object') {
      const seen = new Set<string>();
      for (const property of node.children ?? []) {
        const keyNode = property.children?.[0];
        const valueNode = property.children?.[1];
        if (!keyNode || !valueNode) continue;
        const propertyKey = String(keyNode.value);
        if (seen.has(propertyKey) && duplicatePath === null) duplicatePath = formatPath([...path, propertyKey]);
        seen.add(propertyKey);
        children.push(visit(valueNode, [...path, propertyKey], depth + 1, propertyKey));
      }
    } else if (node.type === 'array') {
      for (const [index, child] of (node.children ?? []).entries()) {
        children.push(visit(child, [...path, index], depth + 1));
      }
    }
    return {
      type: node.type, path, key, offset, length: node.length,
      valueOffset: offset, valueLength: node.length, children,
      raw: source.slice(offset, offset + node.length),
    };
  };
  const root = visit(parsed, [], 0);
  if (duplicatePath) return unavailable('duplicate-keys', `Tree mode is unavailable because ${duplicatePath} is duplicated. Use Source mode to preserve both properties.`);
  if (exceededStructureLimit || nodeCount > JSON_TREE_LIMITS.nodes || maxDepth > JSON_TREE_LIMITS.depth) {
    return unavailable('over-limit', `Tree mode supports at most ${JSON_TREE_LIMITS.nodes.toLocaleString()} nodes and depth ${JSON_TREE_LIMITS.depth}; this document has ${nodeCount.toLocaleString()} nodes and depth ${maxDepth}. Use Source mode.`);
  }
  return { available: true, root, nodeCount, maxDepth };
}

export function replaceJsonNode(source: string, node: JsonSourceNode, replacement: string, subtree = false): string {
  const analyzed = analyzeJsonSource(replacement);
  if (!analyzed.available) throw new Error(`Replacement is not valid strict JSON: ${analyzed.message}`);
  if (!subtree && (analyzed.root.type === 'object' || analyzed.root.type === 'array')) {
    throw new Error('Use subtree editing to replace an object or array.');
  }
  return splice(source, node.valueOffset, node.valueLength, replacementWithoutBom(replacement));
}

export function renameJsonProperty(source: string, path: JsonPath, nextKey: string): string {
  if (!path.length || typeof path.at(-1) !== 'string') throw new Error('Only object properties can be renamed.');
  const located = locate(source, path);
  const property = located.node.parent;
  const object = property?.parent;
  const keyNode = property?.children?.[0];
  if (!property || property.type !== 'property' || !object || !keyNode) throw new Error('Property no longer exists.');
  if ((object.children ?? []).some((candidate) => candidate !== property && candidate.children?.[0]?.value === nextKey)) {
    throw new Error(`The key ${JSON.stringify(nextKey)} already exists in this object.`);
  }
  return splice(source, keyNode.offset + located.bom, keyNode.length, JSON.stringify(nextKey));
}

export function deleteJsonPath(source: string, path: JsonPath): string {
  if (!path.length) throw new Error('The root value cannot be deleted.');
  const located = locate(source, path);
  const target = located.node.parent?.type === 'property' ? located.node.parent : located.node;
  const container = target.parent;
  const siblings = container?.children ?? [];
  const index = siblings.indexOf(target);
  if (!container || index < 0) throw new Error('Value no longer exists.');
  let from = target.offset;
  let to = target.offset + target.length;
  if (siblings.length > 1 && index < siblings.length - 1) to = siblings[index + 1].offset;
  else if (index > 0) from = siblings[index - 1].offset + siblings[index - 1].length;
  return splice(source, from + located.bom, to - from, '');
}

export function addJsonChild(source: string, containerPath: JsonPath, rawValue: string, key?: string): string {
  const valueAnalysis = analyzeJsonSource(rawValue);
  if (!valueAnalysis.available) throw new Error(`New value is not valid strict JSON: ${valueAnalysis.message}`);
  const located = locate(source, containerPath);
  const container = located.node;
  if (container.type !== 'array' && container.type !== 'object') throw new Error('Values can only be added to objects or arrays.');
  if (container.type === 'object') {
    if (key === undefined) throw new Error('A property key is required.');
    if ((container.children ?? []).some((property) => property.children?.[0]?.value === key)) throw new Error(`The key ${JSON.stringify(key)} already exists in this object.`);
  }
  const raw = replacementWithoutBom(rawValue);
  const children = container.children ?? [];
  const close = container.offset + container.length - 1 + located.bom;
  const style = inferStyle(source, container, located.bom);
  const member = container.type === 'object' ? `${JSON.stringify(key)}${style.colon}${raw}` : raw;
  if (!children.length) {
    if (style.multiline) {
      const open = container.offset + located.bom;
      const interior = source.slice(open + 1, close);
      const closingIndent = interior.slice(Math.max(interior.lastIndexOf('\n'), interior.lastIndexOf('\r')) + 1);
      const childIndent = closingIndent === style.parentIndent ? style.childIndent : closingIndent + inferIndent(source);
      return splice(source, open + 1, interior.length, `${style.eol}${childIndent}${member}${style.eol}${closingIndent}`);
    }
    return splice(source, close, 0, member);
  }
  const insertion = style.multiline ? `,${style.eol}${style.childIndent}${member}` : `${style.comma}${member}`;
  const last = children.at(-1)!;
  return splice(source, last.offset + located.bom + last.length, 0, insertion);
}

export function reorderJsonArrayItem(source: string, arrayPath: JsonPath, fromIndex: number, toIndex: number): string {
  const located = locate(source, arrayPath);
  const array = located.node;
  const children = array.children ?? [];
  if (array.type !== 'array' || fromIndex < 0 || toIndex < 0 || fromIndex >= children.length || toIndex >= children.length) throw new Error('Array item no longer exists.');
  if (fromIndex === toIndex) return source;
  const low = Math.min(fromIndex, toIndex);
  const high = Math.max(fromIndex, toIndex);
  const raws = children.slice(low, high + 1).map((child) => source.slice(child.offset + located.bom, child.offset + located.bom + child.length));
  const separators = children.slice(low, high).map((child, index) => source.slice(
    child.offset + located.bom + child.length,
    children[low + index + 1].offset + located.bom,
  ));
  const moved = raws.splice(fromIndex - low, 1)[0];
  raws.splice(toIndex - low, 0, moved);
  let replacement = raws[0];
  for (let index = 0; index < separators.length; index++) replacement += separators[index] + raws[index + 1];
  const start = children[low].offset + located.bom;
  const end = children[high].offset + located.bom + children[high].length;
  return splice(source, start, end - start, replacement);
}

export function formatPath(path: JsonPath): string {
  if (!path.length) return '$';
  return '$' + path.map((part) => typeof part === 'number' ? `[${part}]` : /^[A-Za-z_$][\w$]*$/u.test(part) ? `.${part}` : `[${JSON.stringify(part)}]`).join('');
}

export function matchingJsonTreeNodes(root: JsonSourceNode, query: string, options: JsonTreeSearchOptions): JsonSourceNode[] {
  if (!query) return [];
  return flattenNodes(root).filter((node) => textContains(treeSearchText(node), query, options));
}

function flattenNodes(root: JsonSourceNode): JsonSourceNode[] { return [root, ...root.children.flatMap(flattenNodes)]; }
function treeSearchText(node: JsonSourceNode): string { return `${node.key ?? ''}\n${node.type === 'object' || node.type === 'array' ? '' : node.raw}\n${formatPath(node.path)}`; }
function textContains(text: string, query: string, options: JsonTreeSearchOptions): boolean {
  const haystack = options.caseSensitive ? text : text.toLocaleLowerCase();
  const needle = options.caseSensitive ? query : query.toLocaleLowerCase();
  for (let from = haystack.indexOf(needle); from >= 0; from = haystack.indexOf(needle, from + Math.max(1, needle.length))) {
    const to = from + needle.length;
    if (!options.wholeWord || (isWordBoundary(text, from - 1) && isWordBoundary(text, to))) return true;
  }
  return false;
}
function isWordBoundary(text: string, index: number): boolean { return index < 0 || index >= text.length || !/[\p{L}\p{N}_]/u.test(text[index]); }

function locate(source: string, path: JsonPath): { node: Node; bom: number } {
  const bom = source.startsWith('\uFEFF') ? 1 : 0;
  const errors: ParseError[] = [];
  const root = parseTree(source.slice(bom), errors, { allowTrailingComma: false, disallowComments: true });
  if (!root || errors.length) throw new Error('The source is no longer valid JSON. Switch to Source mode.');
  let node: Node | undefined = root;
  for (const part of path) {
    node = typeof part === 'number'
      ? node.children?.[part]
      : node.children?.find((property) => property.type === 'property' && property.children?.[0]?.value === part)?.children?.[1];
    if (!node) throw new Error(`Path ${formatPath(path)} no longer exists.`);
  }
  return { node, bom };
}

function inferStyle(source: string, container: Node, bom: number) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const containerOffset = container.offset + bom;
  const containerRaw = source.slice(containerOffset, containerOffset + container.length);
  const multiline = /\r?\n/u.test(containerRaw);
  const parentIndent = lineIndentAt(source, containerOffset);
  const first = container.children?.[0];
  const childIndent = first ? lineIndentAt(source, first.offset + bom) : parentIndent + inferIndent(source);
  let colon = ': ';
  if (container.type === 'object' && first?.children?.[0] && first.children[1]) {
    colon = source.slice(first.children[0].offset + bom + first.children[0].length, first.children[1].offset + bom);
  }
  const comma = containerRaw.includes(', ') ? ', ' : ',';
  return { eol, multiline, parentIndent, childIndent, colon, comma };
}

function inferIndent(source: string): string {
  const match = source.match(/\r?\n([\t ]+)\S/u);
  return match?.[1] ?? '  ';
}

function lineIndentAt(source: string, offset: number): string {
  const start = Math.max(source.lastIndexOf('\n', offset - 1) + 1, 0);
  return source.slice(start, offset).match(/^[\t ]*/u)?.[0] ?? '';
}

function sourceLocation(source: string, offset: number) {
  const before = source.slice(0, offset);
  const lineStart = Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r'));
  return { line: before.split(/\r\n|\r|\n/u).length, column: offset - lineStart };
}

function replacementWithoutBom(value: string): string { return value.startsWith('\uFEFF') ? value.slice(1) : value; }
function splice(source: string, offset: number, length: number, replacement: string): string { return source.slice(0, offset) + replacement + source.slice(offset + length); }
function unavailable(reason: 'empty' | 'invalid' | 'duplicate-keys' | 'over-limit', message: string): JsonTreeAnalysis { return { available: false, reason, message }; }
function formatBytes(bytes: number): string { return `${(bytes / 1_000_000).toFixed(bytes >= 1_000_000 ? 0 : 1)} MB`; }
function humanizeError(code: string): string { return code.replace(/([a-z])([A-Z])/gu, '$1 $2').replace(/^./u, (letter) => letter.toUpperCase()); }
