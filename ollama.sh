#!/bin/bash
set -e

echo "========================================="
echo "  Ollama Setup Script"
echo "========================================="

# 1. Check if ollama is installed
if command -v ollama &> /dev/null; then
    echo "✅ Ollama is already installed: $(ollama --version)"
else
    echo "⬇️  Ollama not found. Installing..."
    curl -fsSL https://ollama.com/install.sh | sh
    echo "✅ Ollama installed successfully: $(ollama --version)"
fi

# 2. Start ollama serve in background (accessible over network)
echo ""
echo "🚀 Starting Ollama server (listening on 0.0.0.0:11434)..."

# Kill any existing ollama serve process
pkill -f "ollama serve" 2>/dev/null || true
sleep 1

OLLAMA_HOST=0.0.0.0 ollama serve &
OLLAMA_PID=$!
sleep 3

# 3. Pull the qwen2.5:0.5b model
echo ""
echo "⬇️  Pulling qwen2.5:0.5b model..."
ollama pull qwen2.5:0.5b
echo "✅ Model qwen2.5:0.5b is ready!"

# 4. Show status
echo ""
echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo "  Ollama server PID: $OLLAMA_PID"
echo "  Endpoint: http://0.0.0.0:11434"
echo "  Model: qwen2.5:0.5b"
echo ""
echo "  To test: curl http://localhost:11434/v1/models"
echo "  To stop: kill $OLLAMA_PID"
echo "========================================="

# Keep script running so ollama serve stays alive
wait $OLLAMA_PID
