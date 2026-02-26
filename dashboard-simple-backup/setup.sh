#!/bin/bash

echo "🎯 Mission Control Setup"
echo "========================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi

echo "✓ Node.js found: $(node --version)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
cd "$(dirname "$0")"
npm install

# Check if .env exists
if [ ! -f .env ]; then
    echo ""
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env and add your Discord credentials"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env with your Discord bot token (optional)"
echo "2. Start the server: npm start"
echo "3. Open dashboard: http://localhost:3456"
echo ""
echo "To start the Discord bot (optional):"
echo "  node discord-bot.js"
echo ""
