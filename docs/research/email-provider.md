# Research: transactional email provider for Cadence

- **Ticket**: #9 "Research an email provider" (map: #4 "Notifications spec")
- **Date checked**: 2026-11-12. Pricing and free tiers change often; every figure below was read from the live page on that date unless marked otherwise.
- **Location note**: the repo had no convention for research notes, so this file starts one at `docs/research/`.

## Recommendation

**Use Resend**, called over its HTTP API with the official `resend` Node SDK, behind an `EmailSender` seam whose default implementation in development captures the message locally instead of sending.

Why Resend over the others:

1. **Only permanent free tier that is both big enough and complete.** 3,000 emails/month, 100/day, with webhooks, suppression list and 30-day logs included. Postmark's free tier is 100/month, SendGrid no longer has a permanent free plan, SES has no free allowance beyond new-account credits, Mailgun matches the daily cap but keeps logs for 1 day.
2. **Smallest integration.** One JSON `POST`, one typed SDK call returning `{ data, error }`, idempotency keys built in, webhook signature verification built into the SDK. SES needs IAM, SNS topics and a sandbox-exit review to reach the same place.
3. **Bounce and complaint handling is done for us.** Resend suppresses hard-bounced and complained addresses automatically, team-wide; Cadence only has to listen to webhooks to reflect that state.
4. **Nothing is locked.** The seam keeps the provider replaceable. Resend also speaks SMTP, so the fallback path to any other provider (or to a local SMTP catcher) is short.

Runner-up: **Amazon SES** if volume ever outgrows free tiers ($0.10 per 1,000), at the cost of much more setup. **Postmark** is the quality benchmark but its free tier (100/month) is too small to run even a demo.

The main caveats, all detailed below:

- Real sending to anyone but the account owner **requires a domain you own** with DNS access. This is true of every provider.
- The free cap is **100 emails per day**, and Resend does **not queue or retry** when the cap or the rate limit is hit. Cadence must own retry state.
- One-click unsubscribe (RFC 8058) requires an **unauthenticated, token-addressed** unsubscribe endpoint, which constrains the preferences model.

## Comparison

| | Resend | Postmark | Amazon SES | Mailgun | SendGrid (Twilio) | Brevo |
|---|---|---|---|---|---|---|
| Permanent free tier | 3,000/month, 100/day | 100/month | None specific to SES; new-account AWS credits only | 100/day | None; 60-day trial at 100/day | 300/day (see trust note) |
| Free-tier extras | 3 domains, 30-day retention, 1 webhook endpoint | No overages allowed | Sandbox: 200/day, verified recipients only | 1 domain, 1 day of logs | n/a | not verified |
| Cheapest paid | $20/mo for 50,000 | $15/mo for 10,000 | $0.10 per 1,000 | $15/mo for 10,000 | from $19.95/mo | $9/mo for 5,000 (see trust note) |
| Node SDK (npm, latest) | `resend` 6.38.0, Node >=20, typed | `postmark` 5.1.1, Node >=18, typed | `@aws-sdk/client-sesv2` 3.1167.0, Node >=20, typed | `mailgun.js` 14.1.1, depends on axios | `@sendgrid/mail` 8.1.6, last published 2025-09 | `@getbrevo/brevo` 6.2.0, typed |
| Domain verification | DKIM + SPF records (TXT, MX or CNAME) | DKIM record required for domain verification; Return-Path recommended | 3 CNAME records (Easy DKIM), per region | not verified | not verified | sender and domain must be configured first |
| Gate before real sending | Verified domain | Verified domain plus manual account approval | Verified identity plus sandbox-exit request | not verified | not verified | account approval |
| Bounces / complaints | Webhooks, automatic team-wide suppression | Webhooks, per-stream suppressions | SNS topics or event publishing, account-level suppression list | not verified | not verified | not verified |
| Webhook auth | Signed (Svix headers), SDK helper | Not signed; Basic Auth + IP allowlist | SNS message signatures | not verified | not verified | not verified |
| No-send test mode | Test addresses (still count against quota) | `POSTMARK_API_TEST` token, blackhole address | Mailbox simulator | not verified | not verified | not verified |

"not verified" means the provider's doc page could not be fetched or was not read on the date checked; see Gaps.

Sources for the table:

- Resend pricing: <https://resend.com/pricing>; quotas: <https://resend.com/docs/knowledge-base/account-quotas-and-limits>
- Postmark pricing: <https://postmarkapp.com/pricing>
- SES pricing: <https://aws.amazon.com/ses/pricing/>; sandbox: <https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html>
- Mailgun pricing: <https://www.mailgun.com/pricing/>
- SendGrid pricing: <https://www.twilio.com/en-us/products/email-api/pricing>
- Brevo: see trust note below
- SDK versions, engines and dependencies: the npm registry (`https://registry.npmjs.org/<package>`), queried 2026-11-12

