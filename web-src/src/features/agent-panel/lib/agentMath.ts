type Fence = {
  marker: '`' | '~';
  length: number;
};

function lineEnd(source: string, start: number): number {
  const end = source.indexOf('\n', start);
  return end === -1 ? source.length : end + 1;
}

function fenceForLine(line: string): Fence | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!match) return null;
  return { marker: match[1][0] as Fence['marker'], length: match[1].length };
}

function closesFence(line: string, fence: Fence): boolean {
  const match = line.match(/^ {0,3}(`+|~+)\s*(?:\n)?$/);
  return !!match && match[1][0] === fence.marker && match[1].length >= fence.length;
}

function expandCompactDisplayMath(line: string): string | null {
  const newline = line.endsWith('\n') ? '\n' : '';
  const body = newline ? line.slice(0, -1) : line;
  const match = body.match(/^( {0,3})\$\$(?!\$)(.+?)\$\$\s*$/);
  if (!match) return null;
  return `${match[1]}$$\n${match[2]}\n${match[1]}$$${newline}`;
}

function isEscaped(source: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function runLength(source: string, start: number, marker: string): number {
  let end = start;
  while (source[end] === marker) end += 1;
  return end - start;
}

function findBackslashMathClose(
  source: string,
  start: number,
  close: ')' | ']',
  singleLine: boolean,
): number {
  let codeTicks = 0;
  for (let cursor = start; cursor < source.length; cursor += 1) {
    if (singleLine && source[cursor] === '\n') return -1;
    if (!singleLine && (cursor === 0 || source[cursor - 1] === '\n')) {
      const end = lineEnd(source, cursor);
      if (fenceForLine(source.slice(cursor, end))) return -1;
    }
    if (source[cursor] === '`') {
      const ticks = runLength(source, cursor, '`');
      if (codeTicks === 0) codeTicks = ticks;
      else if (ticks === codeTicks) codeTicks = 0;
      cursor += ticks - 1;
      continue;
    }
    if (
      codeTicks === 0
      && source[cursor] === '\\'
      && source[cursor + 1] === close
      && !isEscaped(source, cursor)
    ) {
      return cursor;
    }
  }
  return -1;
}

function nextUnescapedSingleDollar(source: string, start: number): number {
  for (let cursor = start; cursor < source.length && source[cursor] !== '\n'; cursor += 1) {
    if (
      source[cursor] === '$'
      && source[cursor - 1] !== '$'
      && source[cursor + 1] !== '$'
      && !isEscaped(source, cursor)
    ) {
      return cursor;
    }
  }
  return -1;
}

/**
 * A leading currency amount is prose unless its closing dollar arrives
 * immediately or the enclosed source contains clear math syntax. This keeps
 * two unrelated prices from becoming one large inline equation while still
 * allowing forms such as `$328.57$`, `$2x$`, and `$2 + 2 = 4$`.
 */
function isCurrencyDollar(source: string, index: number): boolean {
  const amount = source.slice(index + 1).match(/^\d+(?:,\d{3})*(?:\.\d+)?/);
  if (!amount) return false;

  const amountEnd = index + 1 + amount[0].length;
  const afterAmount = source[amountEnd];
  if (afterAmount === '$') return false;
  if (/^\s*[-–—]\s*\$\d/.test(source.slice(amountEnd))) return true;
  if (afterAmount && !/[\s.,;:!?)}\]]/.test(afterAmount)) return false;

  const closing = nextUnescapedSingleDollar(source, amountEnd);
  if (closing === -1) return true;
  const candidate = source.slice(index + 1, closing);
  return !/[\\=+*/^_{}<>-]/.test(candidate);
}

/**
 * Normalize the Agent-only `\(...\)` and `\[...\]` delimiter families to
 * the dollar syntax understood by remark-math. This is a small Markdown-aware
 * scanner rather than a global replacement: fenced/indented code, code spans,
 * escaped delimiters, incomplete streaming input, and currency prose remain
 * literal. The original transcript string remains untouched for persistence
 * and Copy Reply.
 */
export function prepareAgentMathMarkdown(markdown: string): {
  markdown: string;
  hasMath: boolean;
} {
  let output = '';
  let cursor = 0;
  let fence: Fence | null = null;
  let codeTicks = 0;
  let hasMath = false;

  while (cursor < markdown.length) {
    const atLineStart = cursor === 0 || markdown[cursor - 1] === '\n';
    if (atLineStart && codeTicks === 0) {
      const end = lineEnd(markdown, cursor);
      const line = markdown.slice(cursor, end);
      if (fence) {
        output += line;
        if (closesFence(line, fence)) fence = null;
        cursor = end;
        continue;
      }
      const openingFence = fenceForLine(line);
      if (openingFence || /^(?: {4}|\t)/.test(line)) {
        output += line;
        fence = openingFence;
        cursor = end;
        continue;
      }
      const compactDisplayMath = expandCompactDisplayMath(line);
      if (compactDisplayMath) {
        output += compactDisplayMath;
        hasMath = true;
        cursor = end;
        continue;
      }
    }

    const character = markdown[cursor];
    if (character === '`') {
      const ticks = runLength(markdown, cursor, '`');
      if (codeTicks === 0) codeTicks = ticks;
      else if (ticks === codeTicks) codeTicks = 0;
      output += markdown.slice(cursor, cursor + ticks);
      cursor += ticks;
      continue;
    }
    if (codeTicks > 0) {
      output += character;
      cursor += 1;
      continue;
    }

    if (
      character === '$'
      && markdown[cursor + 1] !== '$'
      && !isEscaped(markdown, cursor)
      && isCurrencyDollar(markdown, cursor)
    ) {
      output += '\\$';
      cursor += 1;
      continue;
    }

    if (character === '$' && !isEscaped(markdown, cursor)) {
      hasMath = true;
    }

    if (
      character === '\\'
      && (markdown[cursor + 1] === '(' || markdown[cursor + 1] === '[')
      && !isEscaped(markdown, cursor)
    ) {
      const inline = markdown[cursor + 1] === '(';
      const close = inline ? ')' : ']';
      const closing = findBackslashMathClose(markdown, cursor + 2, close, inline);
      if (closing !== -1) {
        const content = markdown.slice(cursor + 2, closing);
        hasMath = true;
        if (inline) {
          output += `$${content}$`;
        } else {
          const currentLineStart = markdown.lastIndexOf('\n', cursor - 1) + 1;
          const currentLineEnd = markdown.indexOf('\n', closing + 2);
          const suffixEnd = currentLineEnd === -1 ? markdown.length : currentLineEnd;
          const standalone = /^ {0,3}$/.test(markdown.slice(currentLineStart, cursor))
            && /^\s*$/.test(markdown.slice(closing + 2, suffixEnd));
          output += standalone
            ? `$$\n${content}\n$$`
            : `\n\n$$\n${content}\n$$\n\n`;
        }
        cursor = closing + 2;
        continue;
      }
      // CommonMark consumes a lone backslash before punctuation. Doubling it
      // keeps an incomplete streaming delimiter visible until its close arrives.
      output += `\\\\${markdown[cursor + 1]}`;
      cursor += 2;
      continue;
    }

    if (
      character === '\\'
      && (markdown[cursor + 1] === ')' || markdown[cursor + 1] === ']')
      && !isEscaped(markdown, cursor)
    ) {
      output += `\\\\${markdown[cursor + 1]}`;
      cursor += 2;
      continue;
    }

    output += character;
    cursor += 1;
  }

  return { markdown: output, hasMath };
}

export function normalizeAgentMathDelimiters(markdown: string): string {
  return prepareAgentMathMarkdown(markdown).markdown;
}
