// Shared connection to one Hibira app: a server client (pusher) for the HTTP
// API and, opened on first use, one WebSocket client (pusher-js) for every
// "hibira in" node that uses this config.
const Pusher = require('pusher');
const PusherClient = require('pusher-js');

module.exports = function (RED) {
  function HibiraConfigNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    // "ws.hibira.io", or "http://localhost:6001" for a local Pusher-compatible server.
    const raw = (config.host || 'ws.hibira.io').trim();
    const url = new URL(/^https?:\/\//.test(raw) ? raw : 'https://' + raw);
    node.tls = url.protocol === 'https:';
    node.host = url.hostname;
    node.port = url.port ? Number(url.port) : node.tls ? 443 : 80;
    node.name = config.name;
    const creds = node.credentials || {};
    node.appId = creds.appId;
    node.key = creds.key;
    node.secret = creds.secret;
    node.pushInstanceId = creds.pushInstanceId;
    node.pushSecretKey = creds.pushSecretKey;
    node.baseUrl = url.origin;

    node.server = function () {
      if (!node._server) {
        node._server = new Pusher({
          appId: String(node.appId || ''),
          key: String(node.key || ''),
          secret: String(node.secret || ''),
          host: node.host,
          port: String(node.port),
          useTLS: node.tls,
        });
      }
      return node._server;
    };

    // Private and presence channels are signed right here with the app
    // secret: Node-RED runs on a server, so the secret never reaches a browser.
    node.client = function () {
      if (!node._client) {
        node._client = new PusherClient(String(node.key || ''), {
          cluster: 'hkg',
          wsHost: node.host,
          wsPort: node.port,
          wssPort: node.port,
          forceTLS: node.tls,
          enabledTransports: ['ws', 'wss'],
          channelAuthorization: {
            customHandler: (params, callback) => {
              try {
                const presence = params.channelName.startsWith('presence-')
                  ? { user_id: 'node-red-' + node.id }
                  : undefined;
                callback(null, node.server().authorizeChannel(params.socketId, params.channelName, presence));
              } catch (err) {
                callback(err, null);
              }
            },
          },
        });
      }
      return node._client;
    };

    node.on('close', function (done) {
      if (node._client) {
        node._client.disconnect();
        node._client = null;
      }
      done();
    });
  }

  RED.nodes.registerType('hibira-config', HibiraConfigNode, {
    credentials: {
      appId: { type: 'text' },
      key: { type: 'text' },
      secret: { type: 'password' },
      pushInstanceId: { type: 'text' },
      pushSecretKey: { type: 'password' },
    },
  });
};
