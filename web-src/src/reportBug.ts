import reportBugLimits from '../../shared/report-bug.json';

export const GITHUB_FIELD_MAX_LENGTH = reportBugLimits.githubFieldMaxLength;

export function createLatestReportRequest() {
  let generation = 0;
  return {
    begin: () => ++generation,
    isCurrent: (candidate: number) => candidate === generation,
    invalidate: () => { generation += 1; },
  };
}

export interface ReportDraft {
  id: string;
  screenshotDataUrl: string;
  logExcerpt: string;
  diagnostics: {
    version: string;
    platform: string;
    release: string;
    arch: string;
    timestamp: string;
    packaged: boolean;
  };
  errorDetails: string;
}

export interface ReportInput {
  id: string;
  happened: string;
  expected: string;
  steps: string;
  includeScreenshot: boolean;
  includeLogs: boolean;
  includeErrorDetails: boolean;
}

export interface ReportBugBridge {
  onOpen(handler: () => void): () => void;
  prepare(options?: { errorDetails?: string; requestId?: string }): Promise<ReportDraft>;
  copy(input: ReportInput): Promise<boolean>;
  save(input: ReportInput): Promise<boolean>;
  submit(input: ReportInput): Promise<{ message: string }>;
}

export function reportBugBridge(): ReportBugBridge | undefined {
  return (window as unknown as { electron?: { reportBug?: ReportBugBridge } }).electron?.reportBug;
}
