'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const projectRoot = path.resolve(__dirname, '..');
const smokeRoot = process.env.STASHBASE_SMOKE_ROOT;
if (!smokeRoot) throw new Error('STASHBASE_SMOKE_ROOT is required');
app.setPath('userData', path.join(smokeRoot, 'tab-layout-electron-user-data'));

const css = [
  fs.readFileSync(path.join(projectRoot, 'web-src', 'src', 'styles', 'globals.css'), 'utf8'),
  fs.readFileSync(path.join(projectRoot, 'web-src', 'src', 'features', 'workspace', 'workspace.css'), 'utf8'),
].join('\n');

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>${css}</style>
  </head>
  <body>
    <main class="main" style="width: 500px">
      <div class="tab-strip">
        <div class="tab-strip-inner">
          <div class="tab active">
            <span class="tab-label">Untitled</span>
            <button type="button" class="tab-close">×</button>
          </div>
          <button type="button" class="tab-new">+</button>
        </div>
      </div>
    </main>
  </body>
</html>`;
const htmlPath = path.join(smokeRoot, 'tab-strip-layout.html');
fs.writeFileSync(htmlPath, html, 'utf8');

let finished = false;
const deadline = setTimeout(() => {
  console.error('tab strip layout smoke timed out');
  finish(1);
}, 20_000);

function finish(code) {
  if (finished) return;
  finished = true;
  clearTimeout(deadline);
  app.exit(code);
}

app.whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      show: false,
      width: 700,
      height: 200,
      webPreferences: { sandbox: true },
    });
    // Loading the complete renderer CSS through a data: URL eventually hits
    // platform-specific URL limits as the stylesheet grows. The shared smoke
    // root is already temporary and removed by the runner, so load the same
    // self-contained fixture as a local file instead.
    await win.loadFile(htmlPath);
    const layout = await win.webContents.executeJavaScript(`
      (() => {
        const closeRect = document.querySelector('.tab-close').getBoundingClientRect();
        const newRect = document.querySelector('.tab-new').getBoundingClientRect();
        return {
          closeCenterY: closeRect.top + closeRect.height / 2,
          newCenterY: newRect.top + newRect.height / 2,
        };
      })()
    `);
    const delta = layout.newCenterY - layout.closeCenterY;
    console.log(`tab strip control center delta: ${delta}px`);
    assert.ok(
      Math.abs(delta) <= 0.5,
      `new-tab control is vertically misaligned by ${delta}px`,
    );
    win.destroy();
  })
  .then(() => finish(0))
  .catch((err) => {
    console.error(err);
    finish(1);
  });
