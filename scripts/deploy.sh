#!/bin/bash

# SNK Backend Deployment Script
# Usage: ./scripts/deploy.sh [dev|prod]

set -e

ENVIRONMENT=${1:-dev}
AWS_REGION=${AWS_REGION:-us-east-1}
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPOSITORY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/snk-backend"

echo "🚀 Starting deployment for environment: $ENVIRONMENT"
echo "📍 AWS Region: $AWS_REGION"
echo "🔢 AWS Account ID: $AWS_ACCOUNT_ID"

# Check if required tools are installed
command -v aws >/dev/null 2>&1 || { echo "❌ AWS CLI is required but not installed. Aborting." >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed. Aborting." >&2; exit 1; }

# Login to ECR
echo "🔐 Logging in to Amazon ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPOSITORY

# Build Docker image
echo "🔨 Building Docker image..."
docker build -t snk-backend:$ENVIRONMENT .

# Tag the image
echo "🏷️  Tagging image..."
docker tag snk-backend:$ENVIRONMENT $ECR_REPOSITORY:$ENVIRONMENT
docker tag snk-backend:$ENVIRONMENT $ECR_REPOSITORY:$ENVIRONMENT-$(date +%Y%m%d-%H%M%S)

# Push to ECR
echo "📤 Pushing image to ECR..."
docker push $ECR_REPOSITORY:$ENVIRONMENT
docker push $ECR_REPOSITORY:$ENVIRONMENT-$(date +%Y%m%d-%H%M%S)

# Update ECS service
echo "🔄 Updating ECS service..."
CLUSTER_NAME="snk-cluster"
SERVICE_NAME="snk-backend-$ENVIRONMENT"

# Register new task definition
TASK_DEFINITION_FILE="aws/ecs-task-definition-$ENVIRONMENT.json"

if [ ! -f "$TASK_DEFINITION_FILE" ]; then
    echo "❌ Task definition file not found: $TASK_DEFINITION_FILE"
    exit 1
fi

# Replace placeholders in task definition
sed "s/YOUR_ACCOUNT_ID/$AWS_ACCOUNT_ID/g" $TASK_DEFINITION_FILE > /tmp/task-def-$ENVIRONMENT.json

# Register the task definition
echo "📝 Registering task definition..."
aws ecs register-task-definition \
    --cli-input-json file:///tmp/task-def-$ENVIRONMENT.json \
    --region $AWS_REGION

# Update the service
echo "🔄 Updating ECS service..."
aws ecs update-service \
    --cluster $CLUSTER_NAME \
    --service $SERVICE_NAME \
    --task-definition snk-backend-$ENVIRONMENT \
    --region $AWS_REGION

# Wait for deployment to complete
echo "⏳ Waiting for deployment to complete..."
aws ecs wait services-stable \
    --cluster $CLUSTER_NAME \
    --services $SERVICE_NAME \
    --region $AWS_REGION

echo "✅ Deployment completed successfully!"

# Get service status
echo "📊 Service status:"
aws ecs describe-services \
    --cluster $CLUSTER_NAME \
    --services $SERVICE_NAME \
    --region $AWS_REGION \
    --query 'services[0].{Status:status,RunningCount:runningCount,DesiredCount:desiredCount,TaskDefinition:taskDefinition}'

# Clean up temporary files
rm -f /tmp/task-def-$ENVIRONMENT.json

echo "🎉 Deployment script completed!"