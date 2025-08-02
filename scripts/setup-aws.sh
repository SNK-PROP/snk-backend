#!/bin/bash

# AWS Setup Script for SNK Backend
# This script sets up the AWS infrastructure required for the application

set -e

ENVIRONMENT_NAME=${1:-snk}
AWS_REGION=${AWS_REGION:-us-east-1}
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "🏗️  Setting up AWS infrastructure for SNK Backend"
echo "📍 AWS Region: $AWS_REGION"
echo "🔢 AWS Account ID: $AWS_ACCOUNT_ID"
echo "🏷️  Environment Name: $ENVIRONMENT_NAME"

# Check if required tools are installed
command -v aws >/dev/null 2>&1 || { echo "❌ AWS CLI is required but not installed. Aborting." >&2; exit 1; }

# Create CloudFormation stack for infrastructure
echo "☁️  Creating CloudFormation stack..."
aws cloudformation create-stack \
    --stack-name ${ENVIRONMENT_NAME}-infrastructure \
    --template-body file://aws/cloudformation-infrastructure.yaml \
    --parameters ParameterKey=EnvironmentName,ParameterValue=$ENVIRONMENT_NAME \
    --capabilities CAPABILITY_IAM \
    --region $AWS_REGION

echo "⏳ Waiting for CloudFormation stack to complete..."
aws cloudformation wait stack-create-complete \
    --stack-name ${ENVIRONMENT_NAME}-infrastructure \
    --region $AWS_REGION

# Get stack outputs
echo "📋 Getting stack outputs..."
VPC_ID=$(aws cloudformation describe-stacks \
    --stack-name ${ENVIRONMENT_NAME}-infrastructure \
    --query 'Stacks[0].Outputs[?OutputKey==`VPC`].OutputValue' \
    --output text --region $AWS_REGION)

PRIVATE_SUBNETS=$(aws cloudformation describe-stacks \
    --stack-name ${ENVIRONMENT_NAME}-infrastructure \
    --query 'Stacks[0].Outputs[?OutputKey==`PrivateSubnets`].OutputValue' \
    --output text --region $AWS_REGION)

ECS_SECURITY_GROUP=$(aws cloudformation describe-stacks \
    --stack-name ${ENVIRONMENT_NAME}-infrastructure \
    --query 'Stacks[0].Outputs[?OutputKey==`ECSSecurityGroup`].OutputValue' \
    --output text --region $AWS_REGION)

LOAD_BALANCER_ARN=$(aws cloudformation describe-stacks \
    --stack-name ${ENVIRONMENT_NAME}-infrastructure \
    --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancer`].OutputValue' \
    --output text --region $AWS_REGION)

ECR_REPOSITORY_URI=$(aws cloudformation describe-stacks \
    --stack-name ${ENVIRONMENT_NAME}-infrastructure \
    --query 'Stacks[0].Outputs[?OutputKey==`ECRRepository`].OutputValue' \
    --output text --region $AWS_REGION)

echo "✅ Infrastructure stack created successfully!"
echo "🔗 VPC ID: $VPC_ID"
echo "🔗 Private Subnets: $PRIVATE_SUBNETS"
echo "🔗 ECS Security Group: $ECS_SECURITY_GROUP"
echo "🔗 Load Balancer ARN: $LOAD_BALANCER_ARN"
echo "🔗 ECR Repository: $ECR_REPOSITORY_URI"

# Create CloudWatch Log Groups
echo "📝 Creating CloudWatch log groups..."
aws logs create-log-group --log-group-name /ecs/snk-backend-dev --region $AWS_REGION || true
aws logs create-log-group --log-group-name /ecs/snk-backend-prod --region $AWS_REGION || true

# Create IAM roles if they don't exist
echo "👤 Creating IAM roles..."

# ECS Task Execution Role
cat > /tmp/ecs-task-execution-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
    --role-name ecsTaskExecutionRole \
    --assume-role-policy-document file:///tmp/ecs-task-execution-trust-policy.json \
    --region $AWS_REGION || echo "Role already exists"

aws iam attach-role-policy \
    --role-name ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy \
    --region $AWS_REGION || true

# ECS Task Role
aws iam create-role \
    --role-name ecsTaskRole \
    --assume-role-policy-document file:///tmp/ecs-task-execution-trust-policy.json \
    --region $AWS_REGION || echo "Role already exists"

# Create custom policy for S3 access
cat > /tmp/s3-access-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::snk-property-images-*",
                "arn:aws:s3:::snk-property-images-*/*"
            ]
        }
    ]
}
EOF

aws iam put-role-policy \
    --role-name ecsTaskRole \
    --policy-name S3AccessPolicy \
    --policy-document file:///tmp/s3-access-policy.json \
    --region $AWS_REGION || true

# Create S3 buckets
echo "🪣 Creating S3 buckets..."
aws s3 mb s3://snk-property-images-dev --region $AWS_REGION || echo "Bucket already exists"
aws s3 mb s3://snk-property-images-prod --region $AWS_REGION || echo "Bucket already exists"

# Set bucket policies for public read access to images
cat > /tmp/s3-bucket-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::snk-property-images-dev/*"
        }
    ]
}
EOF

aws s3api put-bucket-policy \
    --bucket snk-property-images-dev \
    --policy file:///tmp/s3-bucket-policy.json || true

# Update policy for prod bucket
sed 's/snk-property-images-dev/snk-property-images-prod/g' /tmp/s3-bucket-policy.json > /tmp/s3-bucket-policy-prod.json
aws s3api put-bucket-policy \
    --bucket snk-property-images-prod \
    --policy file:///tmp/s3-bucket-policy-prod.json || true

# Create Target Groups for Load Balancer
echo "🎯 Creating target groups..."
TARGET_GROUP_DEV_ARN=$(aws elbv2 create-target-group \
    --name snk-backend-dev-tg \
    --protocol HTTP \
    --port 5000 \
    --vpc-id $VPC_ID \
    --health-check-path /api/health \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 5 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --target-type ip \
    --region $AWS_REGION \
    --query 'TargetGroups[0].TargetGroupArn' --output text) || echo "Target group may already exist"

TARGET_GROUP_PROD_ARN=$(aws elbv2 create-target-group \
    --name snk-backend-prod-tg \
    --protocol HTTP \
    --port 5000 \
    --vpc-id $VPC_ID \
    --health-check-path /api/health \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 5 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --target-type ip \
    --region $AWS_REGION \
    --query 'TargetGroups[0].TargetGroupArn' --output text) || echo "Target group may already exist"

# Clean up temporary files
rm -f /tmp/ecs-task-execution-trust-policy.json
rm -f /tmp/s3-access-policy.json
rm -f /tmp/s3-bucket-policy.json
rm -f /tmp/s3-bucket-policy-prod.json

echo "🎉 AWS setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Update the ECS task definition files with your actual AWS Account ID"
echo "2. Create secrets in AWS Secrets Manager for sensitive environment variables"
echo "3. Create ECS services using the AWS CLI or console"
echo "4. Configure listeners on the Application Load Balancer"
echo "5. Set up domain name and SSL certificate (optional)"
echo ""
echo "🔧 Useful commands:"
echo "   Deploy dev:  ./scripts/deploy.sh dev"
echo "   Deploy prod: ./scripts/deploy.sh prod"