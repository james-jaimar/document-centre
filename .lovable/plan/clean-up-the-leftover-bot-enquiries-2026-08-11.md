# Clean up the leftover bot enquiries

## Where things stand

Cloudflare now blocks the high-risk countries and applies a managed challenge to anything outside ZA, GB, US, AU, NZ, IE and CA. That stops the traffic at the edge, including plain page browsing, which no app-side rule could reach. The contact form still has its honeypot, timing trap and Turnstile behind that.

No further app-side blocking is planned. If spam ever gets through again, the fallback is an IP blocklist table plus a silent drop in the contact function.

## The one remaining task

Fourteen bot submissions from 5-6 August are still listed as "new" in the contact inbox. They came from Tor exit nodes (185.220.101.x, 185.220.100.x, 171.25.193.x, 109.70.100.x, 45.84.107.x, 179.60.149.x, 193.189.100.x, 185.181.61.x, 80.67.172.x).

Change their status to "spam" so the inbox only shows genuine enquiries. Nothing is deleted — the rows stay for reference and can be filtered back into view.

## Technical note

A single data update on `contact_submissions`, matching those rows by IP address and a created-at window of 4-7 August, setting `status` to `spam`. No schema change, no code change, no emails triggered.
