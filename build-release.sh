#!/bin/bash

# DataFox FTP Client Build Script
# This script builds the application for distribution

echo "🚀 Starting DataFox FTP Client build process..."

# Clean previous builds
echo "🧹 Cleaning previous builds..."
npm run prebuild

# Build Next.js application
echo "📦 Building Next.js application..."
npm run build

# Build Electron app for macOS (both Intel and Apple Silicon)
echo "🔨 Building Electron app for macOS..."
npm run dist:mac

# Check if build was successful
if [ -f "dist/DataFox FTP Client-1.0.0.dmg" ] && [ -f "dist/DataFox FTP Client-1.0.0-arm64.dmg" ]; then
    echo "✅ Build completed successfully!"
    echo ""
    echo "📂 Generated files:"
    ls -lh dist/*.dmg
    echo ""
    echo "🎉 Your distributable DMG files are ready!"
    echo "   • Intel Macs: DataFox FTP Client-1.0.0.dmg"
    echo "   • Apple Silicon: DataFox FTP Client-1.0.0-arm64.dmg"
else
    echo "❌ Build failed. Check the logs above for errors."
    exit 1
fi