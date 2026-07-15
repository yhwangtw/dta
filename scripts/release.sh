#!/usr/bin/env bash
# tGD-pi-web release script
# Usage: bash scripts/release.sh [YYYY.MM.DD]
# Default: today's date (Asia/Taipei)
#
# What it does:
#   1. Run typecheck + build (fail-fast)
#   2. Bump npm version to date-based format
#   3. Commit version bump + create git tag
#   4. Push to origin
#   5. GitHub Actions auto-creates Release with changelog

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

# ── Version argument ───────────────────────────
if [ -n "$1" ]; then
  NEW_VERSION="$1"
else
  NEW_VERSION=$(TZ=Asia/Taipei date "+%Y.%m.%d")
fi
TAG="v$NEW_VERSION"

# ── Preflight ──────────────────────────────────
echo "🔍 Preflight check..."

if ! command -v gh &> /dev/null; then
  echo "❌ GitHub CLI (gh) is required. Install: https://cli.github.com/"
  exit 1
fi

if ! gh auth status &> /dev/null; then
  echo "❌ Not authenticated with GitHub CLI. Run: gh auth login"
  exit 1
fi

WORKING_TREE=$(git status --porcelain | wc -l | tr -d ' ')
if [ "$WORKING_TREE" -gt 0 ]; then
  echo "❌ Working tree has uncommitted changes. Commit or stash first."
  git status --short
  exit 1
fi

# ── Typecheck ──────────────────────────────────
echo "📋 Typecheck..."
node_modules/.bin/tsc --noEmit
echo "  ✅ Typecheck passed"

# ── Build ──────────────────────────────────────
echo "📦 Build..."
npm run build
echo "  ✅ Build passed"

# ── Version bump ───────────────────────────────
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "📝 Current version: $CURRENT_VERSION → $NEW_VERSION"

node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
npm install --package-lock-only 2>/dev/null
echo "  ✅ Bumped to: $NEW_VERSION (tag: $TAG)"

# ── Commit + tag + push ────────────────────────
git add package.json package-lock.json
git commit -m "chore: release $TAG"

git tag -a "$TAG" -m "Release $TAG"
git push origin main
git push origin "$TAG"

echo ""
echo "✅ Done! Tag $TAG pushed."
echo "   GitHub Actions will create the Release automatically."
echo "   https://github.com/$(git remote get-url origin | sed 's|.*github.com/||; s|\.git$||')/releases"
