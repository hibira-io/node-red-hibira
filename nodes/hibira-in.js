// Subscribes to a channel and outputs every event: msg.topic is the channel,
// msg.event the event name and msg.payload its data.
module.exports = function (RED) {
  function HibiraInNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const app = RED.nodes.getNode(config.app);
    const channelName = (config.channel || '').trim();
    const only = (config.event || '').trim();
    if (!app || !channelName) {
      node.status({ fill: 'grey', shape: 'ring', text: 'not configured' });
      return;
    }

    const client = app.client();
    const onState = (states) => {
      const s = states.current;
      node.status(
        s === 'connected'
          ? { fill: 'green', shape: 'dot', text: channelName }
          : { fill: s === 'connecting' ? 'yellow' : 'red', shape: 'ring', text: s },
      );
    };
    client.connection.bind('state_change', onState);
    onState({ current: client.connection.state });

    const channel = client.subscribe(channelName);
    const onEvent = (event, data) => {
      if (event.startsWith('pusher:') || event.startsWith('pusher_internal:')) {
        return;
      }
      if (only && event !== only) {
        return;
      }
      node.send({ topic: channelName, event, payload: data });
    };
    channel.bind_global(onEvent);
    channel.bind('pusher:subscription_error', (status) => {
      node.status({ fill: 'red', shape: 'ring', text: 'subscription failed' });
      node.error('Could not subscribe to ' + channelName + ': ' + JSON.stringify(status));
    });

    node.on('close', function (done) {
      channel.unbind_global(onEvent);
      client.connection.unbind('state_change', onState);
      client.unsubscribe(channelName);
      done();
    });
  }
  RED.nodes.registerType('hibira in', HibiraInNode);
};
