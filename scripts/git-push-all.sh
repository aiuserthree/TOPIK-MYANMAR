#!/usr/bin/env bash
# main 브랜치를 GitHub 두 저장소에 푸시
# 사용: bash scripts/git-push-all.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

BRANCH="${1:-main}"

echo "==> push origin (${BRANCH}) → aiuserthree/TOPIK-MYANMAR"
git push origin "${BRANCH}"

echo "==> push ibank (${BRANCH}) → ibank-ax/Myanmar"
git push ibank "${BRANCH}"

echo "==> Done."
