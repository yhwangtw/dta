#!/usr/bin/env bash
#
# tGD-pi-web — 一鍵安裝 + Production 啟動
# 需要：Node.js 22+
#
set -e

# ── 顏色 ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}🚀 tGD-pi-web 一鍵安裝${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 檢查 Next.js workspace root 衝突 ────────────────
# Next.js searches ancestor directories for lockfiles. A stray lockfile in
# $HOME can make builds trace the whole home directory and appear to hang.
ANCESTOR_LOCKFILES="$(
  parent_dir="$(dirname "$SCRIPT_DIR")"
  while [ "$parent_dir" != "/" ]; do
    for lock_name in package-lock.json pnpm-lock.yaml yarn.lock bun.lock bun.lockb; do
      if [ -f "$parent_dir/$lock_name" ]; then
        printf '%s\n' "$parent_dir/$lock_name"
      fi
    done
    parent_dir="$(dirname "$parent_dir")"
  done
)"

if [ -n "$ANCESTOR_LOCKFILES" ]; then
  echo ""
  echo -e "${YELLOW}${BOLD}⚠️  偵測到上層 lockfile：${NC}"
  while IFS= read -r lockfile; do
    echo "  $lockfile"
  done <<< "$ANCESTOR_LOCKFILES"
  echo -e "  ${GREEN}✅ Next.js workspace root 已固定為 $SCRIPT_DIR${NC}"
  echo "  setup.sh 不會刪除或修改上層 lockfile。"
fi

# ── 檢查 Node.js ──────────────────────────────────────
echo ""
echo -e "${BOLD}📦 檢查 Node.js...${NC}"
if ! command -v node &>/dev/null; then
  echo -e "  ${RED}❌ 找不到 Node.js${NC}"
  echo ""
  echo "  安裝方式："
  echo "    macOS:   brew install node"
  echo "    Ubuntu:  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs"
  echo "    其他:    https://nodejs.org/"
  exit 1
fi

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo -e "  ${RED}❌ Node.js 版本過舊 ($NODE_MAJOR.x)，需要 22+${NC}"
  exit 1
fi
echo -e "  ${GREEN}✅ Node.js $(node --version)${NC}"

# ── 檢查 npm ──────────────────────────────────────────
if ! command -v npm &>/dev/null; then
  echo -e "  ${RED}❌ 找不到 npm${NC}"
  exit 1
fi
echo -e "  ${GREEN}✅ npm $(npm --version)${NC}"

# ── 安裝依賴 ──────────────────────────────────────────
echo ""
echo -e "${BOLD}📦 安裝依賴...${NC}"
# `node_modules` existing does not mean it matches package-lock.json. Always
# reconcile it so upgrades (especially Pi runtime fixes) are not silently skipped.
npm install
echo -e "  ${GREEN}✅ 依賴已與 package-lock.json 同步${NC}"

# ── 檢查 Pi Agent ─────────────────────────────────────
echo ""
echo -e "${BOLD}🤖 檢查 Pi Agent...${NC}"
PI_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
if [ -d "$PI_DIR" ]; then
  echo -e "  ${GREEN}✅ Pi Agent 資料目錄: $PI_DIR${NC}"
else
  echo -e "  ${YELLOW}⚠️  Pi Agent 尚未安裝或未初始化${NC}"
  echo -e "  ${YELLOW}   資料目錄 $PI_DIR 不存在${NC}"
  echo ""
  echo "  安裝 Pi Agent："
  echo "    npm install -g @earendil-works/pi-coding-agent"
  echo "    pi  # 首次運行會自動初始化"
  echo ""
  echo -e "  ${YELLOW}繼續啟動 Web 界面（瀏覽功能可用，對話需先裝 Pi Agent）${NC}"
fi

# ── 驗證 ──────────────────────────────────────────────
echo ""
echo -e "${BOLD}🔍 驗證...${NC}"
if node_modules/.bin/tsc --noEmit 2>/dev/null; then
  echo -e "  ${GREEN}✅ TypeScript 編譯通過${NC}"
else
  echo -e "  ${YELLOW}⚠️  TypeScript 檢查未通過，Production build 將顯示完整錯誤${NC}"
fi

# ── Production build ─────────────────────────────────
echo ""
echo -e "${BOLD}🏗️  建置 Production...${NC}"
npm run build
echo -e "  ${GREEN}✅ Production build 完成${NC}"

# ── 啟動 ──────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}✅ 安裝完成！${NC}"
echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  啟動 Production：${BOLD}npm start${NC}"
echo -e "  重新建置：       ${BOLD}npm run build${NC}"
echo -e "  更新並重新建置： ${BOLD}git pull && npm install && npm run build${NC}"
echo ""
echo -e "  預設埠號：      ${BOLD}30141${NC}"
echo ""

# ── 詢問是否立即啟動 ──────────────────────────────────
if [ -t 0 ]; then
  read -p "$(echo -e ${CYAN}是否立即啟動 Production 伺服器？[Y/n]${NC} )" choice
  case "$choice" in
    n|N)
      echo "bye 👋"
      exit 0
      ;;
    *)
      echo ""
      echo -e "${CYAN}啟動 Production...${NC}"
      echo -e "  打開 http://localhost:30141"
      echo -e "  Ctrl+C 停止"
      echo ""
      exec npm start
      ;;
  esac
fi
