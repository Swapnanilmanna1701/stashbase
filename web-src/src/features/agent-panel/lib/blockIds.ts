/** Transcript block identity for one renderer process. The session core and
 * the prompt queue both append blocks to the same transcript, so they must
 * draw from ONE counter — two independent sequences would hand different
 * blocks the same id and make React reconcile them as the same node. */

let blockSeq = 0;

export function nextBlockId(): string {
  return `b${++blockSeq}`;
}
