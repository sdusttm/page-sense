#!/bin/bash

# Quick version bump script
# Updates BUILD_TIME in version.ts and rebuilds

set -e

echo "🔄 Bumping version timestamp..."

# Get current timestamp in ISO format
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Update BUILD_TIME in version.ts
sed -i '' "s/BUILD_TIME = '[^']*'/BUILD_TIME = '$TIMESTAMP'/" src/version.ts

echo "✅ Updated BUILD_TIME to: $TIMESTAMP"
echo ""

# Show what version will be displayed
VERSION=$(grep "VERSION = " src/version.ts | sed "s/.*'\(.*\)'.*/\1/")
echo "📦 Version: $VERSION"
echo "🕐 Build Time: $TIMESTAMP"
echo ""

# Rebuild
echo "🔨 Rebuilding library..."
pnpm build

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Version bumped and library rebuilt!"
echo ""
echo "The AI Monitor will now show:"
echo "  v$VERSION"
echo "  Built: $TIMESTAMP"
echo ""
echo "💡 app_home will auto-reload if dev server is running"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
