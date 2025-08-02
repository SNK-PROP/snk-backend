#!/bin/bash

# Simple EC2 Deployment Script for SNK Backend
# This deploys the app to an existing EC2 instance

set -e

echo "🚀 SNK Backend EC2 Deployment"

# Build the application
echo "📦 Building application..."
npm install --production

# Create deployment package
echo "📦 Creating deployment package..."
tar -czf snk-backend.tar.gz \
  --exclude='node_modules/.cache' \
  --exclude='.git' \
  --exclude='aws' \
  --exclude='*.log' \
  app.js package.json routes/ models/ config/ middleware/ services/ .env.production

echo "✅ Deployment package created: snk-backend.tar.gz"
echo ""
echo "📋 Next steps for EC2 deployment:"
echo "1. Upload snk-backend.tar.gz to your EC2 instance"
echo "2. Extract: tar -xzf snk-backend.tar.gz"
echo "3. Install dependencies: npm install --production"
echo "4. Set environment: export NODE_ENV=production"
echo "5. Start application: npm start"
echo ""
echo "🌐 Your app will be available at http://your-ec2-ip:5000"