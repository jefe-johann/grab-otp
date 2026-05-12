#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SAFARI_DIST="$ROOT_DIR/dist/safari"
SAFARI_RESOURCES="$ROOT_DIR/safari/Grab OTP/Grab OTP Extension/Resources"

if [ ! -d "$SAFARI_DIST" ]; then
  echo "Missing dist/safari. Run npm run build:safari first." >&2
  exit 1
fi

if [ ! -d "$SAFARI_RESOURCES" ]; then
  echo "Missing Safari Xcode resources directory: $SAFARI_RESOURCES" >&2
  exit 1
fi

ditto "$SAFARI_DIST" "$SAFARI_RESOURCES"
echo "Synced Safari web extension resources."
