# Research: an SMS provider for Cadence

Ticket: #10. Parent map: #4. All prices and docs checked on **2026-11-12**; SMS pricing changes often, so re-check before committing money.

This is engineering research, not legal advice. The legal sections quote the statutes; how they apply to Cadence's specific messages is a judgement a lawyer should confirm before real sending.

## Answer

**Use Twilio**, behind the same sending seam as email, and treat SMS as the last and most expensive channel.

- **No provider has a meaningful free tier.** Every option is pay-per-message. Twilio's trial is 100 SMS to at most 5 verified recipients, templates only, and expires after 30 days. AWS has no SMS free tier and a $1/month sandbox cap.
- **Germany is expensive everywhere: about $0.10 to $0.11 per segment.** The US is about $0.012 per segment, but carries fixed registration fees and paperwork.
- **Twilio wins on everything except price**: free test credentials with magic numbers, an official Node library, built-in STOP handling, a hosted verification product, and alphanumeric senders in Germany with no registration and no monthly fee.
- **The cost of SMS to the app is mostly not the provider.** It is collecting a phone number, proving the user owns it, recording consent, and honouring opt-out from two directions (the preferences page and a STOP reply).

If price becomes the deciding factor for German traffic, seven.io (a German provider, EUR 0.075 per SMS) is the cheaper swap; the seam makes that a later change.

## Price per message

All prices are per segment (160 GSM-7 characters, or 70 if the text contains any non-GSM character such as an emoji). A notification that runs to two segments costs double.

