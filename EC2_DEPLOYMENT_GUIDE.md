# 🖥️ SNK Backend EC2 Deployment Guide

## ✅ **Deployment Package Ready**
- **File**: `snk-backend.tar.gz` (11.7 KB)
- **Contains**: Production-ready backend code with all dependencies
- **Status**: Ready for deployment

## 🚀 **Step-by-Step EC2 Deployment**

### **Step 1: Launch EC2 Instance**

Since you don't have EC2 permissions via CLI, use the AWS Console:

1. **Go to AWS Console** → **EC2** → **Launch Instance**
2. **Choose AMI**: Ubuntu Server 22.04 LTS (Free Tier)
3. **Instance Type**: t2.micro (Free Tier) or t3.small (better performance)
4. **Key Pair**: Create or select existing key pair for SSH access
5. **Security Group**: Allow the following ports:
   - **SSH (22)**: Your IP address
   - **HTTP (80)**: 0.0.0.0/0
   - **Custom TCP (5000)**: 0.0.0.0/0 (for API access)
6. **Storage**: 8 GB (default is fine)
7. **Launch Instance**

### **Step 2: Connect to EC2 Instance**

```bash
# Replace with your actual key file and public IP
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@your-ec2-public-ip
```

### **Step 3: Prepare EC2 Instance**

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Verify installations
node --version  # Should show v18.x
npm --version
pm2 --version
```

### **Step 4: Upload Deployment Package**

**Option A: Using SCP (from your local machine)**
```bash
# From your local machine (where snk-backend.tar.gz is located)
scp -i your-key.pem snk-backend.tar.gz ubuntu@your-ec2-public-ip:~/
```

**Option B: Using wget (if you host the file somewhere)**
```bash
# On EC2 instance
wget https://your-file-host.com/snk-backend.tar.gz
```

**Option C: Using AWS S3 (upload to S3 first)**
```bash
# From local machine - upload to S3
aws s3 cp snk-backend.tar.gz s3://snk-property-images-dev/deployments/

# On EC2 instance - download from S3
aws s3 cp s3://snk-property-images-dev/deployments/snk-backend.tar.gz ./
```

### **Step 5: Deploy Application**

```bash
# Extract deployment package
tar -xzf snk-backend.tar.gz

# Install dependencies
npm install --production

# Set up environment
export NODE_ENV=production

# Start application with PM2
pm2 start app.js --name snk-backend

# Save PM2 configuration
pm2 save
pm2 startup

# Check application status
pm2 status
pm2 logs snk-backend
```

### **Step 6: Configure Reverse Proxy (Optional)**

```bash
# Install Nginx
sudo apt install nginx -y

# Create Nginx configuration
sudo tee /etc/nginx/sites-available/snk-backend << EOF
server {
    listen 80;
    server_name your-domain.com your-ec2-public-ip;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/snk-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 🔧 **Environment Configuration**

Your deployment package includes these environment settings:

```bash
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://admin:admin@cluster0.zist3g3.mongodb.net/snk-prod
AWS_REGION=eu-north-1
AWS_ACCESS_KEY_ID=AKIAUAGWCAYYYPM6AQGR
AWS_SECRET_ACCESS_KEY=Do/wcwROJXAdehULa5oN3qCqI4M3cNQcWw1iSJ+h
S3_BUCKET_NAME=snk-property-images-prod
JWT_SECRET=your_super_secure_jwt_secret_for_production_at_least_32_characters_long
```

## 🌐 **Access Your Application**

After deployment, your API will be available at:

- **Direct Access**: `http://your-ec2-public-ip:5000/api/`
- **Health Check**: `http://your-ec2-public-ip:5000/api/health`
- **With Nginx**: `http://your-ec2-public-ip/api/`

## 📊 **Monitoring & Management**

```bash
# Check application status
pm2 status

# View logs
pm2 logs snk-backend

# Restart application
pm2 restart snk-backend

# Stop application
pm2 stop snk-backend

# Monitor resources
pm2 monit
```

## 🔒 **Security Recommendations**

1. **Update Security Groups**: Only allow necessary ports
2. **Use Elastic IP**: For consistent IP address
3. **Set up SSL**: Use Let's Encrypt with Certbot
4. **Regular Updates**: Keep system and packages updated
5. **Backup Database**: Regular MongoDB backups

## 🚀 **Production Optimizations**

```bash
# Set up log rotation
pm2 install pm2-logrotate

# Configure auto-restart
pm2 startup
pm2 save

# Set up monitoring
pm2 plus  # Optional PM2 monitoring service
```

## 🆘 **Troubleshooting**

**If application won't start:**
```bash
# Check logs
pm2 logs snk-backend

# Check if port is in use
sudo lsof -i :5000

# Check environment variables
printenv | grep NODE_ENV
```

**If can't connect:**
```bash
# Check security groups in AWS Console
# Ensure port 5000 is open to 0.0.0.0/0

# Test locally on EC2
curl http://localhost:5000/api/health
```

## 📋 **Quick Command Reference**

```bash
# Deploy updates
tar -xzf snk-backend.tar.gz
npm install --production
pm2 restart snk-backend

# View status
pm2 status
pm2 logs snk-backend --lines 50

# Scale application
pm2 scale snk-backend 2  # Run 2 instances
```

---

## 🎯 **Your Next Steps**

1. **Launch EC2 instance** in AWS Console
2. **Upload deployment package** (`snk-backend.tar.gz`)
3. **Follow deployment steps** above
4. **Test your API** at `http://your-ec2-ip:5000/api/health`

**Your SNK Backend will be production-ready on EC2!** 🚀