#!/bin/bash
# devcheck.sh — Starts (and reports on) the local dev environment for the Figma plugin.
# Usage: bash scripts/devcheck.sh
#
# Wired into .claude/settings.json as a SessionStart hook, so every new Claude
# session begins with the dev services up and their status in context. Safe to
# run by hand and safe to run twice — every check is idempotent.
#
# Checks: dev-log receiver (:3999) · tree-dump receiver (:3998) · plugin watch ·
#         build freshness (build/main.js vs src/**).
#
# Set W2W_DEVCHECK=0 to skip entirely (e.g. marketing/growth sessions that have
# no use for a running watch).

[ "$W2W_DEVCHECK" = "0" ] && exit 0

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 0

PLUGIN_DIR="$REPO_ROOT/packages/figma-plugin"
BUILD_MAIN="$PLUGIN_DIR/build/main.js"
WATCH_STARTED=0

echo "W2W dev env:"

# --- 1/2. Receivers ---------------------------------------------------------
# $1 label · $2 port · $3 script path (repo-relative) · $4 log file
check_receiver() {
  local pid
  pid="$(lsof -nP -iTCP:"$2" -sTCP:LISTEN -t 2>/dev/null | head -1)"
  if [ -n "$pid" ]; then
    printf '  ✅ %-20s :%s  (running, pid %s)\n' "$1" "$2" "$pid"
  else
    nohup node "$REPO_ROOT/$3" >>"$4" 2>&1 &
    disown 2>/dev/null
    printf '  ▶️  %-20s :%s  (started → %s)\n' "$1" "$2" "$4"
  fi
}

check_receiver "dev-log receiver" 3999 \
  "packages/figma-plugin/scripts/devlog-server.mjs" /tmp/w2w-devlog.log
check_receiver "tree-dump receiver" 3998 \
  "tools/figma-tree-dump/server.mjs" /tmp/w2w-treedump.log

# --- 3. Plugin watch --------------------------------------------------------
# The bin name never appears in the process: npm run watch execs
# <plugin>/node_modules/@create-figma-plugin/build/lib/cli.js --typecheck --watch.
# Matching that absolute path also scopes the check to THIS checkout, so a watch
# running in another worktree does not count as ours.
WATCH_PID="$(pgrep -f "$PLUGIN_DIR/node_modules/.*cli\.js.*--watch" | head -1)"
if [ -n "$WATCH_PID" ]; then
  printf '  ✅ %-20s      (running, pid %s)\n' "plugin watch" "$WATCH_PID"
else
  (cd "$PLUGIN_DIR" && nohup npm run watch >>/tmp/w2w-watch.log 2>&1 &)
  WATCH_STARTED=1
  printf '  ▶️  %-20s      (started → %s)\n' "plugin watch" "/tmp/w2w-watch.log"
fi

# --- 4. Build freshness -----------------------------------------------------
if [ ! -f "$BUILD_MAIN" ]; then
  echo "  ⚠️  build missing — build/main.js does not exist yet"
elif [ -n "$(find "$PLUGIN_DIR/src" -type f \
      \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) \
      -newer "$BUILD_MAIN" -print -quit 2>/dev/null)" ]; then
  echo "  ⚠️  build stale — src is newer than build/main.js (watch will rebuild)"
else
  echo "  ✅ build fresh"
fi

# watch overwrites the production bundle (auto-memory watch-clobbers-prod-build)
[ "$WATCH_STARTED" = "1" ] &&
  echo "  ℹ️  watch overwrites the prod bundle — run 'npm run build' before publishing"

exit 0
