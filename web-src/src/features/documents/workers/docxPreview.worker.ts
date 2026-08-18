import mammoth from 'mammoth';
import { sanitizeDocxHtml } from '@shared/html-sanitization';

interface DocxPreviewRequest {
  arrayBuffer: ArrayBuffer;
}

type DocxPreviewResponse =
  | { ok: true; html: string }
  | { ok: false; error: string };

// Mammoth performs ZIP/XML parsing in this worker so a large document cannot
// monopolize the Electron renderer's UI thread. One worker handles one preview
// request and is terminated by the owning component after it responds.
const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<DocxPreviewRequest>) => void) | null;
  postMessage(message: DocxPreviewResponse): void;
};

workerScope.onmessage = (event) => {
  void mammoth.convertToHtml(
    { arrayBuffer: event.data.arrayBuffer },
    { convertImage: mammoth.images.dataUri },
  ).then((result) => {
    // Sanitizing a large Mammoth fragment is also CPU-heavy. Keep the whole
    // untrusted-source pipeline off the renderer thread, then send only the
    // safe fragment across the worker boundary.
    workerScope.postMessage({ ok: true, html: sanitizeDocxHtml(result.value) });
  }).catch((err: unknown) => {
    workerScope.postMessage({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  });
};
