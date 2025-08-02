# SNK Backend AWS Deployment Guide

This guide provides complete steps to deploy your SNK backend to AWS with separate development and production environments.

## 🏗️ Architecture Overview

- **ECS Fargate**: Containerized application hosting
- **Application Load Balancer**: Traffic distribution and SSL termination
- **ECR**: Container image registry
- **S3**: File storage for property images
- **CloudWatch**: Logging and monitoring
- **Secrets Manager**: Secure environment variable storage

## 📋 Prerequisites

1. **AWS CLI** installed and configured
2. **Docker** installed
3. **Git** repository set up
4. **AWS Account** with appropriate permissions

## 🚀 Step-by-Step Deployment

### Step 1: Configure AWS CLI

```bash
aws configure
# Enter your AWS Access Key ID, Secret Access Key, and Region (us-east-1)
```

### Step 2: Set Up AWS Infrastructure

Run the infrastructure setup script:

```bash
./scripts/setup-aws.sh
```

This creates:
- VPC with public/private subnets
- ECS Cluster
- Application Load Balancer
- ECR Repository
- S3 Buckets
- IAM Roles
- Security Groups

### Step 3: Configure Environment Variables

1. **Update Environment Files**: 
   - Copy `.env.example` to create your environment files
   - Update `.env.development` and `.env.production` with your values

2. **Create AWS Secrets Manager Secrets**:

```bash
# Development secrets
aws secretsmanager create-secret --name "snk-backend-dev/mongodb-uri" --secret-string "your-dev-mongodb-uri"
aws secretsmanager create-secret --name "snk-backend-dev/jwt-secret" --secret-string "your-dev-jwt-secret"
aws secretsmanager create-secret --name "snk-backend-dev/aws-access-key-id" --secret-string "your-aws-access-key"
aws secretsmanager create-secret --name "snk-backend-dev/aws-secret-access-key" --secret-string "your-aws-secret-key"

# Production secrets (repeat with prod values)
aws secretsmanager create-secret --name "snk-backend-prod/mongodb-uri" --secret-string "your-prod-mongodb-uri"
aws secretsmanager create-secret --name "snk-backend-prod/jwt-secret" --secret-string "your-prod-jwt-secret"
aws secretsmanager create-secret --name "snk-backend-prod/aws-access-key-id" --secret-string "your-aws-access-key"
aws secretsmanager create-secret --name "snk-backend-prod/aws-secret-access-key" --secret-string "your-aws-secret-key"
```

### Step 4: Update Task Definitions

Replace `YOUR_ACCOUNT_ID` in the ECS task definition files:

```bash
# Get your AWS Account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Update task definition files
sed -i "s/YOUR_ACCOUNT_ID/$AWS_ACCOUNT_ID/g" aws/ecs-task-definition-dev.json
sed -i "s/YOUR_ACCOUNT_ID/$AWS_ACCOUNT_ID/g" aws/ecs-task-definition-prod.json
```

### Step 5: Create ECS Services

```bash
# Create development service
aws ecs create-service \
  --cluster snk-cluster \
  --service-name snk-backend-dev \
  --task-definition snk-backend-dev \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=DISABLED}" \
  --load-balancers targetGroupArn=arn:aws:elasticloadbalancing:us-east-1:ACCOUNT:targetgroup/snk-backend-dev-tg/xxx,containerName=snk-backend-dev,containerPort=5000

# Create production service (similar to dev)
aws ecs create-service \
  --cluster snk-cluster \
  --service-name snk-backend-prod \
  --task-definition snk-backend-prod \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=DISABLED}" \
  --load-balancers targetGroupArn=arn:aws:elasticloadbalancing:us-east-1:ACCOUNT:targetgroup/snk-backend-prod-tg/xxx,containerName=snk-backend-prod,containerPort=5000
```

### Step 6: Configure Load Balancer Listeners

```bash
# Get Load Balancer ARN
LB_ARN=$(aws cloudformation describe-stacks --stack-name snk-infrastructure --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancer`].OutputValue' --output text)

# Create listeners for dev (port 80)
aws elbv2 create-listener \
  --load-balancer-arn $LB_ARN \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=TARGET_GROUP_DEV_ARN

