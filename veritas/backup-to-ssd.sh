#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# APERTURE PROTOCOL — FULL BACKUP TO EXTERNAL SSD
# ═══════════════════════════════════════════════════════════════
# This script packages everything needed to restore the full
# Aperture development environment on a fresh Mac.
#
# Usage:
#   1. Plug in your external SSD
#   2. Run: bash backup-to-ssd.sh /Volumes/YOUR_SSD_NAME
#   3. After Mac wipe, run: bash /Volumes/YOUR_SSD_NAME/aperture-backup/restore-from-ssd.sh
# ═══════════════════════════════════════════════════════════════

set -e

# ─── Validate SSD path ───
SSD_PATH="${1}"
if [ -z "$SSD_PATH" ]; then
  echo "❌ Usage: bash backup-to-ssd.sh /Volumes/YOUR_SSD_NAME"
  echo ""
  echo "Available volumes:"
  ls /Volumes/
  exit 1
fi

if [ ! -d "$SSD_PATH" ]; then
  echo "❌ Directory not found: $SSD_PATH"
  echo "Available volumes:"
  ls /Volumes/
  exit 1
fi

BACKUP_DIR="$SSD_PATH/aperture-backup"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo ""
echo "█████████████████████████████████████████████████████████"
echo " APERTURE BACKUP → $BACKUP_DIR"
echo " $(date)"
echo "█████████████████████████████████████████████████████████"
echo ""

mkdir -p "$BACKUP_DIR"

# ─── 1. Backup the entire project (excluding node_modules, build artifacts) ───
echo "📦 [1/6] Backing up project source code..."
rsync -av --progress \
  --exclude 'node_modules' \
  --exclude '.dart_tool' \
  --exclude 'build' \
  --exclude '.build' \
  --exclude 'ios/Pods' \
  --exclude 'ios/.symlinks' \
  --exclude '.gradle' \
  --exclude 'contracts/artifacts' \
  --exclude 'contracts/cache' \
  --exclude 'contracts/typechain-types' \
  --exclude 'uploads' \
  --exclude '.next' \
  "/Users/veeshal/MAJOR PROJECT/" "$BACKUP_DIR/MAJOR_PROJECT/"
echo "✅ Project source backed up"

# ─── 2. Backup .env files (these are gitignored but critical) ───
echo ""
echo "🔐 [2/6] Backing up secret environment files..."
mkdir -p "$BACKUP_DIR/secrets"
cp -v "/Users/veeshal/MAJOR PROJECT/aperture1/veritas/backend/.env" "$BACKUP_DIR/secrets/backend.env" 2>/dev/null || echo "  ⚠️  backend/.env not found"
cp -v "/Users/veeshal/MAJOR PROJECT/aperture/.env" "$BACKUP_DIR/secrets/aperture-old.env" 2>/dev/null || echo "  ⚠️  aperture/.env not found (ok if unused)"
echo "✅ Secrets backed up"

# ─── 3. Backup Flutter SDK path info ───
echo ""
echo "🐦 [3/6] Capturing Flutter SDK info..."
cat > "$BACKUP_DIR/flutter-info.txt" << EOF
Flutter Version: $(flutter --version 2>/dev/null | head -1 || echo "not found")
Flutter Path: $(which flutter 2>/dev/null || echo "not found")
Dart Version: $(dart --version 2>/dev/null || echo "not found")
EOF
echo "✅ Flutter info captured"

# ─── 4. Capture system environment snapshot ───
echo ""
echo "🖥️  [4/6] Capturing system environment snapshot..."
cat > "$BACKUP_DIR/system-snapshot.txt" << EOF
═══════════════════════════════════════════════
SYSTEM SNAPSHOT — $(date)
═══════════════════════════════════════════════

macOS Version: $(sw_vers -productVersion 2>/dev/null)
Chip: $(uname -m)
Node: $(node --version 2>/dev/null || echo "not installed")
npm: $(npm --version 2>/dev/null || echo "not installed")
Flutter: $(flutter --version 2>/dev/null | head -1 || echo "not installed")
Git: $(git --version 2>/dev/null || echo "not installed")
Xcode CLI: $(xcode-select -p 2>/dev/null || echo "not installed")

