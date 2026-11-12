# Browser push (Web Push) feasibility for Cadence

Researched 2026-11-12. Every factual claim links to the primary source it was read from on that date.
Statements marked **Inference** are my own reasoning, not something a source states.
Statements marked **Unverified** could not be confirmed from a primary source.

## Summary

- Web Push works without any vendor account on Chrome, Edge, Firefox (desktop and Android) and Safari 16+ on macOS 13+; one VAPID key pair and the `web-push` library cover all of them ([web-push README][wp], [BCD PushManager][bcd-pm]).
- On iOS/iPadOS it only works for a site the user has added to the Home Screen (iOS 16.4+). In a normal Safari tab the `Notification` interface is undefined ([WebKit iOS post][wk-ios], [BCD Notification][bcd-n]).
- Sending is an HTTPS POST from the Node server to the endpoint URL stored in each subscription. A `201` means "accepted", not "delivered"; there is no read signal ([RFC 8030 §5][rfc8030]).
- The push services do not charge. `web-push` is MPL-2.0. The only ongoing cost is HTTPS hosting, which the app needs anyway ([Firebase pricing][fb-price], [Apple doc][apple-doc], [web-push package.json][wp-pkg]).
- Every push must show a visible notification. Chrome and Edge show a generic one if you do not; Safari revokes the permission ([web.dev handling][wd-handle], [Edge doc][edge], [Apple doc][apple-doc]).
- Browsers remove or throttle permission on their own: Chrome auto-revokes for low-engagement sites (announced October 2025) and rate-limits flagged senders (from January 2026) ([Chrome revocation][cr-revoke], [Chrome rate limits][cr-rate]).
- A subscription belongs to a browser profile and service worker, not to the logged-in user. The app must tie it to a user itself and untie it on logout ([MDN Push API][mdn-push]).
- It works on `http://localhost` for development because localhost is a secure context ([MDN Secure contexts][mdn-secure]).

## Recommendation

**Feasible, and cheap to run. Build it as a later phase, after in-app notifications exist.**

Reasons (Inference, drawn from the facts below):

- Push has no delivery or read receipt, subscriptions vanish without notice, and iOS reach depends on a Home Screen install. It cannot be the record. That matches the spec's premise: the in-app notification is the record and push is one delivery channel.
- Nothing about push changes the shape of the in-app model, so it can be added behind a "delivery channel" interface without rework.

Minimal build list:

