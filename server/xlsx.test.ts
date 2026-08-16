import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import init, { Workbook } from '@dukelib/sheets-wasm';
import { strToU8, zipSync } from 'fflate';
import { detectViewerFormat, isConvertibleSource, isXlsxFile, matchesSearchTypes } from './format.ts';
import { closeStateDb } from './state-db.ts';
import { setDerivedNoteIndexer } from './conversion.ts';
import { currentDerivedTextPathForXlsx, derivedTextPathForXlsx, extractXlsxText, inspectXlsxContainer, maybeConvertXlsx, readBoundedXlsx, XLSX_LIMITS } from './xlsx.ts';

const require = createRequire(import.meta.url);
const dukeModulePath = require.resolve('@dukelib/sheets-wasm');
await init({ module_or_path: fs.readFileSync(path.join(path.dirname(dukeModulePath), 'duke_sheets_wasm_bg.wasm')) });

test('XLSX format detection is case-insensitive and excludes Office temporary files', () => {
  assert.equal(isXlsxFile('Budget.XLSX'), true);
  assert.equal(detectViewerFormat('Budget.XLSX'), 'xlsx');
  assert.equal(isConvertibleSource('Budget.XLSX'), true);
  assert.equal(matchesSearchTypes('Budget.XLSX', ['spreadsheets']), true);
  assert.equal(isXlsxFile('~$Budget.xlsx'), false);
  assert.equal(detectViewerFormat('.~Budget.xlsx'), null);
  assert.equal(isConvertibleSource('~$Budget.xlsx'), false);
});

test('XLSX extraction preserves sheet order, A1 coordinates, values, and inert formulas', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-xlsx-'));
  const source = path.join(temp, 'quarterly.xlsx');
  const workbook = new Workbook();
  try {
    const first = workbook.getSheet(0);
    first.setCell('A1', 'Revenue');
    first.setCell('B2', 42);
    first.setFormula('C2', '=B2*2');
    first.free();
    const secondIndex = workbook.addSheet('Forecast');
    const second = workbook.getSheet(secondIndex);
    second.setCell('A1', true);
    second.free();
    fs.writeFileSync(source, workbook.saveXlsxBytes());
  } finally {
    workbook.free();
  }
  try {
    const text = await extractXlsxText(source);
    assert.match(text, /^# Workbook: quarterly\.xlsx/m);
    assert.ok(text.indexOf('## Worksheet 1: Sheet1') < text.indexOf('## Worksheet 2: Forecast'));
    assert.match(text, /A1: Revenue/);
    assert.match(text, /B2: 42/);
    assert.match(text, /C2: .+\[formula: =?B2\*2\]/);
    assert.match(text, /## Worksheet 2: Forecast[\s\S]*A1: TRUE/i);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('XLSX ZIP preflight rejects malformed containers', () => {
  assert.throws(() => inspectXlsxContainer(Buffer.from('not a zip')), /Malformed XLSX ZIP directory/);
});

function zipped(entries: Record<string, string>): Buffer {
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(entries).map(([name, value]) => [name, strToU8(value)]))));
}

function withEocdMutation(bytes: Buffer, mutate: (copy: Buffer, eocd: number) => void): Buffer {
  const copy = Buffer.from(bytes);
  const eocd = copy.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0);
  mutate(copy, eocd);
  return copy;
}

test('XLSX ZIP preflight rejects encrypted, ZIP64, unsafe, expanded, worksheet, and image bounds', () => {
  const ordinary = zipped({ 'xl/worksheets/sheet1.xml': '<worksheet/>', 'xl/media/image1.png': 'image' });
  const encrypted = Buffer.from(ordinary);
  const central = encrypted.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  encrypted.writeUInt16LE(encrypted.readUInt16LE(central + 8) | 1, central + 8);
  assert.throws(() => inspectXlsxContainer(encrypted), /Encrypted workbooks/);
  assert.throws(() => inspectXlsxContainer(withEocdMutation(ordinary, (copy, eocd) => copy.writeUInt16LE(0xffff, eocd + 10))), /ZIP64/);
  assert.throws(() => inspectXlsxContainer(zipped({ '../unsafe.xml': 'x' })), /Unsafe XLSX ZIP path/);
  assert.throws(() => inspectXlsxContainer(ordinary, { ...XLSX_LIMITS, expandedBytes: 3 }), /expanded-size limit/);
  assert.throws(() => inspectXlsxContainer(zipped({
    'xl/worksheets/sheet1.xml': '1',
    'xl/worksheets/sheet2.xml': '2',
  }), { ...XLSX_LIMITS, worksheets: 1 }), /too many worksheets/);
  assert.throws(() => inspectXlsxContainer(ordinary, { ...XLSX_LIMITS, imageBytes: 2 }), /image-size limit/);
});

