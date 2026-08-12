import http from 'node:http';
import net from 'node:net';
import './deny-network.mjs';

function captured(label, action) {
  try {
    action();
    throw new Error(`${label} unexpectedly remained available`);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const result = {
  fetch: captured('fetch', () => { void fetch('https://example.invalid'); }),
  http: captured('http', () => { http.get('http://example.invalid'); }),
  socket: captured('socket', () => { net.connect(80, 'example.invalid'); }),
};

process.stdout.write(JSON.stringify(result));
