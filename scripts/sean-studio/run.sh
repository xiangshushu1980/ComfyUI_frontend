#!/usr/bin/env bash
# Owner: Sean. Independent application only; never launches ComfyUI or PiWeb.
set -euo pipefail
studio_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$studio_root"
case "${1:-start}" in
  start) exec node server/index.mjs ;;
  dev) export PATH="$studio_root/.tools/node-v25.9.0-linux-x64/bin:$PATH"; export SEAN_STUDIO=1; exec pnpm exec vite --host 127.0.0.1 --port 5318 --strictPort ;;
  build) export PATH="$studio_root/.tools/node-v25.9.0-linux-x64/bin:$PATH"; export SEAN_STUDIO=1; pnpm typecheck; exec pnpm exec vite build --config vite.config.mts ;;
  test) exec node --test server/*.test.mjs pi/*.test.mjs ;;
  *) echo 'Usage: run.sh start|dev|build|test' >&2;exit 2 ;;
esac
