#!/bin/bash

# Thai Learning Bot Deployment Script
# Usage: ./deploy.sh [server_ip]

SERVER_IP=${1:-"68.183.185.81"}
APP_DIR="/opt/thai-learning-bot"
SERVICE_NAME="thai-learning-bot"

echo "🚀 Deploying Thai Learning Bot to $SERVER_IP"

# Create deployment package
echo "📦 Creating deployment package..."
tar -czf thai-learning-bot.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=data \
  --exclude=*.log \
  src/ package.json .env.example

# Upload to server
echo "📤 Uploading to server..."
scp thai-learning-bot.tar.gz root@$SERVER_IP:/tmp/

# Deploy on server
echo "🔧 Deploying on server..."
ssh root@$SERVER_IP << EOF
  # Create app directory
  mkdir -p $APP_DIR
  cd $APP_DIR
  
  # Extract files
  tar -xzf /tmp/thai-learning-bot.tar.gz
  
  # Install dependencies
  npm install --production
  
  # Create data directory
  mkdir -p data
  
  # Set up environment with correct values
  cat > .env << 'EOL'
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=8053977448:AAGYMekyUQWu69XIidY99QklyopbtoMsX3s

# DeepSeek API
DEEPSEEK_API_KEY=sk-f91298950aea4fd2908881ef26ae2946

# TON Configuration
TON_ADDRESS=UQBDTEPa2TsufNyTFvpydJH07AlOt48cB7Nyq6rFZ7p6e-wt
TON_AMOUNT=1.0
SUBSCRIPTION_DAYS=30

# TON Console API Key
TON_API_KEY=AHCEM75H2E5ZTNQAAAAL6ZZYOWV5NT73AXDA6J55UBGVEFJNKPX6KEQUYYV7NNKQXD4BJPA

# Webhook Configuration
WEBHOOK_BASE_URL=http://68.183.185.81:3000

# Database
DATABASE_PATH=./data/bot.db

# Server
PORT=3000
NODE_ENV=production

# Timezone
TIMEZONE=Asia/Bangkok
EOL
  
  # Create systemd service
  cat > /etc/systemd/system/$SERVICE_NAME.service << EOL
[Unit]
Description=Thai Learning Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOL

  # Reload systemd and start service
  systemctl daemon-reload
  systemctl enable $SERVICE_NAME
  systemctl restart $SERVICE_NAME
  
  # Check status
  systemctl status $SERVICE_NAME --no-pager
  
  echo "✅ Deployment completed!"
  echo "📊 Service status:"
  systemctl is-active $SERVICE_NAME
  echo "📝 Logs: journalctl -u $SERVICE_NAME -f"
EOF

# Clean up
rm thai-learning-bot.tar.gz

echo "🎉 Deployment completed successfully!"
echo "🌐 Health check: http://$SERVER_IP:3000/health"
echo "📱 Bot should be running on Telegram"
