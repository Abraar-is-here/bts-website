#!/usr/bin/env bash
# Opens analyst applications: swaps the Coming Soon page for the real form and
# restores the "apply" links on the home, About, Events and Selection pages.
# Then review with `git diff`, commit and push.
#   Preview the form first at /apply/preview/ (hidden from search and unlinked).
set -euo pipefail
cd "$(dirname "$0")/.."
cp apply/preview/index.html apply/index.html
sed -i '/name="robots" content="noindex, nofollow"/d' apply/index.html
git apply -R --ignore-whitespace scripts/closed-text.patch
echo "Applications are open in your working tree. Now: git add -A && git commit && git push"
