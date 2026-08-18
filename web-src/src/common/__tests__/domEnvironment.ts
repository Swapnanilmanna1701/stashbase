/**
 * Installs a happy-dom document as the process globals.
 *
 * IMPORT THIS FIRST in any renderer test that mounts a component. ES module
 * graphs evaluate depth-first in import-statement order, and several
 * dependencies (Base UI's portals, floating-ui) latch "am I in a browser?"
 * at MODULE SCOPE. If a component module is imported before this one, those
 * libraries decide they are on a server and render nothing — the portal
 * surfaces (dialogs, menus, toasts, tooltips) silently come back empty.
 *
 * `pnpm test:renderer` runs one process per test file, so the globals stay
 * scoped to the file that asked for them.
 */
import { Window } from 'happy-dom';

const window = new Window({ url: 'http://localhost/' });

const globals: Record<string, unknown> = {
  window,
  self: window,
  document: window.document,
  navigator: window.navigator,
  location: window.location,
  history: window.history,
  getComputedStyle: window.getComputedStyle.bind(window),
  getSelection: window.getSelection.bind(window),
  matchMedia: window.matchMedia.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  // Editor stacks (Milkdown/ProseMirror) register window listeners through
  // the bare global, not through `window.`.
  addEventListener: window.addEventListener.bind(window),
  removeEventListener: window.removeEventListener.bind(window),
  dispatchEvent: window.dispatchEvent.bind(window),
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  devicePixelRatio: window.devicePixelRatio,
  IS_REACT_ACT_ENVIRONMENT: true,
};

// Constructors and DOM interfaces used by `instanceof` checks in React DOM,
// Base UI, and the components themselves. Copied by name rather than
// wholesale so an unexpected happy-dom addition cannot shadow a Node builtin.
for (const name of [
  'CSS', 'CustomEvent', 'DOMRect', 'DataTransfer', 'DragEvent', 'Element',
  'Event', 'EventTarget', 'FocusEvent', 'HTMLAnchorElement', 'HTMLButtonElement',
  'HTMLCanvasElement', 'HTMLDialogElement', 'HTMLDivElement', 'HTMLElement',
  'HTMLIFrameElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Image',
  'InputEvent', 'IntersectionObserver', 'KeyboardEvent', 'MouseEvent',
  'MutationObserver', 'Node', 'NodeFilter', 'PointerEvent', 'Range',
  'ResizeObserver', 'Selection', 'ShadowRoot', 'SVGElement', 'Text',
  'TouchEvent', 'UIEvent', 'WheelEvent', 'XMLSerializer',
]) {
  const value = (window as unknown as Record<string, unknown>)[name];
  if (value !== undefined) globals[name] = value;
}

for (const [name, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

// Canvas geometry interfaces pdf.js reads at MODULE scope — importing
// `pdfjs-dist` throws on a bare `DOMMatrix` reference before any component
// mounts. happy-dom does not implement them, and the renderer tests never
// rasterize a page, so a constructible placeholder is the whole requirement.
// Only defined when absent, so a real implementation always wins.
for (const name of ['DOMMatrix', 'DOMPoint', 'Path2D', 'ImageData']) {
  if ((globalThis as Record<string, unknown>)[name] === undefined) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: class {},
    });
  }
}

/** The happy-dom window backing the installed globals. */
export const testWindow = window;
