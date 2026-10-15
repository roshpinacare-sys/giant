#!/usr/bin/env bash
# boot/gh-token.sh — loads the sovereign PAT into env vars. NEVER printed.
# Usage: source boot/gh-token.sh
set -euo pipefail
_PAT_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/upload/pat.env"
GH_TOKEN="$(tr -d '[:space:]' < "$_PAT_FILE")"
[ -n "$GH_TOKEN" ] || { echo "EMPTY TOKEN" >&2; exit 2; }
case "$GH_TOKEN" in github_pat_*|ghp_*|github_token=*) ;; *) echo "UNEXPECTED TOKEN SHAPE (len=${#GH_TOKEN})" >&2; exit 2;; esac
export GH_TOKEN GITHUB_TOKEN="$GH_TOKEN"
unset _PAT_FILE
