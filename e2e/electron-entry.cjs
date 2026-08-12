'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

// Diagnostic escape hatch for running the real x64 Electron binary through
// QEMU on an arm64 host. Normal local and CI launches leave acceleration on.
if (process.env.STASHBASE_E2E_DISABLE_HARDWARE_ACCELERATION === '1') {
  app.disableHardwareAcceleration();
}

// Visual goldens compare CSS pixels across Linux runners. Pin the Chromium
// device scale only for visual fixtures so functional E2E launches retain the
// platform default used by the shipping app.
if (process.env.STASHBASE_E2E_DEVICE_SCALE_FACTOR) {
  app.commandLine.appendSwitch(
    'force-device-scale-factor',
    process.env.STASHBASE_E2E_DEVICE_SCALE_FACTOR,
  );
}

const userData = process.env.STASHBASE_E2E_USER_DATA;
if (!userData || !path.isAbsolute(userData)) {
  throw new Error('STASHBASE_E2E_USER_DATA must be an absolute isolated path');
}

fs.mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);

const bootDelayMs = Number(process.env.STASHBASE_E2E_BOOT_DELAY_MS ?? 0);
if (Number.isFinite(bootDelayMs) && bootDelayMs > 0) {
  setTimeout(() => require('../electron/main.cjs'), bootDelayMs);
} else {
  require('../electron/main.cjs');
}