# Create listeners for prod (port 443, requires SSL certificate)
aws elbv2 create-listener \
  --load-balancer-arn $LB_ARN \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=YOUR_SSL_CERT_ARN \
  --default-actions Type=forward,TargetGroupArn=TARGET_GROUP_PROD_ARN
```

### Step 7: Deploy Your Application

```bash
# Deploy to development
./scripts/deploy.sh dev

# Deploy to production
./scripts/deploy.sh prod
```

## 🔄 CI/CD Setup (GitHub Actions)

The repository includes GitHub Actions workflow for automated deployments:

1. **Set up GitHub Secrets**:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_ACCOUNT_ID`

2. **Branch Strategy**:
   - Push to `develop` branch → deploys to development
   - Push to `main` branch → deploys to production

## 🌐 Environment URLs

After deployment, your APIs will be available at:

- **Development**: `http://your-alb-dns-name/api/`
- **Production**: `https://your-domain.com/api/` (with SSL)

## 📊 Monitoring and Logs

### CloudWatch Logs
```bash
# View logs
aws logs tail /ecs/snk-backend-dev --follow
aws logs tail /ecs/snk-backend-prod --follow
```

### Health Checks
- **Development**: `http://your-alb-dns-name/api/health`
- **Production**: `https://your-domain.com/api/health`

## 🔧 Maintenance Commands

### Scale Services
```bash
# Scale development to 2 tasks
aws ecs update-service --cluster snk-cluster --service snk-backend-dev --desired-count 2

# Scale production to 3 tasks
aws ecs update-service --cluster snk-cluster --service snk-backend-prod --desired-count 3
```

### Update Environment Variables
```bash
# Update a secret
aws secretsmanager update-secret --secret-id "snk-backend-prod/jwt-secret" --secret-string "new-secret-value"

# Force new deployment to pick up changes
aws ecs update-service --cluster snk-cluster --service snk-backend-prod --force-new-deployment
```

### View Service Status
```bash
aws ecs describe-services --cluster snk-cluster --services snk-backend-dev snk-backend-prod
```

## 🛡️ Security Best Practices

1. **Use HTTPS in production** with SSL certificates
2. **Rotate secrets regularly** in AWS Secrets Manager
3. **Enable VPC Flow Logs** for network monitoring
4. **Set up CloudWatch alarms** for error rates and resource usage
5. **Use least privilege IAM policies**
6. **Enable GuardDuty** for threat detection

## 💰 Cost Optimization

1. **Use Fargate Spot** for development (already configured)
2. **Set up auto-scaling** based on CPU/memory usage
3. **Use lifecycle policies** for ECR images (already configured)
4. **Monitor costs** with AWS Cost Explorer

## 🔍 Troubleshooting

### Common Issues

1. **Task failing to start**:
   ```bash
   aws ecs describe-tasks --cluster snk-cluster --tasks TASK_ARN
   ```

2. **Health check failures**:
   - Check if `/api/health` endpoint is accessible
   - Verify security group allows traffic on port 5000

3. **Image pull errors**:
   - Ensure ECR repository exists and has images
   - Check IAM permissions for ECS task execution role

4. **Database connection issues**:
   - Verify MongoDB URI in Secrets Manager
   - Check network connectivity from private subnets

### Logs and Debugging
```bash
# Check CloudWatch logs
aws logs describe-log-streams --log-group-name /ecs/snk-backend-dev

# Get task definition details
aws ecs describe-task-definition --task-definition snk-backend-dev

# Check service events
aws ecs describe-services --cluster snk-cluster --services snk-backend-dev --query 'services[0].events'
```

## 📞 Support

For issues:
1. Check CloudWatch logs first
2. Verify AWS service status
3. Review task definition and service configuration
4. Check GitHub Actions workflow logs for CI/CD issues

---

## 🎯 Quick Reference

| Environment | Branch | ECS Service | Target Group | Port |
|-------------|--------|-------------|--------------|------|
| Development | develop | snk-backend-dev | snk-backend-dev-tg | 80 |
| Production | main | snk-backend-prod | snk-backend-prod-tg | 443 |

| Resource | Name Pattern |
|----------|-------------|
| ECS Cluster | snk-cluster |
| ECR Repository | snk-backend |
| Load Balancer | snk-ALB |
| S3 Buckets | snk-property-images-{dev/prod} |
| CloudWatch Logs | /ecs/snk-backend-{dev/prod} |