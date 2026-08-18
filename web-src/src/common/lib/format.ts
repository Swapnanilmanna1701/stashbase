/** Byte counts → user-facing "N MiB" copy (model downloads, indexing
 * workload estimates). Whole numbers from 10 MiB up; one decimal below
 * that so a small workload doesn't read as "0 MiB". */
export function formatMiB(bytes: number): string {
  const mib = bytes / (1024 * 1024);
  return `${mib.toFixed(mib >= 10 ? 0 : 1)} MiB`;
}
