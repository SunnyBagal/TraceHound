#!/usr/bin/env bash
# Clone the demo repo into fixtures/demo-repo, pinned to a fixed commit. Idempotent.
set -euo pipefail

REPO_URL="https://github.com/SunnyBagal/cex-v2-boilercode.git"
PINNED_SHA="da0e3d640a9c02f815fcca48f8328c94558cc058"
DEST="$(cd "$(dirname "$0")/.." && pwd)/fixtures/demo-repo"

if [[ -d "$DEST/.git" ]]; then
  # older clones point at the upstream repo; the demo target is the fork (same pinned commit)
  if [[ "$(git -C "$DEST" remote get-url origin)" != "$REPO_URL" ]]; then
    git -C "$DEST" remote set-url origin "$REPO_URL"
    echo "demo repo origin -> $REPO_URL"
  fi
  current="$(git -C "$DEST" rev-parse HEAD)"
  if [[ "$current" == "$PINNED_SHA" ]]; then
    echo "demo repo already at $PINNED_SHA"
    exit 0
  fi
  git -C "$DEST" fetch --quiet origin "$PINNED_SHA"
else
  mkdir -p "$(dirname "$DEST")"
  git clone --quiet --filter=blob:none --no-checkout "$REPO_URL" "$DEST"
fi

git -C "$DEST" -c advice.detachedHead=false checkout --quiet "$PINNED_SHA"
echo "demo repo checked out at $(git -C "$DEST" rev-parse --short HEAD) -> $DEST"
