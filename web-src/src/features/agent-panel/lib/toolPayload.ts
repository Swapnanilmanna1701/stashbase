/**
 * Human-facing formatting for tool payloads and results. Tool payloads
 * render for HUMANS deciding or inspecting, not for machines: hoist
 * MCP-style `arguments`, drop empty scaffolding fields (`server: ""`),
 * and print string values verbatim — real newlines, clipped to a
 * screenful — never a JSON-escaped dump of a whole document.
 */

const PAYLOAD_LINE_LIMIT = 14;
const PAYLOAD_CHAR_LIMIT = 1200;

/** One-line clip for row targets (commands, queries). */
export const clipInline = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);

/** Clip a tool result to a screenful. */
export const clipResult = (s: string) => (s.length > 4000 ? s.slice(0, 4000) + '\n…(truncated)' : s);

function clipPayloadText(value: string): string {
  let out = value.split('\n').slice(0, PAYLOAD_LINE_LIMIT).join('\n');
  if (out.length > PAYLOAD_CHAR_LIMIT) out = out.slice(0, PAYLOAD_CHAR_LIMIT);
  if (out.length < value.length) {
    return `${out}\n… (+${(value.length - out.length).toLocaleString()} chars)`;
  }
  return out;
}

/** MCP wrappers nest the real payload under `arguments`; direct tools
 *  carry it at the top level. */
export function mcpArgs(input: Record<string, unknown>): Record<string, unknown> {
  const nested = input.arguments;
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : input;
}

/** Falls back to pretty JSON when nothing survives the filter. */
export function payloadPreview(input: Record<string, unknown>): string {
  const args = mcpArgs(input);
  const lines: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (value == null || value === '') continue;
    if (typeof value === 'string') {
      const text = clipPayloadText(value);
      lines.push(text.includes('\n') || text.length > 100 ? `${key}:\n${text}` : `${key}: ${text}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value, null, 2)}`);
    }
  }
  return lines.length ? lines.join('\n\n') : JSON.stringify(input, null, 2);
}