**Trust note on Brevo.** Brevo's pricing page (<https://www.brevo.com/pricing/>) rendered no content to the fetcher and its help centre returned 403. The 300/day and $9/month figures come from search-result summaries of Brevo's own marketing pages, not from a page read directly. Treat them as lower confidence.

## Free-tier limits in detail

### Resend

- Free: 3,000 emails/month, 100 emails/day, 3 domains, 30-day data retention, 1 webhook endpoint. Pro: $20/month for 50,000, no daily limit, overage $0.90 per 1,000. (<https://resend.com/pricing>)
- The daily quota resets at midnight UTC. The free quotas cover **both sent and received** emails. (<https://resend.com/docs/knowledge-base/account-quotas-and-limits>)
- When a quota is exceeded "the API returns a `429` error with `daily_quota_exceeded` or `monthly_quota_exceeded`" and "Resend doesn't queue or retry that email." (same page)
- Rate limit: "All accounts start with a rate limit of 10 requests per second", per team, with "no separate burst allowance". (same page; also <https://resend.com/docs/api-reference/introduction>)
- Account health thresholds enforced on every plan: bounce rate under 4%, spam rate under 0.08%; exceeding either "may result in a temporary pause in sending". (same page)

### Postmark

- Free plan: "100 emails/month", "No overages allowed in this plan", and it "doesn't expire". Basic: $15/month for 10,000, extra at $1.80 per 1,000. (<https://postmarkapp.com/pricing>)

### Amazon SES

- The pricing page lists no SES-specific free allowance. It describes general AWS Free Tier credits: "New AWS customers will receive up to $200 in AWS Free Tier credits", free plan "available for 6 months after account creation". Outbound email is "$0.10 / 1,000 emails". (<https://aws.amazon.com/ses/pricing/>)
- New accounts are in a sandbox: "You can only send mail to verified email addresses and domains, or to the Amazon SES mailbox simulator", "a maximum of 200 messages per 24-hour period", "a maximum of 1 message per second". Leaving it needs a support request; "The AWS Support team provides an initial response to your request within 96 hours." (<https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html>)

### Mailgun

- Free: "100 emails/day included", 1 custom sending domain, "1 day of log retention". Basic: "Starting at $15/mo" for 10,000. (<https://www.mailgun.com/pricing/>)

### SendGrid

- Only a trial: "Free trial lets you send 100 emails/day for 60 days." Essentials "starting at $19.95/mo". (<https://www.twilio.com/en-us/products/email-api/pricing>)

## API and Node SDK quality

### Resend

- Send: `POST https://api.resend.com/emails` with a bearer token. Required fields `from`, `to` (up to 50 addresses), `subject`; optional `html`, `text`, `react` (Node SDK only), `headers`, `tags`, `reply_to`, attachments, scheduling. (<https://resend.com/docs/api-reference/emails/send-email>)
- SDK call shape: `const { data, error } = await resend.emails.send({...})`. Errors are returned, not thrown. (same page)
- **Idempotency**: an `Idempotency-Key` header, max 256 characters, "Idempotency keys expire after 24 hours." (same page)
- Batch: "send up to 100 emails in a single API call"; attachments are not supported in batch. (<https://resend.com/docs/api-reference/emails/send-batch-emails>)
- SMTP is also available: host `smtp.resend.com`, ports 25, 465, 587, 2465 or 2587, username `resend`, password is the API key. (<https://resend.com/docs/send-with-smtp>)
- SDK: `resend` 6.38.0, published 2026-11-10, `engines: node >=20`, ships type definitions, MIT licence. Dependencies: `postal-mime`, `standardwebhooks`. (npm registry; <https://github.com/resend/resend-node>). Cadence already uses `@types/node ^22`, so the Node floor is met.

### Others, briefly

- **Postmark**: token in an `X-Postmark-Server-Token` header; typed SDK with no runtime dependencies. (<https://postmarkapp.com/developer/api/overview>, npm registry)
- **SES**: the AWS SDK v3 client pulls in the AWS credential and Smithy stack; sending also requires IAM credentials and a region. (npm registry dependency list)
- **Mailgun**: send is a multipart form `POST` to `https://api.mailgun.net/v3/YOUR_DOMAIN_NAME/messages` with HTTP basic auth, and the base URL differs by region. (<https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-http>)
- **Brevo**: `POST https://api.brevo.com/v3/smtp/email` with an `api-key` header; SDK call `client.transactionalEmails.sendTransacEmail({...})`. (<https://developers.brevo.com/docs/send-a-transactional-email>)
- **SendGrid**: `@sendgrid/mail` 8.1.6 was last published 2025-09-19 and declares `node >=12`. (npm registry)

## Domain verification

- **Resend**: "You must add and verify at least one domain to send emails with Resend." (<https://resend.com/docs/dashboard/domains/introduction>) You "Provide the DKIM and SPF configurations (`TXT` and `MX` or `CNAME` records) to your DNS provider"; verification often completes "within 15 minutes"; DMARC is added after verification and is not required for it. (<https://resend.com/docs/dashboard/domains/add-a-domain>)
- Resend recommends a subdomain: "We recommend sending your emails from one or more subdomains", to isolate reputation. (domains introduction page)
- **Without a verified domain**, the shared `resend.dev` sender "can only send emails to the email address associated with your Resend account"; other recipients get a 403 "You can only send testing emails to your own email address." (<https://resend.com/docs/knowledge-base/403-error-resend-dev-domain>)
- **Postmark**: a DKIM record is required to verify a whole domain, a custom Return-Path is strongly recommended. Additionally every new account is manually reviewed; until approved "you won't be able to send to any email address outside the domains you've added to your account and verified." Review takes "less than 24 hours on weekdays". (<https://postmarkapp.com/support/article/1002-getting-started-with-postmark>, <https://postmarkapp.com/support/article/1084-how-does-the-account-approval-process-work>)
- **SES**: Easy DKIM, three CNAME records, DNS changes "can take up to 72 hours to propagate", and identities are per AWS Region. (<https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html>)

**Consequence for Cadence**: no provider lets an unverified sender mail arbitrary people. Real email to real users needs a domain the project owns. Until one exists, the only real recipient is the provider account's own address, which makes the local stand-in the primary path, not a convenience.

## Bounce and complaint handling

### Resend

- Webhook events: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced` ("the recipient's mail server permanently rejected the email"), `email.complained` ("successfully delivered, but the recipient marked it as spam"), `email.failed`, `email.suppressed`, plus `opened`, `clicked`, `scheduled`, `received`. (<https://resend.com/docs/dashboard/webhooks/event-types>)
- **Automatic suppression**: an address is suppressed on bounce, on complaint, or manually. Resend will "skip all sending to that recipient until it is removed from your team's suppression list." "Suppressions apply to your entire team" across all domains. Removal is possible by dashboard or API, but a removed address is "automatically re-suppressed" if it bounces or complains again. `suppression.added` and `suppression.removed` webhooks exist. (<https://resend.com/docs/dashboard/emails/email-suppressions>)
- Complaint coverage is partial: "Not all Inbox Service Providers return a `complained` event." (same page) AWS states the same of its own feed: "Gmail doesn't provide complaint data to SES." (<https://docs.aws.amazon.com/ses/latest/dg/sending-email-suppression-list.html>)
- **Webhook verification**: signing secret plus `svix-id`, `svix-timestamp`, `svix-signature` headers; `resend.webhooks.verify` throws when invalid. "Make sure that you're using the raw request body when verifying webhooks." (<https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests>)
- **Webhook retries**: exponential backoff at immediately, 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours, 10 hours. A persistently failing endpoint is disabled automatically. Events can be replayed from the dashboard. (<https://resend.com/docs/webhooks/retries-and-replays>)
- Free plan allows **one** webhook endpoint. (<https://resend.com/pricing>)

### Others

- **Postmark**: bounce webhook pushes JSON with `Type`, `Email`, `Inactive`, `CanActivate`; "Postmark doesn't sign webhooks", so "Protect the endpoint with HTTP Basic Authentication and IP allowlisting". (<https://postmarkapp.com/developer/webhooks/bounce-webhook>) Suppressions are per message stream with reasons `HardBounce`, `SpamComplaint`, `ManualSuppression`; "`SpamComplaint` suppressions cannot be deleted." (<https://postmarkapp.com/developer/api/suppressions-api>)
- **SES**: "In order to send email using Amazon SES, you must have a system in place for managing bounces and complaints", delivered by email, an SNS topic, or event publishing. (<https://docs.aws.amazon.com/ses/latest/dg/monitor-sending-activity-using-notifications.html>) The account-level suppression list is on by default for accounts created after 2019-11-25 and only hard bounces are added. (<https://docs.aws.amazon.com/ses/latest/dg/sending-email-suppression-list.html>)

## Unsubscribe requirements

### Mailbox-provider rules (Gmail, Yahoo)

- **All senders**, any volume: SPF or DKIM, TLS, and a spam rate below 0.3% (Gmail recommends staying below 0.10%). (<https://support.google.com/a/answer/81126>, <https://senders.yahooinc.com/best-practices/>)
- **Bulk senders** (Gmail: "close to 5,000 messages or more to personal Gmail accounts within a 24-hour period", counted across the primary domain and its subdomains, and the status is permanent once reached): SPF and DKIM and DMARC, From-domain alignment, and "Marketing messages and subscribed messages must support one-click unsubscribe" plus a clearly visible unsubscribe link in the body. (<https://support.google.com/a/answer/81126>, <https://support.google.com/a/answer/14229414>)
- Gmail's FAQ: "Transactional messages are excluded from this requirement", with examples such as password resets and reservation confirmations. It does not define the line; it says recipients decide what a message is to them. (<https://support.google.com/a/answer/14229414>)
- Timing: Gmail recommends fulfilling unsubscribe requests within 48 hours; Yahoo says "Honor unsubscribes within 2 days". (same Gmail FAQ; Yahoo best practices)
- "One-click unsubscribe links that link to a landing or other type of web page don't comply with RFC 8058." A preferences-page link in the body is fine but does not satisfy one-click by itself. (Gmail FAQ)

Cadence on a 100/day free tier is nowhere near the bulk threshold, so one-click unsubscribe is not strictly required by Gmail or Yahoo. Notification emails ("someone replied to your comment") are closer to "subscribed messages" than to password resets, though, and complaint rate limits apply at every volume. Implementing RFC 8058 from the start is cheap and is the main lever for keeping the complaint rate under Resend's 0.08% threshold.

### RFC 8058 (one-click)

From <https://www.rfc-editor.org/rfc/rfc8058.txt>:

- Section 3.1: the message carries one `List-Unsubscribe` and one `List-Unsubscribe-Post` header. "The List-Unsubscribe-Post header MUST contain the single key/value pair "List-Unsubscribe=One-Click"." "The List-Unsubscribe header field MUST contain one HTTPS URI."
- Section 3.1: "The URI in the List-Unsubscribe header MUST contain enough information to identify the mail recipient and the list". "The URI SHOULD include an opaque identifier or another hard-to-forge component".
- Section 3.1: "The POST request MUST NOT include cookies, HTTP authorization, or any other context information." "The mail sender MUST NOT return an HTTPS redirect".
- Section 3.2: the mailbox provider sends an HTTPS `POST` whose body is `List-Unsubscribe=One-Click`, as `multipart/form-data` (or `application/x-www-form-urlencoded`).
- Sections 3.1 and 4: the message must have a valid DKIM signature and "The List-Unsubscribe and List-Unsubscribe-Post headers MUST be covered by the signature".
- The RFC has no rule that a `GET` must not unsubscribe, but section 1 explains that mail scanners fetch header URLs automatically, which is why a `GET` should show a confirmation page instead of acting.

### How Resend exposes it

- Headers are set per message through the `headers` field: `List-Unsubscribe: <https://example.com/unsubscribe>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. For a `POST` the endpoint returns a blank page with `200 (OK)` or `202 (Accepted)`; for a `GET` it shows the regular unsubscribe page. "Ensure that users stop receiving email within 48 hours of this request." (<https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails>)
- Not verified: whether Resend's DKIM signature covers custom `List-Unsubscribe` headers. Check a received message's `h=` tag during implementation.

### Legal basics (United States, CAN-SPAM)

From the FTC compliance guide, <https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business>:

- A "transactional or relationship" message (one that consists only of content facilitating an agreed transaction, account or relationship updates, and similar) "is otherwise exempt from most provisions of the CAN-SPAM Act", but routing information must still be truthful. The FTC reads the categories narrowly.
- Commercial messages need a valid physical postal address, an opt-out honoured "within 10 business days", an opt-out mechanism that works "for at least 30 days" after sending, and no fee or information demanded beyond an email address.
- Mixed messages are classified by primary purpose, judged first on the subject line.

This is a summary of the regulator's guidance, not legal advice. Keeping notification emails free of promotional content keeps them on the transactional side of the line.

## Local development

What each provider offers:

- **Resend**: test recipients `delivered@resend.dev`, `bounced@resend.dev`, `complained@resend.dev`, `suppressed@resend.dev`, with `+label` support on the first three. They exercise the real pipeline and webhooks, but "Test emails count against your account's sending quota" and they need an API key and network access. (<https://resend.com/docs/dashboard/emails/send-test-emails>) Resend's webhook docs also mention listening for webhook events locally through its CLI. (<https://resend.com/docs/dashboard/webhooks/introduction>) No no-send test-mode API key was found in the docs read.
- **Postmark**: `POSTMARK_API_TEST` as the server token validates a request without delivering; `test@blackhole.postmarkapp.com` drops mail on receipt. (<https://postmarkapp.com/developer/api/overview>, <https://postmarkapp.com/support/article/1084-how-does-the-account-approval-process-work>)
- **SES**: a mailbox simulator, usable inside the sandbox. (<https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html>)
- **Provider-neutral**: Mailpit is an SMTP catcher with a web inbox that "Runs entirely from a single static binary or multi-architecture Docker images" and has "A REST API for integration testing". (<https://mailpit.axllent.org/docs/>)

Recommended shape for Cadence (a design inference, not a sourced fact):

1. An `EmailSender` interface with one method, taking recipient, subject, HTML, text and headers, returning a provider message id or an error.
2. A **capture** implementation as the default whenever no `RESEND_API_KEY` is set: it records the rendered message (a SQLite table or a file) and exposes it somewhere visible, such as the existing DevUI panel. Seeded users have fake addresses, so nothing should leave the machine by default. Tests use the same implementation.
3. A **Resend** implementation used only when the key is present.
4. Optional: because Resend's test addresses are real sends, use them only for a manual end-to-end check of bounce and complaint webhooks, not in automated tests.

Mailpit is unnecessary if the capture implementation exists; it becomes useful only if the seam is SMTP-shaped.

## Implications for other decisions on the map

These follow from the sourced facts above but are inferences for the spec to confirm.

**Sending without a job queue.**

- Resend neither queues nor retries on a 429 quota or rate-limit error. The durable record of "this email still needs sending" therefore has to live in Cadence's SQLite database, as a per-channel delivery row with a status (pending, sent, failed, suppressed) and an attempt count.
- Use the delivery row's id as the `Idempotency-Key`, so a retry after a timeout cannot double-send. Keys last 24 hours, so retries must stop or re-key after that.
- The send must not run inside the request that triggered the notification. On a single long-lived Node server, the smallest mechanism is an in-process sweep that picks up pending delivery rows. No external queue is needed, but the delivery table is.
- The 100/day cap is a real design input: one busy comment thread can spend it. This strengthens the case for batching or a digest on the email channel, and the sweep should treat `daily_quota_exceeded` as "retry after midnight UTC" instead of a failure.

**What preferences and unsubscribe must support.**

- The one-click endpoint receives a `POST` with no cookies and no session, so the URL itself must identify the user and what they are unsubscribing from, through a signed or opaque token. Preferences therefore have to be addressable without login.
- The endpoint must act immediately and return 200 or 202 with no redirect; a `GET` to the same URL shows a confirmation or preferences page and must not unsubscribe by itself.
- The "list" in the token has to map to a unit in the preference model. The simplest unit is the email channel for one notification type; decide whether one click turns off that type or all email.
- Every email also needs a visible unsubscribe or preferences link in the body.
- Unsubscribes must take effect within 48 hours; applying them synchronously satisfies that.

**Failure handling.**

- Resend's suppression is automatic and team-wide, so a hard-bounced address silently stops receiving everything. Cadence should consume `email.bounced`, `email.complained` and `email.suppressed` webhooks to mark the address as undeliverable on the user and show that in preferences, otherwise the in-app state and reality diverge.
- The webhook route needs the raw request body for signature verification, must be reachable from the public internet, and must be idempotent because deliveries are retried. The free plan allows one endpoint, so all event types share one route.
- Complaints from Gmail users are generally not reported back, so the complaint signal is incomplete; one-click unsubscribe is the more reliable off-ramp.

**Domain.** A project-owned domain with DNS access is a prerequisite for real sending, on a subdomain per Resend's advice. Until then, only the Resend account's own address can receive real email.

## Gaps and confidence

- **Brevo** figures are lower confidence (see trust note).
- **Mailgun** webhook, suppression and test-mode pages returned 404 at the URLs tried; those cells are marked "not verified".
- **SendGrid** domain authentication, event webhook and sandbox mode were not read; SendGrid was ruled out on the absence of a permanent free plan.
- **Postmark** sandbox servers and the spam-complaint webhook page were not read.
- **EU law** (GDPR, ePrivacy rules on electronic marketing) was not researched. If Cadence has EU users, consent and lawful basis for notification email need a separate look.
- **Resend data residency and region choice** were not researched.
- Resend's pricing page does not state the rate limit number; the 10 requests/second figure is from its API reference and quotas pages.
