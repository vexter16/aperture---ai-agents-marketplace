#!/bin/bash

# Configuration
DEVICE_ID="00008150-00027C841E98401C"
AGENT_DIR="/Users/veeshal/MAJOR PROJECT/aperture1/veritas/aperture_agent"

echo "🚀 Starting Aperture Agent Deployment..."
echo "📍 Working Directory: $AGENT_DIR"
echo "📱 Target Device: Siddhanth’s iPhone ($DEVICE_ID)"

# Add Brew to Path for the session (prevents 'flutter not found' issues)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Move to the agent directory
cd "$AGENT_DIR" || { echo "❌ Error: Could not find $AGENT_DIR"; exit 1; }

# Clean (optional, but ensures fresh build)
# echo "🧹 Cleaning project..."
# flutter clean

# Get dependencies
echo "📦 Getting packages..."
flutter pub get

# Build and Run
echo "⚡ Building and Deploying to iPhone (Release Mode)..."
flutter run -d "$DEVICE_ID" --release

if [ $? -eq 0 ]; then
    echo "✅ Deployment Successful!"
else
    echo "❌ Deployment Failed. Check Xcode logs or physical connection."
fi
