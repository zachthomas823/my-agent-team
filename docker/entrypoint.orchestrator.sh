#!/bin/sh
# Ensures /data is writable by all users (agents run as non-root 'agent' user).
set -e

chmod -R 777 /data 2>/dev/null || true

exec "$@"
