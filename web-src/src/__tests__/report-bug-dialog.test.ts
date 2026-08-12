import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { initialReportFormState, ReportBugController, reportDialogTransition, type ReportBugControllerState } from '../components/ReportBugDialog';
import { createLatestReportRequest, GITHUB_FIELD_MAX_LENGTH, type ReportDraft } from '../reportBug';

const draft: ReportDraft = {
  id: 'report-1', screenshotDataUrl: 'data:image/png;base64,AA==', logExcerpt: 'safe log', errorDetails: 'safe error',
  diagnostics: { version: '1.2.3', platform: 'darwin', release: '25.0', arch: 'arm64', timestamp: '2026-08-12T00:00:00.000Z', packaged: true },
};

test('every report opening starts with fresh descriptions and privacy choices', () => {
  const first = initialReportFormState(draft);
  first.happened = 'old incident';
  first.includeLogs = false;
  const reopened = initialReportFormState(draft);
  assert.deepEqual(reopened, { happened: '', expected: '', steps: '', includeScreenshot: true, includeLogs: true, includeErrorDetails: true });
});

test('report dialog participates in overlay ownership and exposes error review', () => {
  const component = fs.readFileSync(path.join(process.cwd(), 'web-src/src/components/ReportBugSurface.tsx'), 'utf8');
  assert.match(component, /useOverlayLayer\(open\)/);
  assert.match(component, /!nextOpen && !busy && layer\.isTopmost/);
  assert.match(component, /Include renderer error details/);
  assert.match(component, /draft\.errorDetails/);
  assert.doesNotMatch(component, /<textarea|<input/);
  assert.match(component, /<Textarea disabled=\{busy\} maxLength=\{GITHUB_FIELD_MAX_LENGTH\}/);
  assert.match(component, /<Checkbox disabled=\{busy\} checked=/);
});

test('report controller stays eager while its presentation loads on demand', () => {
  const controller = fs.readFileSync(path.join(process.cwd(), 'web-src/src/components/ReportBugDialog.tsx'), 'utf8');
  const launcher = fs.readFileSync(path.join(process.cwd(), 'web-src/src/components/ReportBugLauncher.tsx'), 'utf8');
  assert.match(controller, /lazyWithRetry\(\(\) => import\('\.\/ReportBugSurface'\)\)/);
  assert.match(controller, /state\.open && <LazyReportBugSurface/);
  assert.match(launcher, /lazyWithRetry\(\(\) => import\('\.\/ReportBugDialog'\)\)/);
  assert.match(launcher, /bridge\?\.onOpen/);
  assert.match(launcher, /stashbase-report-bug/);
});

test('only the latest overlapping preparation request may update the dialog', () => {
  const requests = createLatestReportRequest();
  const slowMenuRequest = requests.begin();
  const errorBoundaryRequest = requests.begin();
  assert.equal(requests.isCurrent(slowMenuRequest), false);
  assert.equal(requests.isCurrent(errorBoundaryRequest), true);
  requests.invalidate();
  assert.equal(requests.isCurrent(errorBoundaryRequest), false);
});

test('renderer and main share a conservative GitHub field limit', () => {
  assert.equal(GITHUB_FIELD_MAX_LENGTH, 1200);
});

test('capture completes before the report review overlay becomes visible', () => {
  const capturing = reportDialogTransition({ open: true, draft: draft }, { type: 'capture-started' });
  assert.deepEqual(capturing, { open: false, draft: null });
  const review = reportDialogTransition(capturing, { type: 'capture-completed', draft });
  assert.deepEqual(review, { open: true, draft });
});

test('a root recovery boundary covers providers and the independently isolated report surface', () => {
  const app = fs.readFileSync(path.join(process.cwd(), 'web-src/src/App.tsx'), 'utf8');
  assert.match(app, /<ErrorBoundary>\s*<OverlayStackProvider>/);
  assert.match(app, /<\/ErrorBoundary>\s*<ReportBugLauncher \/>/);
});

test('mounted report controller prepares immediately, hides capture, forwards reviewed controls, and locks actions', async () => {
  const previousWindow = globalThis.window;
  const reactGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = reactGlobal.IS_REACT_ACT_ENVIRONMENT;
  reactGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const eventTarget = new EventTarget() as Window & typeof globalThis;
  const prepareResolvers: Array<(value: ReportDraft) => void> = [];
  const actionInputs: Array<{ kind: string; input: unknown }> = [];
  let resolveSave = (_value: boolean) => {};
  const savePending = new Promise<boolean>((resolve) => { resolveSave = resolve; });
  Object.assign(eventTarget, {
    electron: { reportBug: {
      onOpen: () => () => {},
      prepare: () => new Promise<ReportDraft>((resolve) => prepareResolvers.push(resolve)),
      copy: async (input: unknown) => { actionInputs.push({ kind: 'copy', input }); return true; },
      save: (input: unknown) => { actionInputs.push({ kind: 'save', input }); return savePending; },
      submit: async (input: unknown) => { actionInputs.push({ kind: 'submit', input }); return { message: 'opened' }; },
    } },
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: eventTarget });

  let state: ReportBugControllerState | undefined;
  let crashPresentation = false;
  const CrashingPresentation = () => { throw new Error('report presentation failed'); };
  class TestBoundary extends React.Component<{ children?: React.ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() { return this.state.failed ? null : this.props.children; }
  }
  let renderer: ReactTestRenderer;
  await act(async () => { renderer = create(React.createElement(ReportBugController, {
    initialErrorDetails: '',
    children: (value: ReportBugControllerState) => {
      state = value;
      return React.createElement(TestBoundary, { key: value.surfaceGeneration }, value.open && crashPresentation ? React.createElement(CrashingPresentation) : null);
    },
  })); });

  assert.equal(state?.open, false);
  assert.equal(prepareResolvers.length, 1);
  crashPresentation = true;
  await act(async () => { prepareResolvers[0](draft); });
  assert.equal(state?.open, true);
  await act(async () => { state?.patchForm({ happened: 'Frozen', includeScreenshot: false, includeLogs: true }); });

  let saving: Promise<void> | undefined;
  await act(async () => { saving = state?.act('save'); });
  assert.equal(state?.busy, true);
  await act(async () => { await state?.act('submit'); });
  assert.equal(actionInputs.length, 1);
  assert.equal(prepareResolvers.length, 1);
  assert.deepEqual(actionInputs[0], { kind: 'save', input: { id: 'report-1', happened: 'Frozen', expected: '', steps: '', includeScreenshot: false, includeLogs: true, includeErrorDetails: true } });
  await act(async () => { resolveSave(true); await saving; });
  assert.equal(state?.busy, false);

  await act(async () => { renderer.unmount(); });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
  reactGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});
