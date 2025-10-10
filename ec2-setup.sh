#!/bin/bash

# SNK Backend EC2 Setup Script
# Run this script on your EC2 instance

set -e

echo "🚀 SNK Backend EC2 Setup"
echo "========================"

# Check if running as ubuntu user
if [ "$USER" != "ubuntu" ]; then
    echo "⚠️  This script should be run as the ubuntu user"
fi

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
echo "📦 Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install AWS CLI (for downloading deployment package)
echo "📦 Installing AWS CLI..."
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
rm -rf aws awscliv2.zip

# Configure AWS CLI (you'll need to do this manually)
echo "🔧 Configuring AWS CLI..."
echo "Run: aws configure"
echo "Enter:"
echo "  AWS Access Key ID: AKIAUAGWCAYYYPM6AQGR"
echo "  AWS Secret Access Key: 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"
echo "  Default region: us-east-1"
echo "  Default output format: json"

# Download deployment package from S3
echo "📥 Downloading deployment package..."
aws s3 cp s3://snk-property-images-dev/deployments/snk-backend.tar.gz ./

# Extract and set up application
echo "📦 Setting up application..."
tar -xzf snk-backend.tar.gz
npm install --production

# Set up environment
echo "🔧 Setting up environment..."
export NODE_ENV=production

# Start application with PM2
echo "🚀 Starting application..."
pm2 start app.js --name snk-backend

# Save PM2 configuration
pm2 save
pm2 startup

echo "✅ Setup completed!"
echo ""
echo "📊 Application Status:"
pm2 status

echo ""
echo "🌐 Your API is available at:"
echo "  Health Check: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):5000/api/health"
echo "  API Base URL: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):5000/api/"

echo ""
echo "📋 Useful commands:"
echo "  pm2 status          - Check application status"
echo "  pm2 logs snk-backend - View application logs"
echo "  pm2 restart snk-backend - Restart application"
echo "  pm2 monit           - Monitor resources"