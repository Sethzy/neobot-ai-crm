#!/usr/bin/env bash
set -euo pipefail

npm run build
cp dist/index.html /tmp/output.html
echo "Built single-file HTML at /tmp/output.html"
