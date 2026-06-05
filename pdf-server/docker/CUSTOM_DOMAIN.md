# Custom Domain: `api.document-centre.com` → Cloud Run `pdf-api`

> **Why this is more complex than the usual Cloud Run domain mapping:** the
> `gcloud beta run domain-mappings` flow is **not available in `africa-south1`**.
> We instead front the service with a **Global External Application Load
> Balancer** backed by a **Serverless NEG**. The LB is global (anycast IP,
> TLS terminated at the nearest Google edge), the NEG targets `pdf-api` in
> `africa-south1`.

## Architecture

```text
DNS  api.document-centre.com  A    <reserved global anycast IPv4>
                              AAAA <reserved global anycast IPv6>
        │
        ▼
Global Forwarding Rule :443  ──► Target HTTPS Proxy ──► URL Map
                                       │                    │
                                       ▼                    ▼
                              Google-managed SSL    Backend Service
                              cert (DNS-validated)        │
                                                          ▼
                                              Serverless NEG (africa-south1)
                                                          │
                                                          ▼
                                              Cloud Run: pdf-api

Global Forwarding Rule :80  ──► Target HTTP Proxy ──► URL Map (301 → https://)
```

## Prereqs

- `pdf-api` deployed in **`africa-south1`** (`gcloud run services list --region=africa-south1`).
- You can edit DNS for `document-centre.com` at your registrar.
- Domain ownership verified in Google Search Console for `document-centre.com`
  (one-time; the SSL cert won't validate without it for new domains, though
  for a subdomain on an already-verified parent this is normally a no-op).

## One-shot bootstrap (recommended)

Run the idempotent bootstrap in Cloud Shell:

```bash
bash pdf-server/docker/gcp-lb-bootstrap.sh
```

This creates the global IPv4/IPv6, serverless NEG, backend service, URL maps,
managed SSL cert, HTTPS proxy + forwarding rule, and the HTTP→HTTPS redirect
forwarding rule. It prints the reserved IP addresses at the end.

Then **steps 2, 7, 8, 9, 10 below are still manual** (DNS, wait for cert,
smoke test, secret flip, ingress lockdown).

## Step-by-step (what the script does, plus the manual bits)

### 1. Reserve global static IPs

```bash
gcloud compute addresses create pdf-api-lb-ip    --global --ip-version=IPV4
gcloud compute addresses create pdf-api-lb-ip-v6 --global --ip-version=IPV6
gcloud compute addresses describe pdf-api-lb-ip    --global --format='value(address)'
gcloud compute addresses describe pdf-api-lb-ip-v6 --global --format='value(address)'
```

### 2. Add DNS at the registrar  ← **MANUAL**

```
Type   Name   Value                          TTL
A      api    <IPv4 from step 1>             300
AAAA   api    <IPv6 from step 1>             300
```

Global LB requires A/AAAA. **Do not use CNAME** on `api`.

### 3. Create the serverless NEG

```bash
gcloud compute network-endpoint-groups create pdf-api-neg-afso1 \
  --region=africa-south1 \
  --network-endpoint-type=serverless \
  --cloud-run-service=pdf-api
```

### 4. Create the backend service and attach the NEG

```bash
gcloud compute backend-services create pdf-api-backend \
  --global --load-balancing-scheme=EXTERNAL_MANAGED \
  --protocol=HTTPS

gcloud compute backend-services add-backend pdf-api-backend \
  --global \
  --network-endpoint-group=pdf-api-neg-afso1 \
  --network-endpoint-group-region=africa-south1
```

(Serverless NEGs don't take health checks — that's expected.)

### 5. Create the Google-managed SSL cert

```bash
gcloud compute ssl-certificates create pdf-api-cert \
  --global \
  --domains=api.document-centre.com
```

Status will sit at `PROVISIONING` until DNS resolves to the LB IP **and** the
forwarding rule (step 6) is live.

### 6. URL map → HTTPS proxy → forwarding rule (443)

```bash
gcloud compute url-maps create pdf-api-urlmap \
  --default-service=pdf-api-backend

gcloud compute target-https-proxies create pdf-api-https-proxy \
  --url-map=pdf-api-urlmap \
  --ssl-certificates=pdf-api-cert

gcloud compute forwarding-rules create pdf-api-fr-https \
  --global --load-balancing-scheme=EXTERNAL_MANAGED \
  --network-tier=PREMIUM \
  --address=pdf-api-lb-ip \
  --target-https-proxy=pdf-api-https-proxy \
  --ports=443
```

### 6b. HTTP → HTTPS redirect (port 80)

