#!/bin/bash
# Quick verification script for Web2Wireframe setup
# Run this to check if everything is configured correctly

echo "🔍 Web2Wireframe Setup Verification"
echo "═════════════════════════════════════════════════════"

# Check directories
echo ""
echo "📁 Checking directories..."

dirs=("Website_Backend" "Website_Frontend")

for dir in "${dirs[@]}"; do
    if [ -d "$dir" ]; then
        echo "✅ $dir found"
    else
        echo "❌ $dir NOT found"
    fi
done

# Check files
echo ""
echo "📄 Checking critical files..."

files=(
    "Website_Backend/.env"
    "Website_Backend/package.json"
    "Website_Frontend/.env.local"
    "Website_Frontend/package.json"
    "package.json"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file found"
    else
        echo "⚠️  $file NOT found (may need setup)"
    fi
done

# Check Node.js
echo ""
echo "🔧 Checking tools..."

if command -v node &> /dev/null; then
    echo "✅ Node.js: $(node -v)"
else
    echo "❌ Node.js not found"
fi

if command -v npm &> /dev/null; then
    echo "✅ npm: $(npm -v)"
else
    echo "❌ npm not found"
fi

# Check Resend key
echo ""
echo "🔐 Checking configuration..."

if [ -f "Website_Backend/.env" ]; then
    if grep -q "RESEND_API_KEY=re_" Website_Backend/.env; then
        echo "✅ RESEND_API_KEY configured"
    else
        echo "⚠️  RESEND_API_KEY not set (email won't work)"
    fi
else
    echo "⚠️  Website_Backend/.env not found"
fi

if [ -f "Website_Backend/.env" ]; then
    if grep -q "PORT=3002" Website_Backend/.env; then
        echo "✅ Backend PORT: 3002"
    else
        echo "⚠️  Backend PORT not set to 3002"
    fi
fi

if [ -f "Website_Frontend/.env.local" ]; then
    if grep -q "VITE_API_URL" Website_Frontend/.env.local; then
        echo "✅ Frontend API URL configured"
    fi
fi

# Summary
echo ""
echo "═════════════════════════════════════════════════════"
echo "✅ Verification complete!"
echo ""
echo "Next steps:"
echo "1. npm run setup  (if first time)"
echo "2. npm run dev    (to start)"
echo ""
