#!/usr/bin/env bash
set -euo pipefail

cd /var/app/staging

if [[ -f .next/BUILD_ID ]]; then
  echo "Using prebuilt Next.js output from source bundle."
  exit 0
fi

npm run build
