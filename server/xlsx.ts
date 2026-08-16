/** Bounded XLSX -> source-attributed Markdown extraction. */
import fs, { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { derivedDir, derivedNoteFor } from './derived-store.ts';
import { derivedIsFresh, discoverNewSources, indexFreshDerived, maybeConvert, TransientConversionError, type ConversionSpec } from './conversion.ts';
import { isXlsxFile } from './format.ts';

export const XLSX_LIMITS = Object.freeze({
  compressedBytes: 25 * 1024 * 1024,
  expandedBytes: 200 * 1024 * 1024,
  worksheets: 200,
  cells: 500_000,
  gridSlots: 2_000_000,
  imageBytes: 50 * 1024 * 1024,
  outputBytes: 32 * 1024 * 1024,
  timeoutMs: 60_000,
});
export type XlsxLimits = { [Key in keyof typeof XLSX_LIMITS]: number };
const COMPLETE_MARKER = '<!-- stashbase-xlsx-conversion: complete -->';
const IDENTITY_MARKER_RE = /<!-- stashbase-xlsx-source: ([^ ]+) -->/;
const moduleRequire = createRequire(import.meta.url);
const dukeModulePath = moduleRequire.resolve('@dukelib/sheets-wasm');
const dukeModuleUrl = pathToFileURL(dukeModulePath).href;
const dukeWasmPath = path.join(path.dirname(dukeModulePath), 'duke_sheets_wasm_bg.wasm');

type WorkerReply = { ok: true; markdown: string } | { ok: false; error: string };

const WORKER_SOURCE = String.raw`
void import('node:worker_threads').then(async ({ parentPort, workerData }) => {
  let workbook;
  try {
    const fs = await import('node:fs');
    const duke = await import(workerData.dukeModuleUrl);
    duke.initSync({ module: fs.readFileSync(workerData.dukeWasmPath) });
    const bytes = Buffer.from(workerData.bytes);
    workbook = duke.Workbook.fromBytes(bytes);
    if (workbook.sheetCount > workerData.limits.worksheets) throw new Error('Workbook has too many worksheets');
    let totalCells = 0;
    let totalGridSlots = 0;
    let outputBytes = 0;
    const lines = ['# Workbook: ' + escapeText(workerData.fileName), ''];
    for (let sheetIndex = 0; sheetIndex < workbook.sheetCount; sheetIndex += 1) {
      const sheet = workbook.getSheet(sheetIndex);
      try {
        totalCells += sheet.cellCount;
        if (totalCells > workerData.limits.cells) throw new Error('Workbook has too many cells');
        lines.push('## Worksheet ' + (sheetIndex + 1) + ': ' + escapeText(sheet.name), '');
        const range = sheet.usedRange();
        if (!Array.isArray(range) || range.length !== 4) throw new Error('Workbook returned an invalid used range');
        const [startRow, startCol, endRow, endCol] = range;
        if (![startRow, startCol, endRow, endCol].every(Number.isSafeInteger) || startRow < 0 || startCol < 0 || endRow < startRow || endCol < startCol) {
          throw new Error('Workbook returned an invalid used range');
        }
        const gridSlots = (endRow - startRow + 1) * (endCol - startCol + 1);
        if (!Number.isSafeInteger(gridSlots)) throw new Error('Worksheet used range is too sparse or large');
        totalGridSlots += gridSlots;
        if (totalGridSlots > workerData.limits.gridSlots) throw new Error('Workbook used ranges are too sparse or large');
        for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
          const entries = [];
          for (let colIndex = startCol; colIndex <= endCol; colIndex += 1) {
            const address = columnName(colIndex) + String(rowIndex + 1);
            const value = normalize(sheet.getFormattedValueAt(rowIndex, colIndex));
            const formula = normalize(sheet.getFormulaAt(rowIndex, colIndex) || '');
            if (!value && !formula) continue;
            entries.push(address + ': ' + value + (formula ? ' [formula: ' + formula + ']' : ''));
          }
          if (entries.length) {
            const line = entries.join(' | ');
            outputBytes += Buffer.byteLength(line) + 1;
            if (outputBytes > workerData.limits.outputBytes) throw new Error('Extracted workbook text exceeds the safe output limit');
            lines.push(line);
          }
        }
        lines.push('');
      } finally { sheet.free(); }
    }
    lines.push(workerData.completeMarker, '');
    parentPort.postMessage({ ok: true, markdown: lines.join('\n') });
  } catch (error) {
    parentPort.postMessage({ ok: false, error: error && error.message ? error.message : String(error) });
  } finally { try { workbook?.free(); } catch {} }

  function normalize(value) { return String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|').trim(); }
  function escapeText(value) { return normalize(value).replace(/([#*_])/g, '\\$1'); }
  function columnName(index) { let n = index + 1, out = ''; while (n > 0) { n -= 1; out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26); } return out; }
});`;

export function derivedTextPathForXlsx(sourceAbs: string): string { return derivedNoteFor(sourceAbs); }

export function currentDerivedTextPathForXlsx(sourceAbs: string, known?: { sourceMtimeMs: number; derivedMtimeMs: number }): string | null {
  return derivedIsFresh(XLSX_SPEC, sourceAbs, known) ? derivedTextPathForXlsx(sourceAbs) : null;
}

export async function currentDerivedTextPathForXlsxAsync(sourceAbs: string, known: { sourceMtimeMs: number; derivedMtimeMs: number }): Promise<string | null> {
  if (known.derivedMtimeMs < known.sourceMtimeMs) return null;
  const output = derivedTextPathForXlsx(sourceAbs);
  try {
    const handle = await fs.promises.open(output, 'r');
    try {
      const size = (await handle.stat()).size;
      const length = Math.min(size, 2048);
      const tail = Buffer.alloc(length);
      await handle.read(tail, 0, length, size - length);
      return xlsxTailMatchesSource(tail.toString('utf8'), sourceAbs) ? output : null;
    } finally { await handle.close(); }
  } catch { return null; }
}

export function inspectXlsxContainer(bytes: Buffer, limits: XlsxLimits = XLSX_LIMITS): void {
  if (bytes.length > limits.compressedBytes) throw new Error('Workbook exceeds the compressed-size limit');
  const eocd = findSignatureBackwards(bytes, 0x06054b50, Math.max(0, bytes.length - 65_557));
  if (eocd < 0 || eocd + 22 > bytes.length) throw new Error('Malformed XLSX ZIP directory');
  const entries = bytes.readUInt16LE(eocd + 10);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  if (entries === 0xffff || centralOffset === 0xffffffff) throw new Error('ZIP64 XLSX files are not supported');
  let offset = centralOffset;
  let expanded = 0;
  let imageBytes = 0;
  let worksheets = 0;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('Malformed XLSX ZIP entry');
    const flags = bytes.readUInt16LE(offset + 8);
    if ((flags & 1) !== 0) throw new Error('Encrypted workbooks are not supported');
    const uncompressed = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const nameEnd = offset + 46 + nameLength;
    if (nameEnd > bytes.length) throw new Error('Malformed XLSX ZIP entry name');
    const name = bytes.subarray(offset + 46, nameEnd).toString('utf8').replace(/\\/g, '/');
    if (name.startsWith('/') || name.split('/').includes('..') || name.includes('\0')) throw new Error('Unsafe XLSX ZIP path');
    expanded += uncompressed;
    if (expanded > limits.expandedBytes) throw new Error('Workbook exceeds the expanded-size limit');
    if (/^xl\/media\//i.test(name)) imageBytes += uncompressed;
    if (/^xl\/worksheets\/[^/]+\.xml$/i.test(name)) worksheets += 1;
    if (worksheets > limits.worksheets) throw new Error('Workbook has too many worksheets');
    if (imageBytes > limits.imageBytes) throw new Error('Workbook images exceed the image-size limit');
    offset = nameEnd + extraLength + commentLength;
  }
}

function findSignatureBackwards(bytes: Buffer, signature: number, start: number): number {
  for (let offset = bytes.length - 22; offset >= start; offset -= 1) if (bytes.readUInt32LE(offset) === signature) return offset;
  return -1;
}

export async function extractXlsxText(sourceAbs: string, signal?: AbortSignal, limits: XlsxLimits = XLSX_LIMITS): Promise<string> {
  const bytes = await readBoundedXlsx(sourceAbs);
  inspectXlsxContainer(bytes, limits);
  if (signal?.aborted) throw new TransientConversionError('xlsx_extract cancelled');
  return await new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { bytes, fileName: path.basename(sourceAbs), dukeModuleUrl, dukeWasmPath, limits, completeMarker: COMPLETE_MARKER } });
    let settled = false;
    const finish = (error?: Error, markdown?: string) => {
      if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); worker.removeAllListeners();
      void worker.terminate().catch(() => undefined).then(() => error ? reject(error) : resolve(markdown!));
    };
    const abort = () => finish(new TransientConversionError('xlsx_extract cancelled'));
    const timer = setTimeout(() => finish(new Error(`xlsx_extract timed out after ${limits.timeoutMs}ms`)), limits.timeoutMs);
    timer.unref?.();
    worker.once('message', (reply: WorkerReply) => reply.ok ? finish(undefined, reply.markdown) : finish(new Error(reply.error)));
    worker.once('error', (error) => finish(error));
    worker.once('exit', (code) => { if (!settled) finish(new Error(`XLSX worker exited before producing a result (code ${code})`)); });
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
  });
}

