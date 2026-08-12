import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const DENIAL_MESSAGE = 'network access is forbidden in the deterministic fake Agent';
const denied = () => {
  throw new Error(DENIAL_MESSAGE);
};

// This module is imported first by the fake executable. Guard both the common
// high-level clients and the socket boundary so later fixture changes fail
// synchronously instead of reaching a developer or CI network.
net.Socket.prototype.connect = denied;
net.connect = denied;
net.createConnection = denied;
http.request = denied;
http.get = denied;
https.request = denied;
https.get = denied;
globalThis.fetch = denied;

export const fakeAgentNetworkPolicy = Object.freeze({
  denied: true,
  message: DENIAL_MESSAGE,
});