```bash
cat > /tmp/redirect.yaml <<'YAML'
kind: compute#urlMap
name: pdf-api-redirect-urlmap
defaultUrlRedirect:
  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
  httpsRedirect: true
  stripQuery: false
YAML

gcloud compute url-maps import pdf-api-redirect-urlmap \
  --source=/tmp/redirect.yaml --global

gcloud compute target-http-proxies create pdf-api-http-proxy \
  --url-map=pdf-api-redirect-urlmap

gcloud compute forwarding-rules create pdf-api-fr-http \
  --global --load-balancing-scheme=EXTERNAL_MANAGED \
  --network-tier=PREMIUM \
  --address=pdf-api-lb-ip \
  --target-http-proxy=pdf-api-http-proxy \
  --ports=80
```

### 7. Wait for the cert to go ACTIVE  ← **MANUAL** (wait)

```bash
gcloud compute ssl-certificates describe pdf-api-cert --global \
  --format='value(managed.status,managed.domainStatus)'
# Wants: ACTIVE  api.document-centre.com=ACTIVE
```

Usually 15–60 min once DNS has propagated. If it sits in `PROVISIONING` >2h,
re-check `dig api.document-centre.com` returns the LB IPv4.

### 8. Smoke test  ← **MANUAL**

```bash
curl -fsS https://api.document-centre.com/health
# → {"status":"ok","service":"PrintForge Document Engine","env":"production"}

curl -sI http://api.document-centre.com/health
# → HTTP/1.1 301 ... Location: https://api.document-centre.com/health
```

### 9. Flip the Supabase secret  ← **MANUAL**

Update `DOCUMENT_CENTRE_API_URL` from the raw `*.run.app` URL to:

```
https://api.document-centre.com
```

via Supabase Studio → Edge Functions → Secrets, or the Lovable secrets tool.

Then re-test the proxy:

```jsonc
// POST /functions/v1/pdf-api
{ "path": "health", "method": "GET" }
// expect: 200 (or 405 if you left method=POST — both prove the new URL works).
```

### 10. Lock down Cloud Run ingress  ← **MANUAL**, do this LAST

Only after step 8 passes:

```bash
gcloud run services update pdf-api \
  --region=africa-south1 \
  --ingress=internal-and-cloud-load-balancing
```

After this the raw `*.run.app` URL returns 403 from the public internet, and
all traffic must come via the LB.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Cert stuck `PROVISIONING` >2h | DNS not propagated, or A record points elsewhere | `dig api.document-centre.com` — must match `pdf-api-lb-ip` |
| Cert `FAILED_NOT_VISIBLE` | DNS doesn't resolve at Google's resolvers | Recheck registrar; remove conflicting records |
| `404` from `https://api…/health` | Backend service has no NEG attached, or NEG is in wrong region | Re-run `add-backend` with `--network-endpoint-group-region=africa-south1` |
| `SSL_ERROR_NO_CYPHER_OVERLAP` in browser | Cert still provisioning | Wait — clears once cert is ACTIVE |
| 502/503 after step 10 | LB IP not in Cloud Run's allowlist (it always is — this means the ingress flag is wrong) | `gcloud run services describe pdf-api --region=africa-south1 --format='value(metadata.annotations."run.googleapis.com/ingress")'` should be `internal-and-cloud-load-balancing` |
| Supabase proxy still 502 after secret flip | Old function instance cached the env | Re-deploy the `pdf-api` edge function (any redeploy refreshes secrets) |

## Cost (rough)

- Global forwarding rules (×2: 443 + 80): ~$36/mo combined.
  *(Tip: you can drop the :80 rule later if you don't care about plain-HTTP redirect.)*
- Data processing through the LB: ~$0.008–0.012/GB.
- Managed SSL cert: free.
- Reserved static IPs (while attached): free.

All-in: **~$25–40/mo** depending on traffic.

## Rollback

```bash
# Re-open Cloud Run ingress
gcloud run services update pdf-api --region=africa-south1 --ingress=all

# Flip DOCUMENT_CENTRE_API_URL back to the *.run.app URL

# (Optional) Tear down the LB if you want to abandon the domain
gcloud compute forwarding-rules delete pdf-api-fr-https pdf-api-fr-http --global
gcloud compute target-https-proxies delete pdf-api-https-proxy
gcloud compute target-http-proxies  delete pdf-api-http-proxy
gcloud compute url-maps delete pdf-api-urlmap pdf-api-redirect-urlmap
gcloud compute ssl-certificates delete pdf-api-cert --global
gcloud compute backend-services delete pdf-api-backend --global
gcloud compute network-endpoint-groups delete pdf-api-neg-afso1 --region=africa-south1
gcloud compute addresses delete pdf-api-lb-ip pdf-api-lb-ip-v6 --global
```

## Deferred

**Cloud Armor** — not provisioned in this pass. When you want it:

```bash
gcloud compute security-policies create pdf-api-armor \
  --description="Edge protection for pdf-api"
# add rules (e.g. rate limit 600 req/min/IP) ...
gcloud compute backend-services update pdf-api-backend \
  --global --security-policy=pdf-api-armor
```
