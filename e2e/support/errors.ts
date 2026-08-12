import type { ConsoleMessage, Page, Request } from 'playwright';

export type AppErrorKind = 'console' | 'page' | 'request';

export interface AppErrorRecord {
  kind: AppErrorKind;
  text: string;
}

function failedRequestText(request: Request): string {
  const failure = request.failure();
  return `${request.method()} ${request.url()}: ${failure?.errorText ?? 'request failed'}`;
}

export class AppErrorCollector {
  readonly records: AppErrorRecord[] = [];
  private readonly attachedPages = new WeakSet<Page>();

  attach(page: Page): void {
    if (this.attachedPages.has(page)) return;
    this.attachedPages.add(page);
    page.on('console', (message: ConsoleMessage) => {
      if (message.type() === 'error') {
        this.records.push({ kind: 'console', text: message.text() });
      }
    });
    page.on('pageerror', (error: Error) => {
      this.records.push({ kind: 'page', text: error.stack ?? error.message });
    });
    page.on('requestfailed', (request: Request) => {
      this.records.push({ kind: 'request', text: failedRequestText(request) });
    });
  }

  assertNone(): void {
    if (this.records.length === 0) return;
    const details = this.records
      .map((record, index) => `${index + 1}. [${record.kind}] ${record.text}`)
      .join('\n');
    throw new Error(`unexpected renderer failures:\n${details}`);
  }

  format(): string {
    return this.records.length === 0
      ? 'No renderer errors recorded.\n'
      : `${this.records.map((record) => `[${record.kind}] ${record.text}`).join('\n')}\n`;
  }
}
