# ══════════════════════════════════════════════════════════════
#  CORTEX — One-Line Installer for Windows
#  Usage: irm https://raw.githubusercontent.com/vimalspaceton618-afk/CORTEX/main/install.ps1 | iex
# ══════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

$CORTEX_VERSION = "4.0.0"
$REPO_URL = "https://github.com/vimalspaceton618-afk/CORTEX.git"
$INSTALL_DIR = "$env:USERPROFILE\.cortex-install"
$MIN_NODE_VERSION = 20

function Write-Banner {
    Write-Host ""
    Write-Host "  ██████╗ ██████╗ ██████╗ ████████╗███████╗██╗  ██╗" -ForegroundColor Cyan
    Write-Host " ██╔════╝██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝╚██╗██╔╝" -ForegroundColor Cyan
    Write-Host " ██║     ██║   ██║██████╔╝   ██║   █████╗   ╚███╔╝ " -ForegroundColor Cyan
    Write-Host " ██║     ██║   ██║██╔══██╗   ██║   ██╔══╝   ██╔██╗ " -ForegroundColor Cyan
    Write-Host " ╚██████╗╚██████╔╝██║  ██║   ██║   ███████╗██╔╝ ██╗" -ForegroundColor Cyan
    Write-Host "  ╚═════╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Sovereign Intelligence Infrastructure v$CORTEX_VERSION" -ForegroundColor DarkGray
    Write-Host "  One-Line Installer for Windows" -ForegroundColor DarkGray
    Write-Host ""
}

function Test-NodeInstalled {
    try {
        $nodeVersion = (node --version 2>$null)
        if ($nodeVersion) {
            $major = [int]($nodeVersion -replace '^v','').Split('.')[0]
            return $major -ge $MIN_NODE_VERSION
        }
    } catch {}
    return $false
}

function Install-Node {
    Write-Host "[1/5] Node.js >= $MIN_NODE_VERSION not found. Installing via fnm..." -ForegroundColor Yellow
    
    # Install fnm (Fast Node Manager)
    try {
        winget install Schniz.fnm --accept-package-agreements --accept-source-agreements 2>$null
    } catch {
        Write-Host "  winget not available. Trying direct download..." -ForegroundColor DarkGray
        Invoke-WebRequest -Uri "https://fnm.vercel.app/install" -UseBasicParsing | Invoke-Expression
    }

    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")

    fnm install $MIN_NODE_VERSION
    fnm use $MIN_NODE_VERSION
    fnm default $MIN_NODE_VERSION

    if (-not (Test-NodeInstalled)) {
        Write-Host "[FATAL] Failed to install Node.js. Please install Node.js >= $MIN_NODE_VERSION manually." -ForegroundColor Red
        Write-Host "  Download: https://nodejs.org/" -ForegroundColor DarkGray
        exit 1
    }
    Write-Host "  ✓ Node.js installed successfully." -ForegroundColor Green
}

