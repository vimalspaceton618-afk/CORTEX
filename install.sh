#!/usr/bin/env bash
set -euo pipefail
CORTEX_VERSION="4.0.0"
REPO_URL="https://github.com/vimalspaceton618-afk/CORTEX.git"
INSTALL_DIR="$HOME/.cortex-install"
MIN_NODE=20
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' C='\033[0;36m' D='\033[2m' N='\033[0m'

echo -e "${C}"
cat << 'EOF'
  ██████╗ ██████╗ ██████╗ ████████╗███████╗██╗  ██╗
 ██╔════╝██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝╚██╗██╔╝
 ██║     ██║   ██║██████╔╝   ██║   █████╗   ╚███╔╝
 ██║     ██║   ██║██╔══██╗   ██║   ██╔══╝   ██╔██╗
 ╚██████╗╚██████╔╝██║  ██║   ██║   ███████╗██╔╝ ██╗
  ╚═════╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
EOF
echo -e "${N}${D}  Sovereign Intelligence v${CORTEX_VERSION} — One-Line Installer${N}\n"

check_node() { command -v node &>/dev/null && [ "$(node -v|sed 's/v//'|cut -d. -f1)" -ge "$MIN_NODE" ]; }

if check_node; then echo -e "${G}[1/5] Node.js $(node -v) ✓${N}"
else
  echo -e "${Y}[1/5] Installing Node.js via fnm...${N}"
  curl -fsSL https://fnm.vercel.app/install | bash
  export PATH="$HOME/.local/share/fnm:$PATH"; eval "$(fnm env)"
  fnm install $MIN_NODE && fnm use $MIN_NODE && fnm default $MIN_NODE
  check_node || { echo -e "${R}[FATAL] Install Node >= $MIN_NODE from https://nodejs.org${N}"; exit 1; }
fi

echo -e "${Y}[2/5] Downloading CORTEX...${N}"
rm -rf "$INSTALL_DIR"
if command -v git &>/dev/null; then git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
else
  curl -fsSL "https://github.com/vimalspaceton618-afk/CORTEX/archive/main.tar.gz" -o /tmp/cx.tar.gz
  mkdir -p "$INSTALL_DIR" && tar -xzf /tmp/cx.tar.gz -C /tmp && mv /tmp/CORTEX-main/* "$INSTALL_DIR/" && rm /tmp/cx.tar.gz
fi

echo -e "${Y}[3/5] Installing dependencies...${N}"
cd "$INSTALL_DIR" && npm i --no-fund --no-audit 2>/dev/null
cd "$INSTALL_DIR/BIGROCK_ASI" && npm i --no-fund --no-audit 2>/dev/null && cd "$INSTALL_DIR"

echo -e "${Y}[4/5] Building...${N}"
npm run build

echo -e "${Y}[5/5] Installing globally...${N}"
npm i -g . 2>/dev/null || sudo npm i -g . 2>/dev/null

echo ""
read -rp "  OPENAI_API_KEY (Enter to skip for local-only): " key
[ -n "$key" ] && echo "OPENAI_API_KEY=$key" > "$INSTALL_DIR/.env" && echo -e "${G}  ✓ Saved${N}" || echo -e "${Y}  ✓ Local mode${N}"

echo -e "\n${G}══════════════════════════════════════════${N}"
echo -e "${G}  ✅ CORTEX INSTALLED${N}"
echo -e "${G}══════════════════════════════════════════${N}"
echo -e "${D}  cortex              # Interactive terminal"
echo -e "  cortex --run /health # Health check"
echo -e "  cortex --run /demo   # Full demo${N}\n"
