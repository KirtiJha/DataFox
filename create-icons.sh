#!/bin/bash

echo "DataFox Icon Generation Script"
echo "=============================="
echo ""
echo "To create proper icon files for your Electron app, you have a few options:"
echo ""
echo "Option 1 - Online SVG to PNG converter:"
echo "1. Go to https://convertio.co/svg-png/ or https://svgtopng.com/"
echo "2. Upload: public/assets/icons/icon.svg"
echo "3. Convert to these sizes and save as:"
echo "   - 512x512 → public/assets/icons/icon.png"
echo "   - 256x256 → public/assets/icons/icon-256.png" 
echo "   - 128x128 → public/assets/icons/icon-128.png"
echo "   - 64x64 → public/assets/icons/icon-64.png"
echo "   - 32x32 → public/assets/icons/icon-32.png"
echo "   - 16x16 → public/assets/icons/icon-16.png"
echo ""
echo "Option 2 - Install ImageMagick (recommended):"
echo "brew install imagemagick"
echo "Then run this script again to auto-convert"
echo ""
echo "Option 3 - Use online ICNS/ICO generator:"
echo "1. Upload the 512x512 PNG to https://iconverticons.com/"
echo "2. Generate .icns (Mac) and .ico (Windows) files"
echo "3. Save as public/assets/icons/icon.icns and public/assets/icons/icon.ico"
echo ""

# Check if ImageMagick is available
if command -v convert &> /dev/null; then
    echo "ImageMagick found! Converting SVG to PNG formats..."
    cd "$(dirname "$0")"
    
    # Convert to various PNG sizes
    convert public/assets/icons/icon.svg -resize 512x512 public/assets/icons/icon.png
    convert public/assets/icons/icon.svg -resize 256x256 public/assets/icons/icon-256.png
    convert public/assets/icons/icon.svg -resize 128x128 public/assets/icons/icon-128.png
    convert public/assets/icons/icon.svg -resize 64x64 public/assets/icons/icon-64.png
    convert public/assets/icons/icon.svg -resize 32x32 public/assets/icons/icon-32.png
    convert public/assets/icons/icon.svg -resize 16x16 public/assets/icons/icon-16.png
    
    echo "PNG files created successfully!"
    echo "Now create .icns and .ico files using an online converter"
else
    echo "ImageMagick not found. Please use one of the options above."
fi
