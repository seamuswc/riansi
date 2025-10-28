#!/bin/bash

SERVER_IP="68.183.185.81"
MINI_APP_DIR="/opt/ton-connect-mini-app"

echo "🚀 Deploying TON Connect Mini App to $SERVER_IP"

# Create deployment package
echo "📦 Creating Mini App package..."
tar -czf mini-app.tar.gz mini-app/

# Upload to server
echo "📤 Uploading Mini App to server..."
scp mini-app.tar.gz root@$SERVER_IP:/tmp/

# Deploy on server
echo "🔧 Deploying Mini App on server..."
ssh root@$SERVER_IP << 'EOF'
    # Create directory
    mkdir -p /opt/ton-connect-mini-app
    
    # Extract files
    cd /opt/ton-connect-mini-app
    tar -xzf /tmp/mini-app.tar.gz --strip-components=1
    
    # Install dependencies
    npm install
    
    # Create systemd service
    cat > /etc/systemd/system/ton-connect-mini-app.service << 'SERVICE_EOF'
[Unit]
Description=TON Connect Mini App
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ton-connect-mini-app
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
SERVICE_EOF

    # Enable and start service
    systemctl daemon-reload
    systemctl enable ton-connect-mini-app
    systemctl restart ton-connect-mini-app
    
    # Check status
    systemctl status ton-connect-mini-app --no-pager
EOF

# Clean up
rm mini-app.tar.gz

echo "✅ Mini App deployment completed!"
echo "🌐 Mini App URL: http://$SERVER_IP:3001"
echo "📱 Health check: http://$SERVER_IP:3001/health"
