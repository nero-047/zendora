#!/bin/bash
set -euo pipefail

SWAP_FILE="/swapfile"
SWAP_SIZE="2G"

if swapon --show=NAME | grep -q "^${SWAP_FILE}$"; then
  exit 0
fi

if [ ! -f "${SWAP_FILE}" ]; then
  if command -v fallocate >/dev/null 2>&1; then
    fallocate -l "${SWAP_SIZE}" "${SWAP_FILE}" || dd if=/dev/zero of="${SWAP_FILE}" bs=128M count=16
  else
    dd if=/dev/zero of="${SWAP_FILE}" bs=128M count=16
  fi

  chmod 600 "${SWAP_FILE}"
  mkswap "${SWAP_FILE}"
fi

swapon "${SWAP_FILE}"

if ! grep -q "^${SWAP_FILE} " /etc/fstab; then
  echo "${SWAP_FILE} none swap sw 0 0" >> /etc/fstab
fi
