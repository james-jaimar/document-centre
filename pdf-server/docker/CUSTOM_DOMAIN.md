# Custom Domain: `api.document-centre.com` → Cloud Run `pdf-api`

One-pager for pointing the production API at a friendly domain instead of the
raw `*.run.app` URL. Do this once; nothing else in the codebase changes.

## Prereqs

- Cloud Run service `pdf-api` already deployed in region **`africa-south1`**
  (Johannesburg). Confirm:
  ```bash
  gcloud run services list --region=africa-south1
  ```
- You can edit DNS records for `document-centre.com` at your registrar.
- Domain ownership verified in Google Search Console for `document-centre.com`
  (one-time; Cloud Run will prompt for the TXT record if not).

## Steps

### 1. Add a domain mapping in Cloud Run

GCP Console → **Cloud Run** → **Manage Custom Domains** → **Add Mapping**
- Service: `pdf-api`
- Region: `africa-south1`
- Domain: `api.document-centre.com`

GCP shows you a CNAME target (typically `ghs.googlehosted.com.`). Copy it.

CLI equivalent:
```bash
gcloud beta run domain-mappings create \
  --service=pdf-api \
  --domain=api.document-centre.com \
  --region=africa-south1
```

### 2. Add the CNAME at your DNS host

```
Type    Name    Value                       TTL
CNAME   api     ghs.googlehosted.com.       300
```

If the registrar refuses to set CNAME on `api` because there's a conflicting
A/AAAA record there, delete the conflicting record first.

### 3. Wait for SSL provisioning

Status in **Cloud Run → Manage Custom Domains** moves
`Pending DNS` → `Provisioning certificate` → `Active`. Usually 5–15 min once
DNS has propagated.

Check:
```bash
dig +short api.document-centre.com
# should return ghs.googlehosted.com followed by Google IPs
```

### 4. Smoke-test

```bash
curl -fsS https://api.document-centre.com/health
# → {"status":"ok","service":"PrintForge Document Engine","env":"production"}
```

### 5. Flip the Supabase secret

The Edge Function proxy `pdf-api` reads `DOCUMENT_CENTRE_API_URL`. Update it
from the raw `https://pdf-api-…run.app` URL to:

```
https://api.document-centre.com
```

via Supabase Studio → Project Settings → Edge Functions → Secrets, or via the
Lovable secrets tool.

### 6. Re-verify the proxy

In Supabase Studio (Edge Functions → `pdf-api` → Test) or via the existing
test:
```jsonc
// POST /functions/v1/pdf-api
{ "path": "health", "method": "GET" }
// expect: 405 from upstream (it's a GET endpoint and the proxy still POSTs by default)
//         OR 200 if you forwarded method=GET in the body — both prove the new URL works.
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Cert stuck on `Pending DNS` >30 min | CNAME not propagated or wrong target | `dig` the record; correct value at registrar |
| `404` from `api.document-centre.com` | Domain mapped in wrong region | Re-create mapping in `africa-south1` |
| `SSL_ERROR_NO_CYPHER_OVERLAP` in browser | Cert still provisioning | Wait — usually clears within 15 min of DNS propagation |
| Supabase proxy still 502s | Secret still points at old URL | Update `DOCUMENT_CENTRE_API_URL`, re-run the smoke test |
| Domain verification required | Search Console TXT not present | Add the `google-site-verification` TXT record at the root of `document-centre.com` |

## Rollback

The mapping can be removed without affecting the service:
```bash
gcloud beta run domain-mappings delete \
  --domain=api.document-centre.com \
  --region=africa-south1
```
Then flip `DOCUMENT_CENTRE_API_URL` back to the `*.run.app` URL.
