#!/bin/bash

# Heroku Deployment Script for SNK Backend

set -e

echo "🚀 SNK Backend Heroku Deployment"

# Check if Heroku CLI is installed
if ! command -v heroku &> /dev/null; then
    echo "❌ Heroku CLI not found. Install it first:"
    echo "https://devcenter.heroku.com/articles/heroku-cli"
    exit 1
fi

# Login to Heroku (if not already logged in)
heroku auth:whoami || heroku login

# Create Heroku app
APP_NAME="snk-backend-$(date +%s)"
echo "📱 Creating Heroku app: $APP_NAME"
heroku create $APP_NAME --region eu

# Set environment variables
echo "🔧 Setting environment variables..."
heroku config:set NODE_ENV=production -a $APP_NAME
heroku config:set MONGODB_URI="mongodb+srv://admin:admin@cluster0.zist3g3.mongodb.net/snk-prod" -a $APP_NAME
heroku config:set JWT_SECRET="secure_jwt_secret_for_production" -a $APP_NAME
heroku config:set AWS_ACCESS_KEY_ID="AKIAUAGWCAYYYPM6AQGR" -a $APP_NAME
heroku config:set AWS_SECRET_ACCESS_KEY="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" -a $APP_NAME
heroku config:set AWS_REGION="eu-north-1" -a $APP_NAME
heroku config:set S3_BUCKET_NAME="snk-prop" -a $APP_NAME

# Deploy to Heroku
echo "🚀 Deploying to Heroku..."
git add -A
git commit -m "Deploy to Heroku" || echo "No changes to commit"
heroku git:remote -a $APP_NAME
git push heroku main

echo "✅ Deployment completed!"
echo "🌐 Your app is available at: https://$APP_NAME.herokuapp.com"
echo "🔍 Health check: https://$APP_NAME.herokuapp.com/api/health"