| Provider | Germany, outbound | US, outbound (before carrier fees) | Fixed costs | Source |
| --- | --- | --- | --- | --- |
| Twilio | $0.112 (number or alphanumeric sender) | $0.0083 | DE: alphanumeric sender free, mobile number $30/month. US: long code $1.15/month, toll-free $2.15/month | [DE](https://www.twilio.com/en-us/sms/pricing/de), [US](https://www.twilio.com/en-us/sms/pricing/us) |
| Plivo | $0.095 to $0.14 on the main networks (Vodafone $0.14), up to $0.20 on small ones | $0.0077 | US long code $0.50/month | [DE](https://www.plivo.com/sms/pricing/de/), [US](https://www.plivo.com/sms/pricing/us/) |
| seven.io | EUR 0.075 (net, plus 19% VAT) | Not shown on the page read | Inbound number from EUR 19.90/month plus EUR 9.90 setup | [pricing](https://seven.io/en/pricing/) |
| Sinch | Not shown on the page read | $0.0078 | US 10DLC number $1/month plus $1 setup | [pricing](https://sinch.com/pricing/sms/) |
| Bird (ex MessageBird) | Not shown on the page read | $0.0035 | 10DLC brand $4.50, campaign vetting $15, campaign $1.50 to $10/month | [pricing](https://bird.com/en-us/pricing/sms) |
| AWS End User Messaging | In a per-country CSV, not read | In the same CSV, not read | US 10DLC number $1/month, toll-free $2/month; 10DLC company registration $4.50, campaign $2 (low volume) or $10/month | [pricing](https://aws.amazon.com/end-user-messaging/pricing/) |
| Vonage | Not verified: the pricing page returned HTTP 403 to the fetch | Not verified | Not verified | [pricing](https://www.vonage.com/communications-apis/sms/pricing/) |

US carrier surcharges come on top of every provider's base price. Twilio and Plivo publish the same figures: AT&T $0.0035, T-Mobile $0.0045, Verizon $0.005 per outbound SMS. So a US message through Twilio is about **$0.012 to $0.013**.

Twilio also charges $0.001 for each message that ends in `Failed` ([Twilio US pricing](https://www.twilio.com/en-us/sms/pricing/us)).

### Free tiers: confirmed absent

- **Twilio**: the trial gives product-specific free units ("100 SMS messages"), sends only to verified recipients (up to 5), only in the sign-up country, only with Twilio-provided templates, and "Trial accounts expire after 30 days" ([Twilio trial guide](https://www.twilio.com/docs/messaging/guides/how-to-use-your-free-trial-account)). Useful for a smoke test, not for running the app.
- **AWS**: the pricing page lists no SMS free allotment. New accounts sit in a sandbox with "a monthly SMS spending limit of $1.00 (USD)" and at most 10 verified destination numbers until a support case grants production access ([AWS sandbox](https://docs.aws.amazon.com/sms-voice/latest/userguide/sandbox.html)).
- **Plivo, Sinch, seven.io**: each advertises trial credit without stating an amount.
- **Bird**: pay as you go, no free tier mentioned.

## API quality

**Twilio** is the strongest:

- One call: `POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json` with a recipient, a sender and content. Official Node.js library: `client.messages.create({ body, from, to })` ([Message resource](https://www.twilio.com/docs/messaging/api/message-resource)).
- Delivery state arrives by webhook: pass `StatusCallback` and Twilio POSTs each status change (queued, sent, delivered, undelivered, failed) to that URL. Cadence would need a public route to receive it; no background job is needed to send.
- Opted-out recipients fail with a specific error code, 21610, which the app can map to "SMS switched off for this user".

**AWS End User Messaging** has a capable API (`SendTextMessage`) but more setup: IAM, sandbox exit by support ticket, and its docs warn that numbers "are provisioned through a single carrier partner in each region/country. This creates a single point of failure" ([AWS countries](https://docs.aws.amazon.com/sms-voice/latest/userguide/phone-numbers-sms-by-country.html)).

Plivo, Sinch, Bird and seven.io all offer comparable REST APIs; their docs were not compared in depth because nothing in their pricing justified leaving Twilio's tooling.

## Phone number verification

Two ways to prove a user owns the number they typed:

1. **Twilio Verify**: start a verification (Twilio sends the code), then check the code the user enters; the response is `approved` or `pending` ([Verify API](https://www.twilio.com/docs/verify/api)). Cost: "$0.05 per successful verification + $0.0083 per SMS (US)" ([Verify pricing](https://www.twilio.com/en-us/verify/pricing)). Germany's Verify SMS rate is not on that page; if the standard $0.112 applies, a German verification costs about $0.16. That figure is an inference, not a quoted price.
2. **Roll it in the app**: generate a code, send it as an ordinary SMS, store a hash with an expiry, compare. Costs only the SMS, but the app then owns expiry, attempt limits and rate limiting.

Either way, an unauthenticated "send me a code" endpoint is a fraud target (attackers trigger paid SMS to premium numbers). Twilio sells protection for this at $0.025 per message ([Twilio DE pricing](https://www.twilio.com/en-us/sms/pricing/de)); the cheap defence is to allow verification only for signed-in users, rate-limit it, and restrict destination countries.

Verification volume is low (once per user per number), so Verify's $0.05 premium is small in absolute terms. Recommendation: use Verify and avoid building code storage.

## Sender registration

### Germany and the EU

- Twilio supports **alphanumeric sender IDs** in Germany (for example `Cadence`), dynamic, with no pre-registration and no provisioning time ([Twilio Germany guidelines](https://www.twilio.com/en-us/guidelines/de/sms)). The sender itself is free; only messages are billed.
- An alphanumeric sender is **one-way**: recipients cannot reply, so they cannot text STOP. Opt-out must then live elsewhere (see below). A two-way German mobile number costs $30/month on Twilio.
- Other EU countries differ: AWS's table shows registration required for sender IDs in Spain, Ireland and the UK, among others ([AWS countries](https://docs.aws.amazon.com/sms-voice/latest/userguide/phone-numbers-sms-by-country.html)). Launching SMS in Germany first avoids this.

### United States: A2P 10DLC

Sending to US numbers from an ordinary 10-digit number requires registering with The Campaign Registry. Twilio states this covers everyone, including individuals and hobbyists; unregistered traffic is filtered and incurs extra carrier fees ([Twilio A2P 10DLC](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc)).

- **Brand** (who you are): $4.50 one-time; a Standard brand adds $41.50 vetting ([Twilio brand registration](https://www.twilio.com/docs/trust-hub/registrations/a2p-10dlc-brand)).
- **Campaign** (what you send): a $15 vetting fee and a monthly fee of roughly $1.50 to $10 depending on use case. These two figures come from a search summary of Twilio's help article, which blocked a direct fetch; Bird and AWS publish matching figures, which supports them. Verify on [Twilio's 10DLC fee article](https://help.twilio.com/articles/1260803965530) before budgeting.
- **Review time**: brands are typically approved in minutes; "Campaign reviews take up to 5 business days" ([Twilio 10DLC quickstart](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/quickstart)).
- **What the campaign must show**: a description, sample messages that name the sender and "Indicate an opt-out mechanism in every message", and "an opt-in method that TCR can verify". The privacy policy should say mobile information is not shared with third parties for marketing (same quickstart).

**Catch for a developer in Germany**: the cheapest brand type, Sole Proprietor (no tax ID), requires being "located in the US or Canada". Standard and Low-Volume Standard brands need a tax ID, "such as a US EIN or a Canadian Business Number, or the equivalent in other countries" ([Twilio A2P 10DLC](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc)). So US sending needs a registered business with a tax ID; a private individual in Germany cannot register. Which German identifier Twilio accepts was not confirmed.

A **US toll-free number** is the alternative: outside the 10DLC system, but it also must pass verification before it can send to the US, and the form asks for business details, use case and opt-in flow ([Twilio toll-free onboarding](https://www.twilio.com/docs/messaging/compliance/toll-free/console-onboarding)). Cost and turnaround were not stated on the page read.

## Consent and opt-out rules

### Germany and the EU

- **UWG § 7(2) no. 2**: advertising by electronic mail without the addressee's prior express consent is always an unacceptable nuisance ("ohne dass eine vorherige ausdrückliche Einwilligung des Adressaten vorliegt") ([UWG § 7](https://www.gesetze-im-internet.de/uwg_2004/__7.html)). This implements Article 13 of the ePrivacy Directive 2002/58/EC, whose recital 40 counts SMS as electronic mail. The directive text could not be fetched from EUR-Lex during this research; that reading rests on a search summary and should be checked at [EUR-Lex](https://eur-lex.europa.eu/eli/dir/2002/58/oj/eng).
- **UWG § 7(2) no. 3**: every such message must identify the sender and give a valid address where the recipient can ask for messages to stop, at no more than basic transmission cost.
- **UWG § 7(3)**, the existing-customer exception, is narrow (own similar products, address obtained in a sale, objection offered each time). Do not rely on it.
- **GDPR Article 7**: the controller "shall be able to demonstrate" that consent was given, and "It shall be as easy to withdraw as to give consent" (read from [gdpr-info.eu](https://gdpr-info.eu/art-7-gdpr/), a mirror of the regulation; EUR-Lex could not be fetched).
- Fines under UWG § 20 reach EUR 300,000 for consentless automated advertising ([UWG, English translation](https://www.gesetze-im-internet.de/englisch_uwg/englisch_uwg.html)).

Whether a "someone replied to your comment" SMS counts as advertising under UWG is a legal question this research does not settle; German courts read "Werbung" broadly. A separate, explicit, recorded opt-in for SMS makes the question moot, and GDPR needs a lawful basis for the phone number in any case.

Twilio's own rules for Germany add: get opt-in before any message, support HELP/STOP "in the end-user's local language", and "Only communicate during an end-user's daytime hours unless it is urgent" ([Twilio Germany guidelines](https://www.twilio.com/en-us/guidelines/de/sms)).

### United States

From 47 CFR § 64.1200 (read at [Cornell LII](https://www.law.cornell.edu/cfr/text/47/64.1200), a mirror; ecfr.gov blocked the fetch):

- "the term 'call' includes a text message" (a)(9).
- Autodialed texts to mobile numbers need prior express consent (a)(1)(iii); texts containing advertising need "prior express written consent" (a)(2), meaning a written agreement that names the phone number (f)(9).
- **Revocation** (a)(10): a person may revoke "by using any reasonable method". Replying "stop", "quit", "end", "revoke", "opt out", "cancel" or "unsubscribe" is reasonable per se. The sender must honour it "within a reasonable time not to exceed ten business days".
- One confirmation text after an opt-out is allowed if it only confirms the request and is sent within five minutes (a)(12).
- Telephone solicitations may not be made "before the hour of 8 a.m. or after 9 p.m." recipient local time (c)(1).

Whether Cadence's sending counts as autodialed under the statute was not researched. It does not change the outcome: the carriers' 10DLC registration demands a verifiable opt-in and an opt-out in every message regardless. The CTIA Messaging Principles, the carriers' own rulebook, could not be read (PDF tooling missing) and is not cited here.

### What the providers do for you

- **Twilio** handles STOP, UNSUBSCRIBE, END, QUIT, STOPALL, REVOKE, OPTOUT and CANCEL on long codes by default, adds the number to a block list, and later sends to it "will fail with Error Code 21610". START or UNSTOP reverses it. Advanced Opt-Out allows custom keywords and replies per language and country ([Twilio Advanced Opt-Out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out)). The page does not cover alphanumeric senders, which cannot receive replies anyway.
- **AWS** keeps opt-out lists with a similar keyword set; the recipient "must reply to the same long code or short code" ([AWS opt-out keywords](https://docs.aws.amazon.com/sms-voice/latest/userguide/opt-out-list-keywords.html)).

The provider's block list is not the app's record. Cadence must learn about a STOP (inbound webhook, or error 21610 on the next send) and switch the user's SMS preference off, or the preferences page will show SMS as on while nothing arrives.

## Local-development stubs

- **The seam is the stub.** The map already calls for real sending behind a seam with a local stand-in. For SMS the stand-in writes the message to the console or a dev outbox table. No provider is needed to develop or test.
- **Twilio test credentials**: a second key pair that exercises the real API "without incurring charges"; Twilio "doesn't charge your account, update the state of your account, or connect to real phone numbers". Magic numbers simulate outcomes: from `+15005550006` passes; to `+15005550001` is invalid (21211), `+15005550004` is blocked (21610), `+15005550009` cannot receive SMS (21614). Limit: messages sent this way "don't trigger status callbacks" ([Twilio test credentials](https://www.twilio.com/docs/iam/test-credentials)).
- **AWS SMS simulator**: destination numbers that generate success or failure events without touching the carrier network, for example Germany success `+4917717817034`; simulator origination numbers exist only for the US ([AWS simulator numbers](https://docs.aws.amazon.com/sms-voice/latest/userguide/test-phone-numbers.html)).
- No provider offers a local emulator; the delivery-status webhook path can only be tested with a fake POST or a tunnel.

## What collecting phone numbers demands of the app

1. **A phone number field**, optional, stored in E.164 format, with a country. The users table has none today.
2. **Ownership verification** before any notification is sent to the number: a code by SMS, entered in the app. The number has a verified-at timestamp; changing the number resets it.
3. **Explicit, separate SMS consent**: an unticked checkbox or toggle with wording that names Cadence, says what will be sent and roughly how often, that carrier charges may apply, and how to stop. Not bundled into sign-up terms.
4. **A consent record**: when, the exact wording version shown, and the number it covers. GDPR requires the app to be able to demonstrate consent; the US campaign registration requires describing this flow, with a screenshot or URL the reviewer can see.
5. **Opt-out from two directions**, kept in sync: the preferences page (the only route for a German alphanumeric sender) and a STOP reply (US numbers). Withdrawal must be as easy as opting in and take effect at once.
6. **Opt-out wording in the messages**: the sender's name in every SMS; for the US, an opt-out instruction ("Reply STOP to unsubscribe"); for Germany, a way to stop (a short link to preferences).
7. **Privacy policy text**: why the number is held, that Twilio processes it, and that it is not shared for marketing. Deleting the account, or removing the number, must delete it.
8. **Abuse limits**: rate-limit code sending, restrict destination countries, and cap SMS per user per day so a busy comment thread cannot run up a bill.
9. **A public webhook route** for delivery status and inbound STOP, with Twilio signature validation.
10. **Send-time rules**: daytime-only sending in the recipient's time zone. Holding a message until morning needs a scheduler, which Cadence does not have; the simpler rule is to skip SMS outside daytime and let in-app and email carry the notification.

## Consequences for other decisions on the map

- **Cost per notification** is about EUR 0.10 in Germany and $0.012 in the US, per segment. SMS should be off by default, limited to the few triggers a user would want on their phone, and kept under 160 GSM characters.
- **Batching matters more for SMS than any other channel**: ten replies must not become ten paid messages.
- **Preferences must model SMS as a consent, not just a toggle**: it carries a verified number, a consent timestamp, and can be switched off from outside the app by a STOP reply.
- **US sending is blocked on a legal entity.** Without a business tax ID there is no 10DLC registration from Germany. A Germany-first (or EU-first) SMS phase with an alphanumeric sender needs no registration at all.
- **Failure handling**: error 21610 (opted out) and 21614 (not a mobile number) should switch SMS off for that user rather than retry.

## Not verified

- Vonage pricing (page returned 403).
- Germany prices for Sinch, Bird and AWS (not on the pages read).
- Twilio's $15 campaign vetting fee and monthly campaign fees (read from a search summary, not the page).
- Twilio Verify's Germany rate, code lifetime and attempt limits.
- Which German business identifier Twilio accepts for a 10DLC brand.
- Toll-free verification cost and turnaround.
- The ePrivacy Directive and GDPR texts on EUR-Lex, and 47 CFR 64.1200 on ecfr.gov (mirrors or the German implementing statute were read instead).
- The CTIA Messaging Principles.