1. `public/sw.js` with `push`, `notificationclick` and `pushsubscriptionchange` handlers, registered at scope `/`.
2. `public/manifest.webmanifest` with `display: standalone` and icons, linked from `app/root.tsx` (needed for iOS).
3. A VAPID key pair in env secrets (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`), and the `web-push` dependency.
4. A `push_subscriptions` table and routes to save, delete and replace a subscription.
5. A settings UI control that asks for permission from a click, subscribes, and shows the current browser state.
6. A sender module behind an interface (real `web-push` sender plus a fake for tests) that deletes subscriptions on `404`/`410`.
7. Logout must delete or disassociate the current browser's subscription.

Open questions for the spec:

- Which notification types are worth a push at all? Chrome penalises high volume with low engagement ([Chrome rate limits][cr-rate]).
- Is iOS in scope? If yes, the spec needs an "Add to Home Screen" instruction step.
- Should a push be suppressed when the app is open and focused, or when the in-app notification has already been read?
- What goes in the payload: full text, or only an ID and a title? Payload text is shown on lock screens.
- Is preference per user, or per user and device? Browser permission is per browser, so "enabled" has two layers.
- Does the app need to keep working with the DevUI user switcher, where several users share one browser profile?

## 1. Browser and OS support

Versions are from MDN browser-compat-data (BCD), read from the repository's `main` branch ([PushManager][bcd-pm], [Notification][bcd-n], [ServiceWorkerGlobalScope][bcd-swgs]).

| Browser | `PushManager` since | Notes from BCD |
| --- | --- | --- |
| Chrome desktop | 42 | `subscribe()` needs `applicationServerKey` |
| Chrome Android | 42 (mirrors desktop) | Notifications only through a service worker |
| Edge | 17 | `subscribe()` needs `applicationServerKey` |
| Firefox desktop | 44 | User gesture needed from 72 |
| Firefox Android | 48 | User gesture needed from 79 |
| Safari macOS | 16 | "Notifications are supported on macOS Ventura and later" |
| Safari iOS/iPadOS | 16.4 | "Notifications are supported in web apps saved to the home screen" |
| Samsung Internet, Opera | mirror Chrome | |
| Android WebView, iOS WKWebView | not supported | |

The `web-push` README gives a matching table: Chrome 52+ for VAPID, Edge 17+, Firefox 46+ for VAPID, Safari 16+ on macOS 13+. It lists Opera and Samsung Internet as not supporting VAPID and needing `gcm_sender_id` ([web-push README][wp]). That conflicts with BCD's "mirrors Chrome" entries; I could not tell which is current. **Unverified.**

### iOS and iPadOS

- **Minimum version and install requirement.** "iOS and iPadOS 16.4 add support for Web Push to web apps added to the Home Screen" ([Safari 16.4 features][wk-164]). Apple's developer doc says the same: "Home Screen web apps in iOS 16.4 or later and Webpages in Safari 16 for macOS 13 or later" ([Apple doc][apple-doc]).
- **In a normal Safari tab the API is absent.** BCD: "The `Notification` interface is undefined, unless the page is a web app saved to the home screen. The app's manifest must have a non-default `display` value" ([BCD Notification][bcd-n]). Feature detection is therefore required.
- **Manifest.** A manifest with `display` set to `standalone` or `fullscreen` makes the site a Home Screen web app ([WebKit iOS post][wk-ios]).
- **iOS 26 change.** "By default, every website added to the Home Screen opens as a web app", and "there are now zero requirements for 'installability' in Safari" ([Safari 26.0 features][wk-26]). The post does not say whether push now works without a manifest `display` value. **Unverified**; keep the manifest.
- **Third-party browsers.** Since 16.4 they "can offer 'Add to Home Screen' in the Share menu" ([Safari 16.4 features][wk-164]). The WebKit posts do not say that push works inside a third-party browser's own tabs, and BCD lists iOS WKWebView as unsupported ([BCD PushManager][bcd-pm]). **Inference:** push on iOS means "installed Home Screen web app" whichever browser did the installing.
- **EU.** Apple planned to remove Home Screen web apps in the EU in iOS 17.4, then reversed that in March 2024. **Unverified from a primary source**: Apple's EU developer page no longer carries the statement (checked 2026-11-12, [Apple EU page][apple-eu]). The reversal is reported with a quote from Apple's page by [MacRumors][eu-secondary], which is a secondary source. Apple's alternative-browser-engine page says nothing about web apps or push ([Apple alt engines][apple-alt]).
- **Declarative Web Push.** Available "on iOS and iPadOS 18.4 for web apps added to the Home Screen" and on macOS from Safari 18.5 ([Safari 18.4 features][wk-184], [Safari 18.5 features][wk-185]). It lets a push carry a JSON description of the notification (`"web_push": 8030`, a `notification` with a `title`, and a `navigate` URL) that the browser shows without running a service worker. It is "backwards compatible with existing Web Push notifications": other browsers hand the same message to the service worker ([Meet Declarative Web Push][wk-decl]). It does not remove the Home Screen requirement on iOS.

### Private browsing

- Chrome: "Starting in Chrome 49, notifications do not work in incognito mode." Samsung Internet 5.0+ and Opera 36+ have the same note ([BCD Notification][bcd-n]).
- Firefox private windows and Safari Private Browsing: **Unverified.** None of the MDN, WebKit or Apple pages I read cover it. Treat push as unavailable there and rely on feature detection and error handling.

## 2. Permission flow and constraints

### User gesture

- Firefox: `Notification.requestPermission()` and `PushManager.subscribe()` "can only be called in response to a user gesture such as a `click` event" from Firefox 72 (Android 79) ([BCD Notification][bcd-n], [BCD PushManager][bcd-pm]).
- Safari: the request must be "in response to direct user interaction" ([WebKit iOS post][wk-ios]). Apple: "call the push subscription method immediately from the gesture's event handler code" ([Apple doc][apple-doc]).
- Chrome and Edge: MDN names only Firefox and Safari as enforcing it ([MDN Using Notifications][mdn-using]). Whether Chrome hard-blocks a non-gesture request is **Unverified**. Always ask from a click anyway.
- Chrome and Firefox do not allow the request from a cross-origin iframe ([MDN requestPermission][mdn-reqperm]).

### After a denial

- "If the user blocks the permission request, your web app can't ask for permission again"; "the user has to change the permission in the browser's UI" ([web.dev permission UX][wd-ux]).
- `requestPermission()` resolves to `granted`, `denied` or `default`. `default` means no decision, and the app must behave as if denied ([MDN requestPermission][mdn-reqperm]).
- web.dev recommends a settings toggle or an app-owned pre-prompt, and showing the browser prompt only after the user opts in there ([web.dev permission UX][wd-ux]).

### Quiet UI, auto-revocation, rate limits (Chrome)

- Quiet prompt: Chrome 80 introduced a quieter permission UI and "will automatically enroll sites with very low Accept rates into the quieter UI" ([Chrome CrUX post][cr-quiet]).
- Auto-revocation (announced 10 October 2025, Android and desktop): Chrome will "automatically remove notification permission for sites you haven't interacted with recently", only where there is "very low user engagement and a high volume of notifications being sent". It "does not revoke notifications for any installed web apps". Users are told, and can re-grant ([Chrome revocation][cr-revoke]).
- Rate limits (published 6 January 2026): sites judged to send many pushes with little engagement are limited to "no less than 1000 per minute"; excess requests get `429`. Penalties last 1, 7, then 14 days. "Nearly all websites will be unaffected" ([Chrome rate limits][cr-rate]).
- **Inference:** the app will see permission flip from `granted` back to `default` and subscriptions disappear without any user action. The settings UI must read live browser state, not a stored flag.

### `userVisibleOnly: true` and silent pushes

| Browser | Rule | Consequence of a push with no notification |
| --- | --- | --- |
| Chrome | `subscribe()` rejects unless `userVisibleOnly` is `true` ([MDN subscribe][mdn-sub]) | Shows a default notification: "This site has been updated in the background" ([web.dev handling][wd-handle]) |
| Edge | Option "must be present and set to `true`" ([Edge doc][edge]) | "displays a generic notification" ([Edge doc][edge]) |
| Firefox | A limited quota of silent pushes; pushes that show a notification are exempt; quota refreshes on each site visit ([MDN Push API][mdn-push]) | Quota runs out. What happens then is **Unverified**. |
| Safari | Must set `userVisibleOnly` and show a notification for every push ([Meet Web Push][wk-mac]) | "Safari revokes the push notification permission for your site" ([Apple doc][apple-doc]). No count of allowed misses is published ([Meet Declarative Web Push][wk-decl]). |

**Inference:** a service worker bug that throws before `showNotification()` can cost a Safari user their subscription. Keep the handler small and always show something.

### Secure context and localhost

- Service workers, Push and Notifications need a secure context ([MDN register][mdn-reg], [MDN subscribe][mdn-sub]).
- `http://localhost`, `http://127.0.0.1` and `*.localhost` count as secure ([MDN Secure contexts][mdn-secure]). Push therefore works in local development without TLS.
- A phone on the LAN reaching the dev machine by IP address is not a secure context. Testing on a real iOS device needs HTTPS (a tunnel or a deployed build). (Inference from the same rules.)

## 3. What must be added to the app

### Service worker

- Default scope is the directory of the script, and a worker "can't have a scope broader than its own location" unless the server sends `Service-Worker-Allowed` ([MDN register][mdn-reg]). To control the whole app it must be served from `/sw.js`.
- Vite serves files in `public/` "at root path `/` during dev" and copies them "to the root of the dist directory as-is", without hashing ([Vite assets][vite]). The repo already has a `public/` directory.
- In production, `react-router-serve` mounts the client build directory with `express.static` and applies the one-year immutable cache only to `/assets` ([react-router-serve cli.ts][rr-serve]). **Inference:** `public/sw.js` ends up at `build/client/sw.js`, is served at `/sw.js` and is not cached as immutable. This is a plain hand-written JS file outside the TypeScript build; that is the simplest option and needs no plugin.
- Note: the task brief says React Router v7, but `package.json` pins `react-router` and `@react-router/serve` at `8.3.0`. The serve source was read from the upstream `main` branch.
- The worker needs three handlers: `push` (wrap `showNotification()` in `event.waitUntil()` ([web.dev handling][wd-handle])), `notificationclick`, and `pushsubscriptionchange`.

### Web app manifest

- Needed for iOS (see section 1): `display: standalone` or `fullscreen` ([WebKit iOS post][wk-ios]). WebKit also supports the manifest `id` member ([Safari 16.4 features][wk-164]).
- Not needed for push on desktop or Android browsers. `gcm_sender_id` in the manifest was only needed for Chrome 51 and earlier ([web-push README][wp]).
- **Inference:** serve it from `public/manifest.webmanifest` and add `<link rel="manifest">` in `app/root.tsx`.

### VAPID key pair

- Generate once with `npx web-push generate-vapid-keys` or `webpush.generateVAPIDKeys()`; both return URL-safe Base64 `publicKey` and `privateKey`. "You should create these keys once, store them and use them for all future messages" ([web-push README][wp]).
- The public key goes to the browser as `applicationServerKey`. The private key signs a JWT on each send and must stay server-side ([web.dev subscribing][wd-sub], [RFC 8292 §2][rfc8292]).
- `subject` must be an `https:` or `mailto:` URI. Apple may reject a localhost placeholder with `403 BadJwtToken`; use a real contact URI ([web-push README][wp], [Apple doc][apple-doc]).
- **Rotation.** A subscription is restricted to the key it was created with; a push signed with another key is rejected (403), and the server "must request a new subscription" under the new key ([RFC 8292 §4][rfc8292]). Apple reports this as `VapidPkHashMismatch` ([Apple doc][apple-doc]). **Inference:** rotating the key invalidates every stored subscription, and each user has to open the app again to re-subscribe. Treat the key as long-lived, and use the same key in every environment that shares subscriptions.

### Subscription storage

Fields of a `PushSubscription` ([MDN PushSubscription][mdn-ps], [web.dev subscribing][wd-sub]):

| Field | Meaning |
| --- | --- |
| `endpoint` | Push service URL unique to this subscription. A capability URL: "needs to be kept secret" ([MDN Push API][mdn-push]). |
| `keys.p256dh` | The browser's P-256 public key, used to encrypt the payload ([RFC 8291 §3.1][rfc8291]). |
| `keys.auth` | 16-octet authentication secret ([RFC 8291 §3.2][rfc8291]). |
| `expirationTime` | Timestamp or `null` ([MDN PushSubscription][mdn-ps]). Supported from Chrome 60, Firefox 96, Safari 16 ([BCD PushSubscription][bcd-ps]). |

`JSON.stringify(subscription)` yields `{ endpoint, keys: { p256dh, auth } }` ([web.dev subscribing][wd-sub]).

"Each subscription is unique to a service worker" ([MDN Push API][mdn-push]), so one user has one row per browser profile or installed web app.

Suggested table (Inference):

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer PK | |
| `user_id` | FK to users, indexed | Many rows per user |
| `endpoint` | text, unique | Upsert key; reassign `user_id` if the same endpoint arrives for another user |
| `p256dh` | text | |
| `auth` | text | |
| `expiration_time` | integer, nullable | |
| `user_agent` | text, nullable | To label devices in settings |
| `created_at`, `last_success_at` | integer | For pruning and debugging |

### Client flows

- **Subscribe.** Feature-detect `serviceWorker` and `PushManager`; register `/sw.js`; on a click call `Notification.requestPermission()`; then `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`; POST the JSON to the server ([web.dev subscribing][wd-sub]). MDN warns to protect that endpoint against CSRF ([MDN Push API][mdn-push]).
- **Unsubscribe.** `subscription.unsubscribe()` resolves to a boolean ([MDN PushSubscription][mdn-ps]); then tell the server to delete the row by endpoint.
- **`pushsubscriptionchange`.** Fires in the service worker when the subscription changes "outside the application's control", for example refreshed, revoked or lost. MDN's handler re-subscribes with `event.oldSubscription.options` and POSTs old and new to the server, and notes the fetch can fail offline ([MDN pushsubscriptionchange][mdn-psc]).
- Support for that event is uneven: Chrome only from 138, Firefox without `oldSubscription`/`newSubscription`, Safari macOS 16, Safari iOS listed as unsupported ([BCD ServiceWorkerGlobalScope][bcd-swgs]).
- **Inference:** do not rely on the event. On every app load, call `pushManager.getSubscription()` and re-sync it with the server when permission is `granted`.

## 4. How a single Node server sends pushes

### `web-push` API ([web-push README][wp])

- `webpush.setVapidDetails(subject, publicKey, privateKey)` sets process-wide defaults.
- `webpush.sendNotification(pushSubscription, payload?, options?)` takes `{ endpoint, keys: { p256dh, auth } }`, a string or Buffer payload, and returns a promise. Resolved or rejected, the value exposes `statusCode`, `headers` and `body`.
- Options: `TTL` (seconds; default four weeks), `urgency` (`very-low`, `low`, `normal` default, `high`), `topic` (up to 32 URL-safe Base64 characters; replaces a pending message with the same topic), `timeout` (socket timeout in ms, default none), `headers`, `contentEncoding`, `vapidDetails` (per-call override), `proxy`, `agent`.
- Version 4.0.0 requires Node 16 or later ([web-push package.json][wp-pkg]).

### It is one HTTPS POST per subscription

- The server POSTs the encrypted payload to the subscription's `endpoint`, with `TTL` and a VAPID `Authorization` header ([RFC 8030 §5][rfc8030], [RFC 8292 §3][rfc8292]). The payload is encrypted with `aes128gcm` using the subscription's keys ([RFC 8291 §4][rfc8291]).
- Since 2016 Chrome uses FCM as its push service, and VAPID keys "need no Google or Firebase project setup" ([web.dev FAQ][wd-faq]). Firefox uses Mozilla autopush ([autopush docs][autopush]). Safari uses APNs at `*.push.apple.com`, and "You don't need to join the Apple Developer Program" ([Apple doc][apple-doc]).
- Edge on Windows using WNS is **Unverified**: Microsoft's Edge push page does not name the push service ([Edge doc][edge]). It does not matter to the sender, which only sees an endpoint URL.
- The server needs outbound HTTPS to those hosts. Nothing else.

### Payload size

- A push service must accept bodies of 4096 bytes or less, which is at most 3993 octets of plaintext ([RFC 8030 §7.2][rfc8030], [RFC 8291 §4][rfc8291]).
- Apple: 4 KB ([Apple doc][apple-doc]). Mozilla: 4096 bytes ([autopush docs][autopush]).
- **Inference:** send a small JSON object (title, short body, URL, notification ID, tag) and let the app fetch details.

### Status codes

| Status | Meaning | Action |
| --- | --- | --- |
| `201` | Accepted by the push service. "This does not indicate that the message was delivered" ([RFC 8030 §5][rfc8030]). | None |
| `400` | Bad request, usually a header problem ([web.dev protocol][wd-proto]) | Log; it is a bug |
| `401` / `403` | VAPID auth invalid or key mismatch ([autopush errors][autopush-err], [Apple doc][apple-doc], [RFC 8292 §4.2][rfc8292]) | Log; check keys and `subject`. Do not delete (Inference) |
| `404` | Subscription expired or endpoint invalid ([RFC 8030 §7.3][rfc8030], [web.dev protocol][wd-proto]) | Delete the subscription |
| `410` | Subscription no longer valid ([web.dev protocol][wd-proto], [autopush errors][autopush-err], [Apple doc][apple-doc]) | Delete the subscription |
| `413` | Payload too large ([RFC 8030 §7.2][rfc8030]) | Log; shrink payload |
| `429` | Rate limited; "SHOULD also include a Retry-After header" ([RFC 8030 §8.4][rfc8030]) | Wait for `Retry-After`, then retry or drop |
| `5xx` | Push service error ([autopush errors][autopush-err], [Apple doc][apple-doc]) | Retry with back-off, or drop |

### Queue or inline?

All of this subsection is **Inference**; no source prescribes an architecture.

- At this app's scale, no job queue is needed. Write the in-app notification in the request's transaction, then send pushes after the response without awaiting them (fire-and-forget), catching every error.
- Set the `timeout` option; the README says the default is no timeout ([web-push README][wp]).
- A crash between the DB write and the send loses that push. That is acceptable because the in-app record survives, and push is best-effort anyway.
- Skip retries in the first version, except possibly one retry for `429`/`5xx`. The push service itself keeps retrying delivery to the device until TTL expires ([RFC 8030 §6.2][rfc8030]).
- Revisit if the app ever fans out one event to thousands of subscriptions.

### Delivery guarantees

- Best-effort. The push service "is not obligated to store messages indefinitely" and may shorten the TTL ([RFC 8030 §5.2, §7.2][rfc8030]).
- `TTL: 0` delivers only if the device is reachable now ([RFC 8030 §5.2][rfc8030]). Maximum retention: Mozilla 2,592,000 seconds (about 30 days) ([autopush errors][autopush-err]); Apple "30 days or fewer" ([Apple doc][apple-doc]).
- On desktop, a push is not received while the browser is not running at all; Android wakes the browser ([web.dev FAQ][wd-faq]). On macOS, Safari does not need to be running ([Meet Web Push][wk-mac]).
- RFC 8030 defines optional delivery receipts (`Prefer: respond-async`, `202`) ([RFC 8030 §5.1][rfc8030]). `web-push` documents no receipt support, and whether FCM, autopush or APNs implement it is **Unverified**. Assume there are none.
- **Inference:** use a short TTL (hours to a day) so a stale push does not arrive days later, and `topic` so several queued pushes collapse into one.

## 5. Cost

- **FCM (Chrome, and Chromium browsers that use it):** Firebase pricing lists Cloud Messaging as "No-cost" ([Firebase pricing][fb-price]). VAPID sending needs no Firebase project ([web.dev FAQ][wd-faq]).
- **APNs web push:** no Apple Developer Program membership needed ([Apple doc][apple-doc]). Apple states no price; I found no charge documented.
- **Mozilla autopush:** the docs mention no cost or account ([autopush docs][autopush]). **Unverified** as an explicit "free" statement.
- **Quotas and limits found:**
  - Chrome: `429` above 1000 per minute, only for sites flagged for low-engagement spam ([Chrome rate limits][cr-rate]).
  - Apple: `429` for "too many requests for the same destination"; no number given; do not refresh the VAPID JWT more than once per hour; at most 100 unacknowledged requests per HTTP/1.1 connection ([Apple doc][apple-doc]).
  - Mozilla: `429` with `Retry-After` when an upstream bridge rate-limits; subscription router records "expire after 60 days without check-in" ([autopush errors][autopush-err], [autopush docs][autopush]).
  - Firefox: quota on pushes that do not show a notification ([MDN Push API][mdn-push]).
- **Library:** `web-push` 4.0.0, licence MPL-2.0, four runtime dependencies ([web-push package.json][wp-pkg]). MPL-2.0 is file-level copyleft; using it unmodified as a dependency places no obligation on app code (Inference; not legal advice).
- **Operational (Inference):** one more secret to manage, a small table, outbound HTTPS, and periodic manual testing on real devices. No extra hosting.

## 6. Risks and impracticalities

**iOS install friction.** Push on iPhone needs the user to add the app to the Home Screen first, and the API does not exist in a Safari tab ([BCD Notification][bcd-n]). The settings UI needs three states on iOS: not installed (show instructions), installed but not subscribed, subscribed. (Inference.)

**No delivery or read signal.** `201` means accepted only ([RFC 8030 §5][rfc8030]). Read state must come from the in-app record. A `notificationclick` can report a click to the server, but dismissals and unseen notifications stay invisible. (Inference.)

**Subscriptions disappear silently.** Causes: Chrome auto-revocation ([Chrome revocation][cr-revoke]), Safari revoking after a silent push ([Apple doc][apple-doc]), Mozilla's 60-day check-in expiry ([autopush docs][autopush]), the user clearing site data, or a VAPID key change ([RFC 8292 §4][rfc8292]). The server learns only on the next send (`404`/`410`), and `pushsubscriptionchange` is not dependable ([BCD ServiceWorkerGlobalScope][bcd-swgs]).

**HTTPS in production.** Required for service workers and push ([MDN register][mdn-reg]). Any deployment over plain HTTP on a non-localhost host disables the feature.

**Local development.**

- Real push works on `http://localhost` ([MDN Secure contexts][mdn-secure]); the dev machine needs internet access to reach the push services.
- `web-push generate-vapid-keys` creates dev keys with no account ([web-push README][wp]). Use a real `mailto:` subject even in dev, because Apple rejects localhost placeholders ([web-push README][wp]).
- **Inference:** put sending behind an interface such as `PushSender.send(subscription, payload)`. Tests and CI use a fake that records calls and can return `410` or `429` on demand; production uses `web-push`. No test should hit a real push service. Vitest cannot exercise the service worker itself; that needs manual or browser-driven testing.
- **Inference:** a service worker persists across dev sessions on `localhost:<port>` and can serve stale behaviour. Keep it free of `fetch` caching so it only handles push events.

**Click handling and deep links.**

- The service worker listens for `notificationclick`, reads `event.notification.data`, focuses an existing tab found with `clients.matchAll()`, or else calls `clients.openWindow(url)` ([web.dev patterns][wd-patterns]).
- BCD lists `notificationclick` as unsupported on Safari iOS ([BCD ServiceWorkerGlobalScope][bcd-swgs]). I could not confirm whether that entry is accurate. **Unverified**; test on a device.
- Declarative Web Push's `navigate` URL gives Safari 18.4+ a click target with no JavaScript ([Meet Declarative Web Push][wk-decl]). **Inference:** shaping the payload as declarative JSON from the start is a cheap hedge, because other browsers pass it to the `push` handler unchanged.
- On Android, Chrome opens a notification click in standalone mode only for sites "launched from homescreen within the last ten days" ([web.dev FAQ][wd-faq]).

**Multiple devices.** One user has many subscriptions; send to all of them, and expect some to fail. Use the same `tag` so a replacement notification updates in place per device ([web.dev patterns][wd-patterns]). Dismissing on one device does not dismiss on another. (Inference.)

**Multiple users on one browser.** A subscription is tied to the service worker, not the session ([MDN Push API][mdn-push]). (The rest is Inference.) If user A logs out and user B logs in, the browser still holds A's subscription, and A's notifications would appear on B's screen. On logout, call `unsubscribe()` and delete the row. On login or subscribe, upsert by `endpoint` and overwrite `user_id`. This app's DevUI user switcher makes this the normal case in development, so user switching must go through the same path.

**Two gates on preferences.** App preference says "push me for X"; browser permission says "this site may notify". (Inference.) The effective state is the AND of app preference, permission `granted`, and a live subscription on that device. The settings UI should show the browser state it reads at render time, and explain how to undo a `denied`, since the app cannot re-prompt ([web.dev permission UX][wd-ux]).

**Suppressing when the app is focused.** web.dev: "The one scenario where you don't have to show a notification is when the user has your site open and focused"; the worker checks `clients.matchAll()` for a focused client and can `postMessage` the page instead ([web.dev patterns][wd-patterns]). That guidance is written for Chrome. Safari states that every push must be shown or permission is revoked ([Apple doc][apple-doc]) and documents no focused-window exception. **Inference:** suppress only on the server side (do not send if the user is known to be active) or always show; do not skip `showNotification()` in the worker on Safari.

**Spam penalties.** Chrome's rate limits and auto-revocation are driven by volume against engagement ([Chrome rate limits][cr-rate], [Chrome revocation][cr-revoke]). **Inference:** default most notification types to in-app only, and make push opt-in per type.

## Not verified from a primary source

- Current status of Home Screen web apps in the EU (Apple's page no longer states it).
- Whether iOS 26 removed the manifest `display` requirement for push.
- Whether Chrome hard-enforces a user gesture for the permission prompt.
- Firefox and Safari private-browsing behaviour for push.
- Whether Edge uses WNS, and any WNS limits.
- Opera and Samsung Internet VAPID support (README and BCD disagree).
- Whether any push service implements RFC 8030 delivery receipts.
- BCD's "unsupported" entries for `notificationclick` and `pushsubscriptionchange` on Safari iOS.
- An explicit "free of charge" statement for Mozilla autopush and APNs web push.
- What Firefox does once the silent-push quota is used up.

## Sources

Standards:

- [RFC 8030, Generic Event Delivery Using HTTP Push][rfc8030]
- [RFC 8291, Message Encryption for Web Push][rfc8291]
- [RFC 8292, VAPID][rfc8292]

MDN and compat data:

- [MDN Push API][mdn-push]
- [MDN PushManager.subscribe()][mdn-sub]
- [MDN PushSubscription][mdn-ps]
- [MDN pushsubscriptionchange event][mdn-psc]
- [MDN Notification.requestPermission()][mdn-reqperm]
- [MDN Using the Notifications API][mdn-using]
- [MDN ServiceWorkerRegistration.showNotification()](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification)
- [MDN ServiceWorkerContainer.register()][mdn-reg]
- [MDN Secure contexts][mdn-secure]
- BCD: [PushManager][bcd-pm], [PushSubscription][bcd-ps], [Notification][bcd-n], [ServiceWorkerGlobalScope][bcd-swgs]

web.dev and Chrome:

- [Subscribing a user][wd-sub]
- [Permission UX][wd-ux]
- [The Web Push protocol][wd-proto]
- [Handling push events][wd-handle]
- [Common notification patterns][wd-patterns]
- [Push notifications FAQ][wd-faq]
- [Chrome: automatic notification permission removal (2025-10-10)][cr-revoke]
- [Chrome: web push rate limits (2026-01-06)][cr-rate]
- [Chrome: notification permission data in CrUX (quiet UI)][cr-quiet]

WebKit and Apple:

- [Meet Web Push (Safari 16, macOS)][wk-mac]
- [Web Push for Web Apps on iOS and iPadOS][wk-ios]
- [WebKit Features in Safari 16.4][wk-164]
- [Meet Declarative Web Push][wk-decl]
- [WebKit Features in Safari 18.4][wk-184]
- [WebKit Features in Safari 18.5][wk-185]
- [WebKit Features in Safari 26.0][wk-26]
- [Apple: Sending web push notifications in web apps and browsers][apple-doc]
- [Apple: Update on apps distributed in the European Union][apple-eu]
- [Apple: Using alternative browser engines in the European Union][apple-alt]

Mozilla, Microsoft, Firebase:

- [Mozilla autopush HTTP API][autopush]
- [Mozilla autopush error codes][autopush-err]
- [Microsoft Edge: Re-engage users with push messages][edge]
- [Firebase pricing][fb-price]

Libraries and tooling:

- [web-push README][wp]
- [web-push package.json][wp-pkg]
- [Vite: static asset handling, the public directory][vite]
- [react-router-serve cli.ts][rr-serve]

Secondary (used only where marked):

- [MacRumors, 2024-03-01, on Apple's EU reversal][eu-secondary]

[rfc8030]: https://www.rfc-editor.org/rfc/rfc8030.html
[rfc8291]: https://www.rfc-editor.org/rfc/rfc8291.html
[rfc8292]: https://www.rfc-editor.org/rfc/rfc8292.html
[mdn-push]: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
[mdn-sub]: https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe
[mdn-ps]: https://developer.mozilla.org/en-US/docs/Web/API/PushSubscription
[mdn-psc]: https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/pushsubscriptionchange_event
[mdn-reqperm]: https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static
[mdn-using]: https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API
[mdn-reg]: https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register
[mdn-secure]: https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
[bcd-pm]: https://github.com/mdn/browser-compat-data/blob/main/api/PushManager.json
[bcd-ps]: https://github.com/mdn/browser-compat-data/blob/main/api/PushSubscription.json
[bcd-n]: https://github.com/mdn/browser-compat-data/blob/main/api/Notification.json
[bcd-swgs]: https://github.com/mdn/browser-compat-data/blob/main/api/ServiceWorkerGlobalScope.json
[wd-sub]: https://web.dev/articles/push-notifications-subscribing-a-user
[wd-ux]: https://web.dev/articles/push-notifications-permissions-ux
[wd-proto]: https://web.dev/articles/push-notifications-web-push-protocol
[wd-handle]: https://web.dev/articles/push-notifications-handling-messages
[wd-patterns]: https://web.dev/articles/push-notifications-common-notification-patterns
[wd-faq]: https://web.dev/articles/push-notifications-faq
[cr-revoke]: https://blog.google/chromium/automatic-notification-permission/
[cr-rate]: https://developer.chrome.com/blog/web-push-rate-limits
[cr-quiet]: https://developer.chrome.com/blog/notification-permission-data-in-crux
[wk-mac]: https://webkit.org/blog/12945/meet-web-push/
[wk-ios]: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
[wk-164]: https://webkit.org/blog/13966/webkit-features-in-safari-16-4/
[wk-decl]: https://webkit.org/blog/16535/meet-declarative-web-push/
[wk-184]: https://webkit.org/blog/16574/webkit-features-in-safari-18-4/
[wk-185]: https://webkit.org/blog/16923/webkit-features-in-safari-18-5/
[wk-26]: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
[apple-doc]: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
[apple-eu]: https://developer.apple.com/support/dma-and-apps-in-the-eu/
[apple-alt]: https://developer.apple.com/support/alternative-browser-engines/
[autopush]: https://mozilla-services.github.io/autopush-rs/http.html
[autopush-err]: https://mozilla-services.github.io/autopush-rs/errors.html
[edge]: https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/push
[fb-price]: https://firebase.google.com/pricing
[wp]: https://github.com/web-push-libs/web-push/blob/master/README.md
[wp-pkg]: https://github.com/web-push-libs/web-push/blob/master/package.json
[vite]: https://vite.dev/guide/assets
[rr-serve]: https://github.com/remix-run/react-router/blob/main/packages/react-router-serve/cli.ts
[eu-secondary]: https://www.macrumors.com/2024/03/01/apple-walks-back-decision-to-disable-eu-web-apps/
