#!/bin/bash
# Verify nginx serves all expected security headers.
# Run against a running container or a deployed domain:
#   ./verify-security-headers.sh https://www.web2wireframe.design
#   ./verify-security-headers.sh http://localhost:8080
#
# Exits 0 when every required header is present; 1 otherwise.

set -u

TARGET="${1:-http://localhost:8080}"
FAIL=0

echo "Probing $TARGET"
echo "---"

HEADERS=$(curl -sI "$TARGET" 2>&1)
if [ -z "$HEADERS" ]; then
  echo "✗ No response from $TARGET"
  exit 1
fi

check() {
  local name="$1"
  local pattern="$2"
  if echo "$HEADERS" | grep -iq "$pattern"; then
    echo "✓ $name"
  else
    echo "✗ $name missing or mismatched"
    FAIL=$((FAIL + 1))
  fi
}

check "Strict-Transport-Security (HSTS)"      "^Strict-Transport-Security:.*max-age=31536000"
check "Content-Security-Policy"               "^Content-Security-Policy:.*default-src"
check "X-Frame-Options"                       "^X-Frame-Options:.*SAMEORIGIN"
check "X-Content-Type-Options"                "^X-Content-Type-Options:.*nosniff"
check "Referrer-Policy"                       "^Referrer-Policy:.*strict-origin"
check "Permissions-Policy"                    "^Permissions-Policy:.*camera="

# CSP frame-ancestors deserves a dedicated check — it's the modern
# successor to X-Frame-Options and supersedes it on modern browsers.
if echo "$HEADERS" | grep -iq "frame-ancestors 'none'"; then
  echo "✓ CSP frame-ancestors 'none'"
else
  echo "✗ CSP missing frame-ancestors 'none'"
  FAIL=$((FAIL + 1))
fi

echo "---"
if [ "$FAIL" -eq 0 ]; then
  echo "All security headers present."
  exit 0
fi
echo "$FAIL header(s) failed."
exit 1