function Install-Cortex {
    # Check Git
    $gitInstalled = $false
    try { git --version 2>$null | Out-Null; $gitInstalled = $true } catch {}

    if ($gitInstalled) {
        Write-Host "[2/5] Cloning CORTEX repository..." -ForegroundColor Yellow
        if (Test-Path $INSTALL_DIR) { Remove-Item -Recurse -Force $INSTALL_DIR }
        git clone --depth 1 $REPO_URL $INSTALL_DIR
    } else {
        Write-Host "[2/5] Git not found. Downloading release archive..." -ForegroundColor Yellow
        $zipUrl = "https://github.com/vimalspaceton618-afk/CORTEX/archive/refs/heads/main.zip"
        $zipPath = "$env:TEMP\cortex-download.zip"
        Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
        if (Test-Path $INSTALL_DIR) { Remove-Item -Recurse -Force $INSTALL_DIR }
        Expand-Archive -Path $zipPath -DestinationPath "$env:TEMP\cortex-extract" -Force
        Move-Item "$env:TEMP\cortex-extract\CORTEX-main" $INSTALL_DIR
        Remove-Item $zipPath -Force
        Remove-Item "$env:TEMP\cortex-extract" -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host "  ✓ Source downloaded to $INSTALL_DIR" -ForegroundColor Green
}

function Build-Cortex {
    Write-Host "[3/5] Installing dependencies..." -ForegroundColor Yellow
    Push-Location $INSTALL_DIR
    npm install --no-fund --no-audit 2>$null
    
    Push-Location "$INSTALL_DIR\BIGROCK_ASI"
    npm install --no-fund --no-audit 2>$null
    Pop-Location

    Write-Host "[4/5] Building CORTEX (TypeScript compilation)..." -ForegroundColor Yellow
    npm run build
    Pop-Location
    Write-Host "  ✓ Build complete." -ForegroundColor Green
}

function Install-Global {
    Write-Host "[5/5] Installing 'cortex' command globally..." -ForegroundColor Yellow
    Push-Location $INSTALL_DIR
    npm install -g . 2>$null
    Pop-Location

    # Verify
    try {
        $ver = cortex --version 2>$null
        Write-Host "  ✓ 'cortex' command installed (v$ver)." -ForegroundColor Green
    } catch {
        # Fallback: add to PATH manually
        $npmGlobalBin = (npm config get prefix) + "\node_modules\.bin"
        $userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
        if ($userPath -notlike "*$npmGlobalBin*") {
            [System.Environment]::SetEnvironmentVariable("PATH", "$userPath;$npmGlobalBin", "User")
            Write-Host "  ✓ Added npm global bin to PATH. Restart your terminal." -ForegroundColor Yellow
        }
    }
}

function Configure-Env {
    $envFile = "$INSTALL_DIR\.env"
    if (-not (Test-Path $envFile)) {
        Copy-Item "$INSTALL_DIR\.env.example" $envFile -ErrorAction SilentlyContinue
    }

    Write-Host ""
    Write-Host "  ┌─────────────────────────────────────────────────┐" -ForegroundColor DarkCyan
    Write-Host "  │  CORTEX can run 100% locally (air-gapped)       │" -ForegroundColor DarkCyan
    Write-Host "  │  OR use a cloud LLM for advanced agent tasks.   │" -ForegroundColor DarkCyan
    Write-Host "  └─────────────────────────────────────────────────┘" -ForegroundColor DarkCyan
    Write-Host ""

    $apiKey = Read-Host "  Enter OPENAI_API_KEY (or press Enter to skip for local-only mode)"
    if ($apiKey -and $apiKey.Trim() -ne "") {
        $content = Get-Content $envFile -Raw -ErrorAction SilentlyContinue
        if ($content) {
            $content = $content -replace 'OPENAI_API_KEY=.*', "OPENAI_API_KEY=$($apiKey.Trim())"
        } else {
            $content = "OPENAI_API_KEY=$($apiKey.Trim())"
        }
        Set-Content $envFile $content
        Write-Host "  ✓ API key saved." -ForegroundColor Green
    } else {
        Write-Host "  ✓ Running in local-only mode. Use '/brain eat' to load GGUF models." -ForegroundColor Yellow
    }
}

function Write-Success {
    Write-Host ""
    Write-Host "══════════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host "  ✅ CORTEX INSTALLED SUCCESSFULLY" -ForegroundColor Green
    Write-Host "══════════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Quick Start:" -ForegroundColor White
    Write-Host "    cortex                     # Launch interactive terminal" -ForegroundColor DarkGray
    Write-Host "    cortex --run '/health'     # Run a health check" -ForegroundColor DarkGray
    Write-Host "    cortex --run '/demo'       # Full capability demo" -ForegroundColor DarkGray
    Write-Host "    cortex --run '/cyberscan'  # Security scan current dir" -ForegroundColor DarkGray
    Write-Host "    cortex --setup             # Re-run setup wizard" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Installed to: $INSTALL_DIR" -ForegroundColor DarkGray
    Write-Host ""
}

# ─── MAIN ───────────────────────────────────────────────────────
Write-Banner

if (Test-NodeInstalled) {
    $nodeVer = node --version
    Write-Host "[1/5] Node.js $nodeVer detected. ✓" -ForegroundColor Green
} else {
    Install-Node
}

Install-Cortex
Build-Cortex
Install-Global
Configure-Env
Write-Success
