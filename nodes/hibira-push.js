// Sends a push notification (Beams-compatible API) to interests or users.
module.exports = function (RED) {
  function payloadFor(msg, title, body, link) {
    if (msg.payload && typeof msg.payload === 'object' && (msg.payload.apns || msg.payload.fcm || msg.payload.web)) {
      return msg.payload; // already a full publish body
    }
    const data = msg.data && typeof msg.data === 'object' ? { data: msg.data } : {};
    const web = { title, body };
    if (link) web.deep_link = link;
    return {
      apns: { aps: { alert: { title, body } }, ...data },
      fcm: { notification: { title, body }, ...data },
      web: { notification: web, ...data },
    };
  }

  function HibiraPushNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const app = RED.nodes.getNode(config.app);

    node.on('input', async function (msg, send, done) {
      if (!app || !app.pushInstanceId || !app.pushSecretKey) {
        done(new Error('Add the Push instance ID and secret key to the Hibira app config'));
        return;
      }
      const to = config.target === 'users' ? 'users' : 'interests';
      const list = String(config.to || msg.topic || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length === 0) {
        done(new Error('Set the ' + to + ' to send to (or msg.topic)'));
        return;
      }
      const title = msg.title || config.title || '';
      const body = typeof msg.payload === 'string' ? msg.payload : config.body || '';
      const publish = { ...payloadFor(msg, title, body, msg.link || config.link), [to]: list };
      const url =
        app.baseUrl +
        '/publish_api/v1/instances/' +
        encodeURIComponent(app.pushInstanceId) +
        '/publishes/' +
        to;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + app.pushSecretKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(publish),
        });
        const text = await res.text();
        if (!res.ok) {
          throw new Error('Hibira Push answered ' + res.status + ': ' + text);
        }
        msg.payload = text ? JSON.parse(text) : {};
        node.status({ fill: 'green', shape: 'dot', text: 'sent to ' + list.length + ' ' + to });
        send(msg);
        done();
      } catch (err) {
        node.status({ fill: 'red', shape: 'ring', text: 'failed' });
        done(err);
      }
    });
  }
  RED.nodes.registerType('hibira push', HibiraPushNode);
};
