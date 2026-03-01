#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"

if ! command -v node >/dev/null 2>&1; then
  echo "[smoke] node is required" >&2
  exit 1
fi

check_200() {
  local path="$1"
  local code
  code=$(curl -s -o /tmp/smoke-$$.out -w "%{http_code}" "${BASE_URL}${path}")
  if [[ "$code" != "200" ]]; then
    echo "[smoke] FAIL ${path} -> ${code}" >&2
    head -c 300 /tmp/smoke-$$.out >&2 || true
    echo >&2
    exit 1
  fi
  echo "[smoke] OK   ${path}"
}

encode_uri() {
  node -e 'process.stdout.write(encodeURIComponent(process.argv[1] || ""))' "$1"
}

extract_json_field() {
  local js_expr="$1"
  node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync(0,'utf8')); const v=(${js_expr}); process.stdout.write(v==null?'':String(v));"
}

echo "[smoke] BASE_URL=${BASE_URL}"

check_200 "/agents"
check_200 "/properties"
check_200 "/agencies"
check_200 "/areas"
check_200 "/hdb"
check_200 "/robots.txt"
check_200 "/sitemap/0.xml"

AGENT_JSON=$(curl -fsS "${BASE_URL}/api/agents?limit=1")
AGENT_REG=$(printf "%s" "$AGENT_JSON" | extract_json_field "j.data?.[0]?.registration_no")
if [[ -z "$AGENT_REG" ]]; then
  echo "[smoke] FAIL could not extract agent registration number" >&2
  exit 1
fi

PROP_JSON=$(curl -fsS "${BASE_URL}/api/properties")
PROP_SLUG=$(printf "%s" "$PROP_JSON" | extract_json_field "j.data?.[0]?.slug")
PROP_NAME=$(printf "%s" "$PROP_JSON" | extract_json_field "j.data?.[0]?.project")
PROP_DIST=$(printf "%s" "$PROP_JSON" | extract_json_field "j.data?.[0]?.district")
if [[ -z "$PROP_SLUG" || -z "$PROP_NAME" ]]; then
  echo "[smoke] FAIL could not extract property slug/project" >&2
  exit 1
fi

PROP_NAME_ENC=$(encode_uri "$PROP_NAME")
PROP_DIST_ENC=$(encode_uri "$PROP_DIST")

check_200 "/agents/${AGENT_REG}"
check_200 "/api/agents/${AGENT_REG}"
check_200 "/api/agents/${AGENT_REG}/transactions?limit=5&page=1"

if [[ -n "$PROP_DIST_ENC" ]]; then
  check_200 "/properties/${PROP_SLUG}?project=${PROP_NAME_ENC}&district=${PROP_DIST_ENC}"
  check_200 "/api/properties/${PROP_SLUG}?project=${PROP_NAME_ENC}&district=${PROP_DIST_ENC}"
  check_200 "/api/properties/${PROP_SLUG}/transactions?project=${PROP_NAME_ENC}&district=${PROP_DIST_ENC}&limit=5&page=1"
else
  check_200 "/properties/${PROP_SLUG}?project=${PROP_NAME_ENC}"
  check_200 "/api/properties/${PROP_SLUG}?project=${PROP_NAME_ENC}"
  check_200 "/api/properties/${PROP_SLUG}/transactions?project=${PROP_NAME_ENC}&limit=5&page=1"
fi

check_200 "/agencies?q=ERA"
check_200 "/areas?q=TAMPINES"
check_200 "/hdb?q=TAMPINES"

echo "[smoke] PASS all checks"
