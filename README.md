# @hibira-io/node-red-hibira

![@hibira-io/node-red-hibira](https://raw.githubusercontent.com/hibira-io/node-red-hibira/main/.github/cover.jpg)

[Node-RED](https://nodered.org) nodes for [Hibira](https://hibira.io), a hosted realtime service that speaks the Pusher Channels and Beams protocols.

Push sensor readings, order updates or alerts from a flow to every open browser, dashboard and app at once. You can also react in Node-RED to events your web pages send.

| Node | What it does |
|---|---|
| **hibira out** | Sends `msg.payload` as an event to one or more channels |
| **hibira in** | Subscribes to a channel (public, private or presence) and outputs every event, including client events from browsers |
| **hibira push** | Sends a push notification to iOS, Android and web devices by interest or user ID |

## Install

In Node-RED, open **Manage palette → Install** and search for `@hibira-io/node-red-hibira`. Or from your Node-RED user directory:

```sh
npm install @hibira-io/node-red-hibira
```

Requires Node-RED 3.0 or later and Node.js 18 or later.

## Set up

1. Sign up at [hibira.io](https://hibira.io/portal) and create an app. The free plan is enough and needs no card.
2. Add a **hibira out** or **hibira in** node, and create a new **Hibira app** config with the App ID, Key and Secret from the app page.
3. For **hibira push**, also enter the Push instance ID and secret key from the app's Push tab.

The **Host** is `ws.hibira.io` (or `ws-<cluster>.hibira.io`). For a local Pusher-compatible server, enter it with its scheme, for example `http://127.0.0.1:6001`.

In the browser, subscribe with [pusher-js](https://github.com/pusher/pusher-js) pointed at `ws.hibira.io`, or with Hibira's [embed script](https://hibira.io/guides/html), and the events from **hibira out** show up live. Add your site's address to **Allowed origins** in the app settings.

## Example

**Menu → Import → Examples → @hibira-io/node-red-hibira → live-order-board** sends a made-up order every 10 seconds and receives it back on the same channel.

## Tests

`npm test` runs the unit tests. To also run the end-to-end tests against a server, set `HIBIRA_TEST_HOST`, `HIBIRA_TEST_APP_ID`, `HIBIRA_TEST_KEY` and `HIBIRA_TEST_SECRET`.

## License

MIT
