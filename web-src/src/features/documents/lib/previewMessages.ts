export function activePreviewFrameWindow(doc: Document = document): Window | null {
  const frame = doc.getElementById('previewFrame');
  return frame instanceof HTMLIFrameElement ? frame.contentWindow : null;
}

export function isTrustedPreviewSource(
  source: MessageEventSource | null,
  selfWindow: Window = window,
  frameWindow: Window | null = activePreviewFrameWindow(),
): boolean {
  return source === selfWindow || (!!frameWindow && source === frameWindow);
}

export function isTrustedFrameSource(
  source: MessageEventSource | null,
  frameWindow: Window | null,
): boolean {
  return !!frameWindow && source === frameWindow;
}
