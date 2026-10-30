// End-to-end tests against a running Pusher-compatible server (a local
// Hibira server or any other). Set HIBIRA_TEST_HOST (e.g.
// http://127.0.0.1:6123), HIBIRA_TEST_APP_ID, HIBIRA_TEST_KEY and
// HIBIRA_TEST_SECRET; without them those tests are skipped. The push test
// runs against a local stub of the push API.
const http = require('http');
const assert = require('assert');
const helper = require('node-red-node-test-helper');
const configNode = require('../nodes/hibira-config.js');
const outNode = require('../nodes/hibira-out.js');
const inNode = require('../nodes/hibira-in.js');
const pushNode = require('../nodes/hibira-push.js');

helper.init(require.resolve('node-red'));

const env = process.env;
const live = env.HIBIRA_TEST_HOST && env.HIBIRA_TEST_KEY ? describe : describe.skip;
const creds = {
  appId: env.HIBIRA_TEST_APP_ID,
  key: env.HIBIRA_TEST_KEY,
  secret: env.HIBIRA_TEST_SECRET,
};

function flow(channel, host) {
  return [
    { id: 'app', type: 'hibira-config', host },
    { id: 'in', type: 'hibira in', app: 'app', channel, wires: [['got']] },
    { id: 'out', type: 'hibira out', app: 'app', channel, event: 'update', wires: [['sent']] },
    { id: 'got', type: 'helper' },
    { id: 'sent', type: 'helper' },
  ];
}

function whenSubscribed(channel) {
  return new Promise((resolve) => {
    const check = () => {
      const c = helper.getNode('app').client().channel(channel);
      if (c && c.subscribed) resolve();
      else setTimeout(check, 50);
    };
    check();
  });
}

describe('hibira nodes', function () {
  this.timeout(10000);
  afterEach(async () => {
    await helper.unload();
  });

  it('reads the host as ws.hibira.io over TLS by default, or a local http:// server', async () => {
    await helper.load([configNode], [{ id: 'app', type: 'hibira-config' }], { app: creds });
    const app = helper.getNode('app');
    assert.deepStrictEqual([app.host, app.port, app.tls, app.baseUrl], ['ws.hibira.io', 443, true, 'https://ws.hibira.io']);
    await helper.unload();
    await helper.load([configNode], [{ id: 'app', type: 'hibira-config', host: 'http://127.0.0.1:6001' }], { app: creds });
    const local = helper.getNode('app');
    assert.deepStrictEqual([local.host, local.port, local.tls], ['127.0.0.1', 6001, false]);
  });

  for (const channel of ['orders', 'private-orders', 'presence-room']) {
    live(`against ${env.HIBIRA_TEST_HOST}`, () => {
      it(`sends an event and receives it on ${channel}`, async () => {
        await helper.load([configNode, outNode, inNode], flow(channel, env.HIBIRA_TEST_HOST), { app: creds });
        await whenSubscribed(channel);
        const got = new Promise((resolve) => helper.getNode('got').on('input', resolve));
        const sent = new Promise((resolve) => helper.getNode('sent').on('input', resolve));
        helper.getNode('out').receive({ payload: { id: 42, status: 'shipped' } });
        const s = await sent;
        assert.strictEqual(s.statusCode, 200);
        const msg = await got;
        assert.strictEqual(msg.topic, channel);
        assert.strictEqual(msg.event, 'update');
        assert.deepStrictEqual(msg.payload, { id: 42, status: 'shipped' });
      });
    });
  }

  it('sends push notifications with the push secret key', async () => {
    let seen;
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        seen = { url: req.url, auth: req.headers.authorization, body: JSON.parse(body) };
        res.setHeader('Content-Type', 'application/json');
        res.end('{"publishId":"pub-1"}');
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const host = 'http://127.0.0.1:' + server.address().port;
    try {
      await helper.load(
        [configNode, pushNode],
        [
          { id: 'app', type: 'hibira-config', host },
          { id: 'push', type: 'hibira push', app: 'app', target: 'interests', to: 'news', title: 'Hello', wires: [['done']] },
          { id: 'done', type: 'helper' },
        ],
        { app: { ...creds, pushInstanceId: 'inst-1', pushSecretKey: 'push-key' } },
      );
      const done = new Promise((resolve) => helper.getNode('done').on('input', resolve));
      helper.getNode('push').receive({ payload: 'Your order shipped', link: 'https://example.com/o/42' });
      const msg = await done;
      assert.deepStrictEqual(msg.payload, { publishId: 'pub-1' });
      assert.strictEqual(seen.url, '/publish_api/v1/instances/inst-1/publishes/interests');
      assert.strictEqual(seen.auth, 'Bearer push-key');
      assert.deepStrictEqual(seen.body.interests, ['news']);
      assert.deepStrictEqual(seen.body.web.notification, { title: 'Hello', body: 'Your order shipped', deep_link: 'https://example.com/o/42' });
      assert.deepStrictEqual(seen.body.apns.aps.alert, { title: 'Hello', body: 'Your order shipped' });
    } finally {
      server.close();
    }
  });

  it('reports a missing channel instead of sending', async () => {
    await helper.load([configNode, outNode], [
      { id: 'app', type: 'hibira-config', host: 'ws.hibira.io' },
      { id: 'out', type: 'hibira out', app: 'app', event: 'update', wires: [[]] },
    ], { app: creds });
    const out = helper.getNode('out');
    const err = new Promise((resolve) => out.on('call:error', resolve));
    out.receive({ payload: 'x' });
    const call = await err;
    assert.match(String(call.args[0]), /Set a channel/);
  });
});