═══ Homebrew Formulae ═══
$(brew list --formula 2>/dev/null | tr '\n' ' ')

═══ Homebrew Casks ═══
$(brew list --cask 2>/dev/null | tr '\n' ' ')

═══ Global npm packages ═══
$(npm list -g --depth=0 2>/dev/null)
EOF
echo "✅ System snapshot saved"

# ─── 5. Backup SSH keys and Git config ───
echo ""
echo "🔑 [5/6] Backing up SSH keys and Git config..."
mkdir -p "$BACKUP_DIR/ssh-keys"
if [ -d "$HOME/.ssh" ]; then
  cp -r "$HOME/.ssh/" "$BACKUP_DIR/ssh-keys/"
  echo "✅ SSH keys backed up"
else
  echo "  ⚠️  No ~/.ssh directory found"
fi
cp "$HOME/.gitconfig" "$BACKUP_DIR/gitconfig" 2>/dev/null || echo "  ⚠️  No .gitconfig found"

# ─── 6. Generate the restore script ───
echo ""
echo "📝 [6/6] Generating restore script..."
cat > "$BACKUP_DIR/restore-from-ssd.sh" << 'RESTORE_SCRIPT'
#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# APERTURE PROTOCOL — RESTORE FROM SSD
# ═══════════════════════════════════════════════════════════════
# Run this on your fresh Mac after the wipe.
# Usage: bash /Volumes/YOUR_SSD/aperture-backup/restore-from-ssd.sh
# ═══════════════════════════════════════════════════════════════

set -e

BACKUP_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "█████████████████████████████████████████████████████████"
echo " APERTURE RESTORE FROM: $BACKUP_DIR"
echo " $(date)"
echo "█████████████████████████████████████████████████████████"
echo ""

# ─── Step 1: Install Homebrew ───
echo "🍺 [1/9] Installing Homebrew..."
if ! command -v brew &>/dev/null; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add to PATH for Apple Silicon
  echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
  eval "$(/opt/homebrew/bin/brew shellenv)"
else
  echo "  ✅ Homebrew already installed"
fi

# ─── Step 2: Install core dependencies ───
echo ""
echo "📦 [2/9] Installing core dependencies via Homebrew..."
brew install git node postgresql@16 cocoapods yarn 2>/dev/null || true
brew install --cask ngrok 2>/dev/null || true

# Install pgvector extension
echo ""
echo "🧮 Installing pgvector..."
brew install pgvector 2>/dev/null || true

# ─── Step 3: Start PostgreSQL ───
echo ""
echo "🐘 [3/9] Starting PostgreSQL..."
brew services start postgresql@16

# Wait for PostgreSQL to start
echo "  Waiting for PostgreSQL to start..."
sleep 3

# ─── Step 4: Install Flutter ───
echo ""
echo "🐦 [4/9] Installing Flutter..."
if ! command -v flutter &>/dev/null; then
  echo "  Cloning Flutter SDK to ~/flutter..."
  git clone https://github.com/flutter/flutter.git -b stable ~/flutter
  echo 'export PATH="$HOME/flutter/bin:$PATH"' >> ~/.zshrc
  export PATH="$HOME/flutter/bin:$PATH"
  flutter doctor --android-licenses 2>/dev/null || true
else
  echo "  ✅ Flutter already installed"
fi

# ─── Step 5: Install Xcode CLI tools ───
echo ""
echo "🔨 [5/9] Installing Xcode Command Line Tools..."
xcode-select --install 2>/dev/null || echo "  ✅ Already installed"

# ─── Step 6: Restore project files ───
echo ""
echo "📁 [6/9] Restoring project files..."
mkdir -p "$HOME/MAJOR PROJECT"
rsync -av "$BACKUP_DIR/MAJOR_PROJECT/" "$HOME/MAJOR PROJECT/"
echo "  ✅ Project restored to ~/MAJOR PROJECT/"

# ─── Step 7: Restore secrets ───
echo ""
echo "🔐 [7/9] Restoring environment files..."
if [ -f "$BACKUP_DIR/secrets/backend.env" ]; then
  cp "$BACKUP_DIR/secrets/backend.env" "$HOME/MAJOR PROJECT/aperture1/veritas/backend/.env"
  echo "  ✅ backend/.env restored"