test('XLSX extraction enforces cell, aggregate grid, output, cancellation, and timeout bounds', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-xlsx-extraction-limits-'));
  const source = path.join(temp, 'bounded.xlsx');
  const workbook = new Workbook();
  try {
    const sheet = workbook.getSheet(0);
    sheet.setCell('A1', 'alpha');
    sheet.setCell('C2', 'omega');
    sheet.free();
    fs.writeFileSync(source, workbook.saveXlsxBytes());
  } finally { workbook.free(); }
  try {
    await assert.rejects(extractXlsxText(source, undefined, { ...XLSX_LIMITS, cells: 1 }), /too many cells/);
    await assert.rejects(extractXlsxText(source, undefined, { ...XLSX_LIMITS, gridSlots: 5 }), /used ranges are too sparse or large/);
    await assert.rejects(extractXlsxText(source, undefined, { ...XLSX_LIMITS, outputBytes: 4 }), /safe output limit/);
    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(extractXlsxText(source, cancelled.signal), /cancelled/);
    await assert.rejects(extractXlsxText(source, undefined, { ...XLSX_LIMITS, timeoutMs: 0 }), /timed out/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('XLSX freshness rejects timestamp-preserving source replacement', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-xlsx-freshness-'));
  const previousRoot = process.env.STASHBASE_LOCAL_DATA_ROOT;
  process.env.STASHBASE_LOCAL_DATA_ROOT = path.join(temp, 'app-data');
  const source = path.join(temp, 'freshness.xlsx');
  const create = (value: string) => {
    const workbook = new Workbook();
    try {
      const sheet = workbook.getSheet(0);
      sheet.setCell('A1', value);
      sheet.free();
      return Buffer.from(workbook.saveXlsxBytes());
    } finally { workbook.free(); }
  };
  try {
    fs.writeFileSync(source, create('first'));
    const completion = maybeConvertXlsx(source, { urgency: 'interactive' });
    assert.ok(completion);
    await completion;
    const derived = derivedTextPathForXlsx(source);
    assert.equal(currentDerivedTextPathForXlsx(source), derived);
    const originalTimes = fs.statSync(source);
    fs.writeFileSync(source, create('second'));
    fs.utimesSync(source, originalTimes.atime, originalTimes.mtime);
    assert.equal(currentDerivedTextPathForXlsx(source), null);
  } finally {
    closeStateDb();
    if (previousRoot === undefined) delete process.env.STASHBASE_LOCAL_DATA_ROOT;
    else process.env.STASHBASE_LOCAL_DATA_ROOT = previousRoot;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('XLSX conversion retires a late generation after the source changes during indexing', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-xlsx-generation-'));
  const previousRoot = process.env.STASHBASE_LOCAL_DATA_ROOT;
  process.env.STASHBASE_LOCAL_DATA_ROOT = path.join(temp, 'app-data');
  const source = path.join(temp, 'generation.xlsx');
  const create = (value: string) => {
    const workbook = new Workbook();
    try {
      const sheet = workbook.getSheet(0);
      sheet.setCell('A1', value);
      sheet.free();
      return Buffer.from(workbook.saveXlsxBytes());
    } finally { workbook.free(); }
  };
  let releaseFirstIndex!: () => void;
  const firstIndexGate = new Promise<void>((resolve) => { releaseFirstIndex = resolve; });
  let indexCalls = 0;
  setDerivedNoteIndexer(async () => {
    indexCalls += 1;
    if (indexCalls === 1) await firstIndexGate;
  });
  try {
    fs.writeFileSync(source, create('first generation'));
    const completion = maybeConvertXlsx(source, { urgency: 'interactive' });
    assert.ok(completion);
    for (let attempt = 0; attempt < 100 && indexCalls === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(indexCalls, 1);
    fs.writeFileSync(source, create('second generation'));
    releaseFirstIndex();
    await completion;
    const derived = derivedTextPathForXlsx(source);
    assert.equal(fs.existsSync(derived), false);
    const replacementCompletion = maybeConvertXlsx(source, { urgency: 'interactive' });
    assert.ok(replacementCompletion);
    await replacementCompletion;
    assert.match(fs.readFileSync(derived, 'utf8'), /A1: second generation/);
    assert.doesNotMatch(fs.readFileSync(derived, 'utf8'), /A1: first generation/);
    assert.ok(indexCalls >= 2);
  } finally {
    releaseFirstIndex();
    setDerivedNoteIndexer(async () => undefined);
    closeStateDb();
    if (previousRoot === undefined) delete process.env.STASHBASE_LOCAL_DATA_ROOT;
    else process.env.STASHBASE_LOCAL_DATA_ROOT = previousRoot;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('XLSX reads reject oversized sources before allocating their contents', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-xlsx-limit-'));
  const source = path.join(temp, 'oversized.xlsx');
  try {
    fs.writeFileSync(source, Buffer.alloc(0));
    fs.truncateSync(source, XLSX_LIMITS.compressedBytes + 1);
    await assert.rejects(readBoundedXlsx(source), /25 MiB compressed-size limit/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
