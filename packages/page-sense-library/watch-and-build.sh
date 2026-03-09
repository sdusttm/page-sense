#!/bin/bash

# Auto-rebuild script for page-sense-library
# Watches for source file changes and rebuilds automatically

echo "👀 Watching page-sense-library for changes..."
echo "Press Ctrl+C to stop"
echo ""

# Use fswatch if available, otherwise use a simple loop
if command -v fswatch &> /dev/null; then
    echo "Using fswatch for efficient file watching"
    echo ""

    fswatch -o src/ | while read; do
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "🔄 Change detected! Rebuilding..."
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        pnpm build
        echo ""
        echo "✅ Build complete at $(date '+%H:%M:%S')"
        echo "   app_home will auto-reload"
        echo ""
    done
else
    echo "⚠️  fswatch not found. Install with: brew install fswatch"
    echo "   Falling back to periodic checking..."
    echo ""

    LAST_CHANGE=0

    while true; do
        CURRENT=$(find src -type f -exec stat -f "%m" {} \; | sort -n | tail -1)

        if [ "$CURRENT" != "$LAST_CHANGE" ] && [ "$LAST_CHANGE" != "0" ]; then
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo "🔄 Change detected! Rebuilding..."
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            pnpm build
            echo ""
            echo "✅ Build complete at $(date '+%H:%M:%S')"
            echo "   app_home will auto-reload"
            echo ""
        fi

        LAST_CHANGE=$CURRENT
        sleep 2
    done
fi
