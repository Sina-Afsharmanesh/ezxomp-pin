#!/usr/bin/env bash
# setup-omp.sh — quick setup of the ezxomp OMP plugin set for dev/test.
#
# Two questions, in order:
#   1) Config policy:  clean (wipe installed plugins, keep config) vs
#                      backup (tar the config/state dirs, then clean)
#   2) Install mode:   local (link every plugin from the repo working tree)
#                      vs  market (install every plugin from the ezxomp
#                      marketplace — clones from origin if not registered)
#
# Flags drive the same logic non-interactively (just recipes, CI):
#   --clean | --backup      config policy
#   --local | --market      install mode
#   --remove-only           clean only, skip the install step
#   --yes                   skip confirmations (implied when non-interactive)
#   -h | --help
#
# Non-interactive: prompts are skipped and missing choices fall back to the
# first listed option — policy: backup, mode: local — with a notice, so a
# bare run is never destructive to config/state. --yes also skips the final
# confirmation; a real TTY is required for the interactive prompts.
#
# Idempotent: re-running is safe — uninstall/unlink of absent entries is a
# no-op and installs converge to the chosen mode.
#
# OMP_HOME honors an existing $OMP_HOME and defaults to $HOME/.omp so the
# whole thing is testable in an isolated HOME (HOME=$(mktemp -d) for e2e).

set -euo pipefail

# ---------- paths ----------
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
OMP_HOME_DIR="${OMP_HOME:-$HOME/.omp}"
MARKET_NAME="ezxomp"
MARKET_GIT_URL="https://tangled.org/expi.tngl.sh/ezxomp"

# ---------- state ----------
CHOSEN_POLICY=""   # clean | backup
CHOSEN_MODE=""     # local | market
REMOVE_ONLY=0
ASSUME_YES=0
[[ -t 0 && -t 1 ]] && IS_TTY=1 || IS_TTY=0

# ---------- helpers ----------
c_reset=$'\033[0m'; c_bold=$'\033[1m'; c_ok=$'\033[32m'; c_err=$'\033[31m'; c_warn=$'\033[33m'
info() { printf '%s\n' "$*"; }
ok()   { printf '%sOK: %s%s\n' "$c_ok" "$*" "$c_reset"; }
warn() { printf '%sWARN: %s%s\n' "$c_warn" "$*" "$c_reset" >&2; }
die()  { printf '%sERROR: %s%s\n' "$c_err" "$*" "$c_reset" >&2; exit 1; }

usage() {
  sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'
}

have() { command -v "$1" >/dev/null 2>&1; }

ask_yn() { # ask_yn <prompt> <default y|n> -> 0 for yes
  local ans
  if (( ASSUME_YES )); then return 0; fi
  if (( ! IS_TTY )); then
    warn "not interactive — using default '$2' for: $1"
    [[ "$2" == "y" ]]; return
  fi
  read -r -p "$(printf '%s' "$1 [y/N]: ")" ans || ans=""
  ans="${ans:-$2}"
  [[ "$ans" =~ ^[Yy]([Ee][Ss])?$ ]]
}

