#!/bin/bash
# Setup script for Social Explorer Dapr Deployment with Telegram Scraper

echo "🚀 Setting up Social Explorer Dapr deployment..."

# Set paths
# Crawler checkout; override with TELEGRAM_SCRAPER_PATH=/path/to/crawler
TELEGRAM_SCRAPER_PATH="${TELEGRAM_SCRAPER_PATH:-$(cd "$(dirname "$0")/../../crawler" 2>/dev/null && pwd)}"

# Local Dapr secret store (gitignored); start from the example file
if [ ! -f secrets.json ] && [ -f secrets.example.json ]; then
    cp secrets.example.json secrets.json
    echo "📝 Created secrets.json from secrets.example.json"
fi
CURRENT_DIR=$(pwd)

# Check if Redis is running (required for job store)
# The Dapr components authenticate to Redis with the redisPassword in secrets.json, and the
# container is bound to loopback only, so the password never crosses or leaves the host.
echo "🔍 Checking Redis availability..."
if ! nc -z localhost 6379 2>/dev/null; then
    echo "⚠️  Redis is not running. Starting Redis with Docker..."
    REDIS_PASS=$(openssl rand -hex 32)
    docker run -d --name redis-dapr -p 127.0.0.1:6379:6379 \
        redis:7-alpine redis-server --requirepass "$REDIS_PASS"
    sleep 3
    if ! nc -z localhost 6379 2>/dev/null; then
        echo "❌ Failed to start Redis. Please ensure Docker is running and try:"
        echo "   docker run -d --name redis-dapr -p 127.0.0.1:6379:6379 redis:7-alpine redis-server --requirepass '<password from secrets.json>'"
        exit 1
    fi
    if [ -f secrets.json ]; then
        node -e '
const fs = require("fs");
const file = process.argv[1];
const pass = process.argv[2];
const data = JSON.parse(fs.readFileSync(file, "utf8"));
data.redisPassword = pass;
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
' secrets.json "$REDIS_PASS"
        chmod 600 secrets.json
        echo "🔑 Wrote the Redis password into secrets.json"
    fi
    echo "✅ Redis started successfully"
else
    echo "✅ Redis is already running"
    echo "⚠️  The Dapr components authenticate with the redisPassword from secrets.json;"
    echo "   make sure the running Redis requires that same password."
fi

# Check if telegram-scraper exists and build if needed
if [ ! -f "$TELEGRAM_SCRAPER_PATH/telegram-scraper" ]; then
    echo "⚠️  telegram-scraper binary not found. Building..."
    cd "$TELEGRAM_SCRAPER_PATH" || exit 1
    if ! go build -o telegram-scraper; then
        echo "❌ Failed to build telegram-scraper"
        exit 1
    fi
    cd "$CURRENT_DIR" || exit 1
    echo "✅ telegram-scraper built successfully"
else
    echo "✅ telegram-scraper binary exists"
fi

# Create storage directory if it doesn't exist
mkdir -p "$CURRENT_DIR/telegram-data"
echo "✅ Storage directory ready: $CURRENT_DIR/telegram-data"

echo "🎯 Setup complete! You can now start the deployment with:"
echo "   npm run dev:dapr"
echo ""
echo "🔧 Other useful commands:"
echo "   npm run dapr:stop    - Stop all Dapr services"
echo "   npm run dapr:logs    - View deployment logs"
echo "   npm run test:integration - Test job scheduling"