export async function readBoundedXlsx(sourceAbs: string): Promise<Buffer> {
  const handle = await fs.promises.open(sourceAbs, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('XLSX source is not a file');
    if (stat.size > XLSX_LIMITS.compressedBytes) throw new Error('Workbook exceeds the 25 MiB compressed-size limit');
    const bytes = Buffer.allocUnsafe(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) throw new Error('Workbook changed while it was being read');
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) {
      throw new TransientConversionError('xlsx source changed while it was being read');
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

function derivedXlsxIsComplete(_sourceAbs: string, output: string): boolean {
  let handle: number | null = null;
  try {
    handle = fs.openSync(output, 'r');
    const size = fs.fstatSync(handle).size;
    const length = Math.min(size, 2048);
    const tail = Buffer.alloc(length);
    fs.readSync(handle, tail, 0, length, size - length);
    return xlsxTailMatchesSource(tail.toString('utf8'), _sourceAbs);
  } catch { return false; }
  finally { if (handle != null) fs.closeSync(handle); }
}

function cleanup(sourceAbs: string): void { rmSync(derivedTextPathForXlsx(sourceAbs), { force: true }); }

async function convert(sourceAbs: string, _progress?: unknown, signal?: AbortSignal): Promise<void> {
  mkdirSync(derivedDir(), { recursive: true });
  const output = derivedTextPathForXlsx(sourceAbs);
  const temporary = `${output}.${process.pid}.${Date.now()}.tmp`;
  const identity = sourceIdentity(sourceAbs);
  try {
    const extracted = await extractXlsxText(sourceAbs, signal);
    if (sourceIdentity(sourceAbs) !== identity) throw new TransientConversionError('xlsx source changed during extraction');
    const text = extracted.replace(COMPLETE_MARKER, `${sourceIdentityMarker(identity)}\n${COMPLETE_MARKER}`);
    await fs.promises.writeFile(temporary, text, { encoding: 'utf8', flag: 'wx' });
    await fs.promises.rename(temporary, output);
  }
  finally { await fs.promises.rm(temporary, { force: true }); }
}

function sourceIdentity(sourceAbs: string): string {
  const stat = fs.statSync(sourceAbs, { bigint: true });
  if (!stat.isFile()) throw new Error('XLSX source is not a file');
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
}

function sourceIdentityMarker(identity: string): string { return `<!-- stashbase-xlsx-source: ${identity} -->`; }

function xlsxTailMatchesSource(tail: string, sourceAbs: string): boolean {
  if (!tail.includes(COMPLETE_MARKER)) return false;
  const recorded = tail.match(IDENTITY_MARKER_RE)?.[1];
  if (!recorded) return false;
  try { return recorded === sourceIdentity(sourceAbs); } catch { return false; }
}

const XLSX_SPEC: ConversionSpec = { kind: 'xlsx_extract', lane: 'light', cost: 1, matches: isXlsxFile, derivedNote: derivedTextPathForXlsx, derivedReady: derivedXlsxIsComplete, convert, cleanupDerived: cleanup };
export function maybeConvertXlsx(sourceAbs: string, opts: { urgency?: 'interactive' } = {}): Promise<void> | null { return maybeConvert(sourceAbs, XLSX_SPEC, { urgency: opts.urgency ?? 'background' }); }
export function discoverNewXlsx(folderAbs: string): void { discoverNewSources(folderAbs, XLSX_SPEC); }
export function indexFreshXlsx(sourceAbs: string): Promise<boolean> { return indexFreshDerived(sourceAbs, XLSX_SPEC); }
