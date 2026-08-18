// Renderer modules use two specifier forms that only Vite understands, and
// `pnpm test:renderer` loads those modules straight through `node --test`
// rather than through Vite. Node's own resolution has no concept of either,
// so importing the component would throw before a single assertion ran.
// This hook stands in for exactly those two forms and nothing else; Vite
// still processes the real imports for dev and the packaged build.

const CSS_STUB = 'css-stub:';
const WORKER_STUB = 'worker-stub:';

export async function resolve(specifier, context, nextResolve) {
  // Colocated component CSS. Nothing in a stylesheet is observable from a
  // mounted component, so an empty module is a complete stand-in.
  if (specifier.endsWith('.css')) {
    return { url: `${CSS_STUB}${specifier}`, shortCircuit: true };
  }
  // Vite's `?worker` suffix, which compiles a module into a Worker
  // constructor. Only `PdfPreview` uses it, to wrap the pdf.js worker with
  // the Map-upsert polyfill Electron's V8 lacks. Node cannot build a real
  // Worker from it, and the polyfill is a runtime concern the renderer
  // tests do not exercise — but without a stand-in the module cannot be
  // imported at all, which is what previously forced PdfPreview's
  // invariants to be asserted against its source text.
  if (specifier.endsWith('?worker')) {
    return { url: `${WORKER_STUB}${specifier}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith(CSS_STUB)) {
    return { format: 'module', source: 'export {};', shortCircuit: true };
  }
  if (url.startsWith(WORKER_STUB)) {
    // Worker-shaped rather than empty: callers do `new PdfWorker()` and hand
    // the instance's `port` to pdf.js, so the stub has to be constructible
    // and carry the MessagePort surface pdf.js reaches for. It moves no
    // messages — a test that needs real worker traffic cannot run under Node
    // regardless.
    return {
      format: 'module',
      shortCircuit: true,
      source: [
        'function StubMessagePort() {}',
        'StubMessagePort.prototype.postMessage = function () {};',
        'StubMessagePort.prototype.start = function () {};',
        'StubMessagePort.prototype.close = function () {};',
        'StubMessagePort.prototype.addEventListener = function () {};',
        'StubMessagePort.prototype.removeEventListener = function () {};',
        'function StubViteWorker() { this.port = new StubMessagePort(); }',
        'StubViteWorker.prototype.postMessage = function () {};',
        'StubViteWorker.prototype.terminate = function () {};',
        'StubViteWorker.prototype.addEventListener = function () {};',
        'StubViteWorker.prototype.removeEventListener = function () {};',
        'export default StubViteWorker;',
      ].join('\n'),
    };
  }
  return nextLoad(url, context);
}
