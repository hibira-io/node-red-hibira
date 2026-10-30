// Sends msg.payload as an event to one or more channels.
module.exports = function (RED) {
  function HibiraOutNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const app = RED.nodes.getNode(config.app);

    node.on('input', async function (msg, send, done) {
      if (!app) {
        done(new Error('Choose a Hibira app'));
        return;
      }
      const channels = String(config.channel || msg.topic || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const event = config.event || msg.event;
      if (channels.length === 0 || !event) {
        done(new Error('Set a channel (or msg.topic) and an event name (or msg.event)'));
        return;
      }
      try {
        const params = msg.socketId ? { socket_id: msg.socketId } : undefined;
        const res = await app.server().trigger(channels, event, msg.payload, params);
        msg.statusCode = res.status;
        node.status({ fill: 'green', shape: 'dot', text: event + ' → ' + channels.join(', ') });
        send(msg);
        done();
      } catch (err) {
        node.status({ fill: 'red', shape: 'ring', text: String(err.status || 'error') });
        done(err);
      }
    });
  }
  RED.nodes.registerType('hibira out', HibiraOutNode);
};
