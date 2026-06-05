#!/usr/bin/env bash
# gcp-lb-bootstrap.sh — Global External Application Load Balancer in front of
# the `pdf-api` Cloud Run service (africa-south1), with HTTP→HTTPS redirect.
#
# Idempotent: re-runs skip resources that already exist. Safe to invoke after
# partial failures.
#
# Run in Cloud Shell (https://shell.cloud.google.com) with the right project
# selected:
#
#   bash pdf-server/docker/gcp-lb-bootstrap.sh
#
# Manual steps NOT covered (see CUSTOM_DOMAIN.md):
#   - Adding the A/AAAA DNS records at the registrar
#   - Waiting for the managed SSL cert to reach ACTIVE
#   - Smoke testing https://api.document-centre.com/health
#   - Flipping the DOCUMENT_CENTRE_API_URL secret in Supabase
#   - Locking Cloud Run ingress to internal-and-cloud-load-balancing

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────
PROJECT_ID="${PROJECT_ID:-project-59a14b18-b4df-4c6b-b09}"
REGION="${REGION:-africa-south1}"
RUN_SERVICE="${RUN_SERVICE:-pdf-api}"
DOMAIN="${DOMAIN:-api.document-centre.com}"

IP_V4="pdf-api-lb-ip"
IP_V6="pdf-api-lb-ip-v6"
NEG="pdf-api-neg-afso1"
BACKEND="pdf-api-backend"
URLMAP="pdf-api-urlmap"
CERT="pdf-api-cert"
HTTPS_PROXY="pdf-api-https-proxy"
FR_HTTPS="pdf-api-fr-https"
REDIRECT_URLMAP="pdf-api-redirect-urlmap"
HTTP_PROXY="pdf-api-http-proxy"
FR_HTTP="pdf-api-fr-http"
# ─────────────────────────────────────────────────────────────────────────

say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
skip() { printf '  \033[2m(already exists — skipping)\033[0m\n'; }

gcloud config set project "$PROJECT_ID" >/dev/null

exists_global() {
  # $1=resource_type $2=name → 0 if exists
  gcloud compute "$1" describe "$2" --global >/dev/null 2>&1
}
exists_regional() {
  # $1=resource_type $2=name $3=region → 0 if exists
  gcloud compute "$1" describe "$2" --region="$3" >/dev/null 2>&1
}

say "1/8 Reserving global static IPs"
if exists_global addresses "$IP_V4"; then skip; else
  gcloud compute addresses create "$IP_V4" --global --ip-version=IPV4
fi
if exists_global addresses "$IP_V6"; then skip; else
  gcloud compute addresses create "$IP_V6" --global --ip-version=IPV6
fi

IPV4_ADDR="$(gcloud compute addresses describe "$IP_V4" --global --format='value(address)')"
IPV6_ADDR="$(gcloud compute addresses describe "$IP_V6" --global --format='value(address)')"

say "2/8 Creating serverless NEG → ${RUN_SERVICE} (${REGION})"
if exists_regional network-endpoint-groups "$NEG" "$REGION"; then skip; else
  gcloud compute network-endpoint-groups create "$NEG" \
    --region="$REGION" \
    --network-endpoint-type=serverless \
    --cloud-run-service="$RUN_SERVICE"
fi

say "3/8 Creating backend service + attaching NEG"
if exists_global backend-services "$BACKEND"; then skip; else
  gcloud compute backend-services create "$BACKEND" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --protocol=HTTPS
fi
# add-backend is idempotent-ish: it errors if already attached. Tolerate it.
gcloud compute backend-services add-backend "$BACKEND" \
  --global \
  --network-endpoint-group="$NEG" \
  --network-endpoint-group-region="$REGION" 2>/dev/null || echo "  (NEG already attached — skipping)"

say "4/8 Creating Google-managed SSL cert for ${DOMAIN}"
if exists_global ssl-certificates "$CERT"; then skip; else
  gcloud compute ssl-certificates create "$CERT" \
    --global \
    --domains="$DOMAIN"
fi

say "5/8 URL map + HTTPS proxy + forwarding rule (:443)"
if exists_global url-maps "$URLMAP"; then skip; else
  gcloud compute url-maps create "$URLMAP" --default-service="$BACKEND"
fi
if exists_global target-https-proxies "$HTTPS_PROXY"; then skip; else
  gcloud compute target-https-proxies create "$HTTPS_PROXY" \
    --url-map="$URLMAP" \
    --ssl-certificates="$CERT"
fi
if exists_global forwarding-rules "$FR_HTTPS"; then skip; else
  gcloud compute forwarding-rules create "$FR_HTTPS" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --network-tier=PREMIUM \
    --address="$IP_V4" \
    --target-https-proxy="$HTTPS_PROXY" \
    --ports=443
fi

say "6/8 HTTP→HTTPS redirect URL map (:80)"
if exists_global url-maps "$REDIRECT_URLMAP"; then skip; else
  TMP_YAML="$(mktemp --suffix=.yaml)"
  cat > "$TMP_YAML" <<YAML
kind: compute#urlMap
name: ${REDIRECT_URLMAP}
defaultUrlRedirect:
  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
  httpsRedirect: true
  stripQuery: false
YAML
  gcloud compute url-maps import "$REDIRECT_URLMAP" \
    --source="$TMP_YAML" --global --quiet
  rm -f "$TMP_YAML"
fi
if exists_global target-http-proxies "$HTTP_PROXY"; then skip; else
  gcloud compute target-http-proxies create "$HTTP_PROXY" \
    --url-map="$REDIRECT_URLMAP"
fi
if exists_global forwarding-rules "$FR_HTTP"; then skip; else
  gcloud compute forwarding-rules create "$FR_HTTP" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --network-tier=PREMIUM \
    --address="$IP_V4" \
    --target-http-proxy="$HTTP_PROXY" \
    --ports=80
fi

say "7/8 Current SSL cert status"
gcloud compute ssl-certificates describe "$CERT" --global \
  --format='value(managed.status,managed.domainStatus)' || true

say "8/8 Done."

cat <<EOF

╭─────────────────────────────────────────────────────────────╮
│  LB bootstrap complete.                                     │
├─────────────────────────────────────────────────────────────┤
│  Domain        : ${DOMAIN}
│  IPv4 (A)      : ${IPV4_ADDR}
│  IPv6 (AAAA)   : ${IPV6_ADDR}
│  Cloud Run     : ${RUN_SERVICE} (${REGION})
╰─────────────────────────────────────────────────────────────╯

Next, do these MANUALLY (see pdf-server/docker/CUSTOM_DOMAIN.md):

  1. Add DNS at registrar:
       A     api    ${IPV4_ADDR}
       AAAA  api    ${IPV6_ADDR}
     (No CNAME on 'api'.)

  2. Wait for the managed cert to go ACTIVE (15–60 min after DNS resolves):
       gcloud compute ssl-certificates describe ${CERT} --global \\
         --format='value(managed.status,managed.domainStatus)'

  3. Smoke test:
       curl -fsS https://${DOMAIN}/health
       curl -sI  http://${DOMAIN}/health   # expect 301 → https

  4. Flip the Supabase secret DOCUMENT_CENTRE_API_URL to:
       https://${DOMAIN}

  5. Lock Cloud Run ingress (only AFTER step 3 passes):
       gcloud run services update ${RUN_SERVICE} \\
         --region=${REGION} \\
         --ingress=internal-and-cloud-load-balancing

EOF
