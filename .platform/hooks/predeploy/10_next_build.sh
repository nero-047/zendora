#!/bin/bash
set -euo pipefail

cd /var/app/staging

BUILD_HEAP_MB="${ZENDORA_NEXT_BUILD_HEAP_MB:-1536}"
BUILD_NODE_OPTIONS="${NODE_OPTIONS:-}"

if [[ "${BUILD_NODE_OPTIONS}" != *"--max-old-space-size"* ]]; then
  BUILD_NODE_OPTIONS="${BUILD_NODE_OPTIONS:+${BUILD_NODE_OPTIONS} }--max-old-space-size=${BUILD_HEAP_MB}"
fi

echo "Running Next.js production build in /var/app/staging"
echo "Using NODE_OPTIONS=${BUILD_NODE_OPTIONS}"

/bin/su webapp -s /bin/bash -c "cd /var/app/staging && env NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS='${BUILD_NODE_OPTIONS}' npm run build"