prompt_choice() { # prompt_choice <question> <key1> <desc1> <key2> <desc2> [keyN ...] -> echoes chosen key
  local q="$1"; shift
  local keys=(); descs=()
  while (( $# >= 2 )); do keys+=("$1"); descs+=("$2"); shift 2; done
  if (( ASSUME_YES )); then echo "${keys[0]}"; return; fi
  if (( ! IS_TTY )); then
    warn "not interactive — defaulting to '${keys[0]}' for: $q"
    echo "${keys[0]}"; return
  fi
  local i
  echo
  printf '%s%s%s\n' "$c_bold" "$q" "$c_reset"
  for i in "${!keys[@]}"; do
    printf '  %s) %s — %s\n' "$(( i + 1 ))" "${keys[$i]}" "${descs[$i]}"
  done
  local ans
  while true; do
    read -r -p "choose [1-${#keys[@]}]: " ans || ans=""
    if [[ "$ans" =~ ^[1-9][0-9]*$ ]] && (( ans >= 1 && ans <= ${#keys[@]} )); then
      echo "${keys[ans - 1]}"; return
    fi
    warn "invalid choice: '$ans'"
  done
}

confirm() { # confirm <what> <revert> ; returns 1 on abort
  if ask_yn "Proceed with: $1?" y; then return 0; fi
  info "Aborted (no changes made). To revert nothing: no action needed — $2"
  return 1
}

require() {
  local missing=()
  for t in "$@"; do have "$t" || missing+=("$t"); done
  if (( ${#missing[@]} )); then die "missing required tools: ${missing[*]} (need: ${*})"; fi
}

# ---------- arg parsing ----------
while (( $# )); do
  case "$1" in
    --clean)   CHOSEN_POLICY=clean ;;
    --backup)  CHOSEN_POLICY=backup ;;
    --local)   CHOSEN_MODE=local ;;
    --market)  CHOSEN_MODE=market ;;
    --remove-only) REMOVE_ONLY=1; CHOSEN_POLICY="${CHOSEN_POLICY:-clean}" ;;
    --yes|-y)  ASSUME_YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
  shift
done

# ---------- preflight ----------
require git python3 omp
[[ -f "$ROOT/.omp-plugin/marketplace.json" ]] || die "not in ezxomp repo: $ROOT/.omp-plugin/marketplace.json missing"

# Plugin list is the marketplace manifest — single source of truth.
mapfile -t PLUGINS < <(python3 - "$ROOT/.omp-plugin/marketplace.json" <<'PY'
import json, sys
for p in json.load(open(sys.argv[1]))["plugins"]:
    print(p["name"])
PY
)
(( ${#PLUGINS[@]} > 0 )) || die "marketplace.json has no plugins"

info "repo:      $ROOT"
info "omp home:  $OMP_HOME_DIR"
info "plugins:   ${PLUGINS[*]}"

# ---------- step 1: config policy ----------
if [[ -z "$CHOSEN_POLICY" ]]; then
  CHOSEN_POLICY="$(prompt_choice \
    "1) What should happen to your OMP config/state before reinstalling the plugins?" \
    backup  "backup — tar config/state (agent, agents, profiles, logs, ids) to ~/ then clean (default)" \
    clean   "clean — remove all installed ezxomp plugins, keep config/state dirs as-is" \
    )"
fi

# What "clean" touches: installed-plugin state only. Config/state dirs stay.
PLUGINS_STATE=("$OMP_HOME_DIR/plugins/cache/plugins" "$OMP_HOME_DIR/plugins/node_modules/@ezxomp" "$OMP_HOME_DIR/plugins/omp-plugins.lock.json")

# ---------- step 2: install mode ----------
if (( REMOVE_ONLY )); then
  CHOSEN_MODE=""
elif [[ -z "$CHOSEN_MODE" ]]; then
  CHOSEN_MODE="$(prompt_choice \
    "2) How should the ezxomp plugins be installed?" \
    local  "local — link every plugin from this repo's working tree (omp plugin link)" \
    market "market — install every plugin from the ezxomp marketplace (clones from origin if unregistered)" \
    )"
fi

# ---------- plan summary ----------
echo
printf '%s--- plan ---%s\n' "$c_bold" "$c_reset"
info "  config policy: $CHOSEN_POLICY"
if (( REMOVE_ONLY )); then
  info "  install mode:  none (remove-only)"
else
  info "  install mode:  $CHOSEN_MODE (${#PLUGINS[@]} plugins)"
fi
info "  removes:       ${PLUGINS_STATE[*]}  (config/state dirs untouched)"
if ! confirm "setup: $CHOSEN_POLICY + ${CHOSEN_MODE:-remove-only}" "nothing was changed"; then
  exit 1
fi

# ---------- backup ----------
if [[ "$CHOSEN_POLICY" == backup ]]; then
  ts="$(date +%Y%m%d-%H%M%S)"
  backup_dir="$HOME/ezxomp-omp-backups"
  backup_tar="$backup_dir/omp-backup-$ts.tar.gz"
  mkdir -p "$backup_dir"
  # Config/state worth keeping. Re-downloadable caches are excluded:
  # plugins/cache (marketplace/plugin copies), natives, puppeteer, run.
  backupable=()
  for d in agent agents profiles logs wt; do
    [[ -e "$OMP_HOME_DIR/$d" ]] && backupable+=("--$d")
  done
  for f in marketplaces.json install-id autoqa.db sssf-overlay.yml; do
    [[ -e "$OMP_HOME_DIR/$f" ]] && backupable+=("--$f")
  done
  if (( ${#backupable[@]} )); then
    info "backing up ${#backupable[@]} config/state entries -> $backup_tar"
    tar -czf "$backup_tar" -C "$OMP_HOME_DIR" "${backupable[@]#--}"
    ok "backup written: $backup_tar ($(du -h "$backup_tar" | cut -f1))"
  else
    warn "nothing to back up in $OMP_HOME_DIR (fresh install?)"
  fi
fi

# ---------- clean: remove installed plugins ----------
# `omp plugin uninstall <name>@ezxomp` only clears MARKETPLACE installs.
# LINKED plugins survive it (lock entry + node_modules symlink stay), so the
# sweep below also removes the symlinks and scrubs the lock by package name.
remove_installed() {
  local name
  for name in "${PLUGINS[@]}"; do
    local r
    r="$(omp plugin uninstall "${name}@${MARKET_NAME}" 2>&1)" && \
      ok "uninstalled ${name}@${MARKET_NAME}" || \
      info "  ${name}@${MARKET_NAME}: not installed ($r)"
  done
  # Stale symlinks left behind in node_modules
  local nm="$OMP_HOME_DIR/plugins/node_modules/@ezxomp"
  if [[ -d "$nm" ]]; then
    for name in "${PLUGINS[@]}"; do
      if [[ -L "$nm/$name" || -d "$nm/$name" ]]; then
        rm -rf "$nm/$name"
        ok "removed plugin entry: @ezxomp/$name"
      fi
    done
  fi
  # Scrub any remaining @ezxomp/* entries from the install lock.
  local lock="$OMP_HOME_DIR/plugins/omp-plugins.lock.json"
  if [[ -f "$lock" ]]; then
    local scrubbed
    scrubbed="$(python3 - "$lock" <<'PY'
import json, sys
lock = sys.argv[1]
try:
    data = json.load(open(lock))
except Exception:
    data = {}
plugins = data.get("plugins", {})
stale = sorted(k for k in plugins if k.startswith("@ezxomp/"))
for k in stale:
    del plugins[k]
data["plugins"] = plugins
json.dump(data, open(lock, "w"), indent=2)
print(" ".join(stale) if stale else "-")
PY
)"
    if [[ "$scrubbed" != "-" ]]; then info "scrubbed lock: $scrubbed"; fi
  fi
  # Plugin cache copies (installed plugin trees + marketplace repos)
  if [[ -d "$OMP_HOME_DIR/plugins/cache/plugins" ]]; then
    rm -rf "$OMP_HOME_DIR/plugins/cache/plugins"
    ok "removed plugin cache: $OMP_HOME_DIR/plugins/cache/plugins"
  fi
}

info
info "=== step 1/2: $CHOSEN_POLICY — removing installed ezxomp plugins ==="
remove_installed

if (( REMOVE_ONLY )); then
  info
  info "=== verify ==="
  rf=0
  rdoc="$(omp plugin doctor 2>&1)"
  if grep -qE '✘|errors: [1-9]' <<<"$rdoc"; then
    rf=1
    printf '%s\n' "$rdoc" | grep -E '✘|errors: [1-9]' | sed 's/^/  /'
  else
    ok "omp plugin doctor: no errors"
  fi
  left="$(ls "$OMP_HOME_DIR/plugins/node_modules/@ezxomp" 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "$left" == 0 ]]; then
    ok "no @ezxomp plugins installed"
  else
    rf=1
    warn "$left @ezxomp plugin entries remain in node_modules"
  fi
  if (( rf )); then
    printf '%sVERIFY FAILED%s\n' "$c_err" "$c_reset"
    exit 1
  fi
  ok "clean complete"
  info
  info "done. Start a FRESH omp session to pick up the new plugin set."
  exit 0
fi

# ---------- install ----------
if [[ "$CHOSEN_MODE" == local ]]; then
  info
  info "=== step 2/2: local — linking plugins from $ROOT ==="
  local_failed=0
  for name in "${PLUGINS[@]}"; do
    src="$ROOT/plugins/$name"
    [[ -f "$src/package.json" ]] || { warn "missing $src — skipping $name"; local_failed=1; continue; }
    if omp plugin link "$src" --scope user >/dev/null 2>&1; then
      ok "linked $name -> $src"
    else
      warn "link failed for $name"
      local_failed=1
    fi
  done
  if (( local_failed )); then die "some local links failed — run 'omp plugin doctor' to inspect"; fi
else
  info
  info "=== step 2/2: market — installing from the ${MARKET_NAME} marketplace ==="
  # Ensure the marketplace is registered (git source; clones if absent).
  if ! omp plugin marketplace list 2>/dev/null | grep -q "^  ${MARKET_NAME} "; then
    info "registering marketplace: $MARKET_GIT_URL"
    omp plugin marketplace add "$MARKET_GIT_URL" >/dev/null || die "failed to register marketplace $MARKET_NAME"
    ok "marketplace registered"
  else
    ok "marketplace already registered"
  fi
  for name in "${PLUGINS[@]}"; do
    if omp plugin install "${name}@${MARKET_NAME}" --force >/dev/null 2>&1; then
      ok "installed ${name}@${MARKET_NAME}"
    else
      # Already at that version? try without --force, then report.
      if omp plugin install "${name}@${MARKET_NAME}" >/dev/null 2>&1; then
        ok "installed ${name}@${MARKET_NAME}"
      else
        warn "install failed for ${name}@${MARKET_NAME}"
      fi
    fi
  done
fi

# ---------- verify end state ----------
info
info "=== verify ==="
fail=0

doc="$(omp plugin doctor 2>&1)"
if grep -qE '✘|errors: [1-9]' <<<"$doc"; then
  fail=1
  printf '%s\n' "$doc" | grep -E '✘|errors: [1-9]' | sed 's/^/  /'
else
  ok "omp plugin doctor: no errors"
fi

# Classify every plugin: MKT (cache copy) or LOCAL (repo link).
classify() { # classify <name> -> echoes MKT | LOCAL | OTHER | MISSING
  local t
  t="$(readlink -f "$OMP_HOME_DIR/plugins/node_modules/@ezxomp/$1" 2>/dev/null)" || { echo MISSING; return; }
  if [[ "$t" == *"/cache/plugins/ezxomp_"* ]]; then echo MKT
  elif [[ "$t" == *"$ROOT"* ]]; then echo LOCAL
  else echo OTHER; fi
}

bad=()
for name in "${PLUGINS[@]}"; do
  src="$(classify "$name")"
  if [[ "$CHOSEN_MODE" == market ]]; then want=MKT; else want=LOCAL; fi
  if [[ "$src" != "$want" ]]; then
    fail=1
    bad+=("$name: found $src, want $want")
    warn "$name: found $src, want $want"
  else
    ok "$name: $src"
  fi
done
if (( fail )); then
  if (( ${#bad[@]} )); then
    printf '%sVERIFY FAILED%s: %s — run ' "$c_err" "$c_reset" "${bad[*]}"
    echo "'omp plugin list' and 'omp plugin doctor' to inspect"
  else
    printf '%sVERIFY FAILED%s: doctor reported errors%s\n' "$c_err" "$c_reset" "$c_reset"
  fi
  [[ "$CHOSEN_POLICY" == backup ]] && info "backup of pre-clean state: see ~/ezxomp-omp-backups/"
  exit 1
fi
ok "all ${#PLUGINS[@]} plugins installed in $CHOSEN_MODE mode"
info
info "done. Start a FRESH omp session to pick up the new plugin set."