fi
if [ -f "$BACKUP_DIR/secrets/aperture-old.env" ]; then
  cp "$BACKUP_DIR/secrets/aperture-old.env" "$HOME/MAJOR PROJECT/aperture/.env"
  echo "  ✅ aperture/.env restored"
fi

# ─── Step 8: Restore SSH keys and Git config ───
echo ""
echo "🔑 [8/9] Restoring SSH keys and Git config..."
if [ -d "$BACKUP_DIR/ssh-keys" ] && [ "$(ls -A "$BACKUP_DIR/ssh-keys")" ]; then
  mkdir -p "$HOME/.ssh"
  cp -r "$BACKUP_DIR/ssh-keys/"* "$HOME/.ssh/"
  chmod 700 "$HOME/.ssh"
  chmod 600 "$HOME/.ssh/id_"* 2>/dev/null || true
  chmod 644 "$HOME/.ssh/"*.pub 2>/dev/null || true
  echo "  ✅ SSH keys restored"
fi
if [ -f "$BACKUP_DIR/gitconfig" ]; then
  cp "$BACKUP_DIR/gitconfig" "$HOME/.gitconfig"
  echo "  ✅ Git config restored"
fi

# ─── Step 9: Install project dependencies & setup DB ───
echo ""
echo "⚡ [9/9] Installing project dependencies..."

PROJECT_DIR="$HOME/MAJOR PROJECT/aperture1/veritas"

echo "  → Backend dependencies..."
cd "$PROJECT_DIR/backend" && npm install

echo "  → Frontend dependencies..."
cd "$PROJECT_DIR/frontend" && npm install

echo "  → Contract dependencies..."
cd "$PROJECT_DIR/contracts" && npm install

echo "  → Flutter dependencies..."
cd "$PROJECT_DIR/aperture_agent" && flutter pub get 2>/dev/null || echo "  ⚠️  Flutter pub get failed — run manually"

echo ""
echo "  → Setting up database..."
cd "$PROJECT_DIR/backend" && npm run setup-db

echo ""
echo "█████████████████████████████████████████████████████████"
echo " ✅ RESTORE COMPLETE!"
echo "█████████████████████████████████████████████████████████"
echo ""
echo " Your project is at: $PROJECT_DIR"
echo ""
echo " To start developing:"
echo "   cd \"$PROJECT_DIR/backend\" && npm run dev"
echo "   cd \"$PROJECT_DIR/frontend\" && npm run dev"
echo ""
echo " To deploy the mobile app:"
echo "   cd \"$PROJECT_DIR\" && bash deploy.sh"
echo ""
echo " System snapshot from before wipe:"
echo "   cat $BACKUP_DIR/system-snapshot.txt"
echo ""
RESTORE_SCRIPT

chmod +x "$BACKUP_DIR/restore-from-ssd.sh"
echo "✅ Restore script generated"

# ─── Summary ───
echo ""
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "█████████████████████████████████████████████████████████"
echo " ✅ BACKUP COMPLETE!"
echo "█████████████████████████████████████████████████████████"
echo ""
echo " 📍 Backup location: $BACKUP_DIR"
echo " 💾 Total size: $BACKUP_SIZE"
echo ""
echo " Contents:"
echo "   MAJOR_PROJECT/     → Full project source (no node_modules)"
echo "   secrets/           → .env files with private keys"
echo "   ssh-keys/          → SSH keys for GitHub"
echo "   system-snapshot.txt → Tool versions and brew packages"
echo "   flutter-info.txt   → Flutter SDK version"
echo "   gitconfig          → Git configuration"
echo "   restore-from-ssd.sh → One-command restore script"
echo ""
echo " ┌─────────────────────────────────────────────────────┐"
echo " │ AFTER WIPING YOUR MAC, RUN:                        │"
echo " │                                                     │"
echo " │   bash $BACKUP_DIR/restore-from-ssd.sh              │"
echo " │                                                     │"
echo " │ This will install Homebrew, Node, Flutter, Postgres,│"
echo " │ restore all code + secrets, and set up the DB.      │"
echo " └─────────────────────────────────────────────────────┘"
echo ""
