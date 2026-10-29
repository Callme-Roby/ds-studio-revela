#!/bin/sh
# Double-clic (macOS) : installe si besoin, compile, démarre DS-Studio et ouvre le navigateur.
set -eu
cd "$(dirname "$0")"
. ./launcher/find-node.sh
if ! find_node; then
  echo "Node.js 22.12+ est nécessaire : https://nodejs.org/en/download" >&2
  open launcher/INSTALLATION.html 2>/dev/null || true
  exit 1
fi
PATH="$(dirname "$DS_NODE"):$PATH"
export PATH
exec "$DS_NODE" scripts/start-direct.mjs
