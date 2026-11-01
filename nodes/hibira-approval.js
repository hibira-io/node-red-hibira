// Asks a person to approve or choose through a Hibira-hosted answer link
// (the approvals HTTP API), then waits for the answer. Output 1 gets the
// message when the request is approved; output 2 when it is rejected,
// expires, is still pending after the wait, or the node does not wait.
module.exports = function (RED) {
  const POLL_SECONDS = 25;

  function list(value) {
    if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
    return String(value || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function readJson(res) {
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }

  function apiError(err) {
    if (err && err.status && err.body) {
      let message = err.body;
      try {
        message = JSON.parse(err.body).error || message;
      } catch (_) {
        // plain text body
      }
      return new Error('Hibira answered ' + err.status + ': ' + message);
    }
    return err;
  }

  function HibiraApprovalNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const app = RED.nodes.getNode(config.app);
    let closing = false;

    async function poll(server, approval, deadline) {
      let current = approval;
      while (current.status === 'pending' && !closing) {
        const left = Math.floor((deadline - Date.now()) / 1000);
        if (left <= 0) break;
        const res = await server.get({
          path: '/approvals/' + encodeURIComponent(approval.approval_id),
          params: { wait: String(Math.min(POLL_SECONDS, left)) },
        });
        current = await readJson(res);
      }
      if (approval.url && current.url === undefined) current.url = approval.url;
      return current;
    }

    node.on('input', async function (msg, send, done) {
      if (!app) {
        done(new Error('Choose a Hibira app config'));
        return;
      }
      const title = msg.title || config.title || (typeof msg.payload === 'string' ? msg.payload : '');
      if (!title) {
        done(new Error('Set a question (the node title, msg.title or msg.payload as text)'));
        return;
      }
      const body = { title, agent: config.agent || 'Node-RED' };
      const options = list(msg.options || config.options);
      if (options.length > 0) body.options = options;
      const details = msg.details || config.details;
      if (details) body.details = String(details);
      const expires = Number(msg.expires || config.expires);
      if (expires > 0) body.expires_in_minutes = expires;
      const channel = msg.channel || config.channel;
      if (channel) body.channel = channel;
      const push = list(msg.topic || config.push);
      if (push.length > 0) body[config.pushTarget === 'users' ? 'push_users' : 'push_interests'] = push;

      const server = app.server();
      try {
        node.status({ fill: 'blue', shape: 'dot', text: 'requesting' });
        let approval = await readJson(await server.post({ path: '/approvals', body }));
        const waitMinutes = config.wait === false ? 0 : Number(config.waitMinutes || 60);
        if (waitMinutes > 0 && approval.status === 'pending') {
          node.status({ fill: 'yellow', shape: 'ring', text: 'waiting for answer' });
          approval = await poll(server, approval, Date.now() + waitMinutes * 60000);
        }
        msg.payload = approval;
        msg.approval_id = approval.approval_id;
        msg.approved = approval.status === 'approved';
        node.status({
          fill: msg.approved ? 'green' : approval.status === 'pending' ? 'yellow' : 'red',
          shape: 'dot',
          text: approval.status + (approval.choice ? ': ' + approval.choice : ''),
        });
        if (closing) {
          done();
          return;
        }
        send(msg.approved ? [msg, null] : [null, msg]);
        done();
      } catch (err) {
        node.status({ fill: 'red', shape: 'ring', text: 'failed' });
        done(apiError(err));
      }
    });

    node.on('close', function (done) {
      closing = true;
      done();
    });
  }
  RED.nodes.registerType('hibira approval', HibiraApprovalNode);
};
