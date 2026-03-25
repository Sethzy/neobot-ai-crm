#!/usr/bin/env bash
set -euo pipefail

npm run build
OUTPUT_DIR="${OUTPUT_DIR:-/tmp}"
cp dist/index.html "$OUTPUT_DIR/output.html"
echo "Built single-file HTML at $OUTPUT_DIR/output.html"
