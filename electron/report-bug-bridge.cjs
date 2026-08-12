'use strict';

function createReportBugPreloadBridge(ipcRenderer) {
  const handlers = new Set();
  ipcRenderer.on('report-bug:open', () => {
    for (const handler of handlers) handler();
  });
  return {
    onOpen(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    prepare: (options) => ipcRenderer.invoke('report-bug:prepare', options),
    copy: (input) => ipcRenderer.invoke('report-bug:copy', input),
    save: (input) => ipcRenderer.invoke('report-bug:save', input),
    submit: (input) => ipcRenderer.invoke('report-bug:submit', input),
  };
}

module.exports = { createReportBugPreloadBridge };
