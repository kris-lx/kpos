# KPOS Production Deployment Guide

This guide covers deploying KPOS to production environments using local builds and nginx.

## Prerequisites

- Node.js 20+ and npm
- PostgreSQL 14+
- Redis 7+
- RabbitMQ 3.12+
- Nginx 1.24+
- PM2 (for process management)

## Environment Setup

### 1. Clone the Repository

```bash
git clone https://github.com/kris-lx/kpos.git
cd kpos_v2
```

### 2. Configure Environment Variables

#### Backend (APIS)

```bash
cd APIS
cp env.example .env
# Edit .env with your production values
```

Required environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Strong random secret for JWT signing
- `REDIS_URL` - Redis connection string
- `RABBITMQ_URL` - RabbitMQ connection string
- `BREVO_API_KEY` - Email service API key
- `CLOUDINARY_*` - Cloudinary credentials for file storage

#### Frontend (kpos)

```bash
cd kpos
cp env.example .env
# Edit .env with your production values
```

Required environment variables:
- `VITE_API_BASE_URL` - Backend API URL
- `VITE_WS_URL` - WebSocket URL for real-time features

## Building for Production

### Build Backend API

```bash
cd APIS
npm install
npm run build
```

This compiles TypeScript to the `dist/` directory.

### Build Frontend

```bash
cd kpos
npm install
npm run build
```

This creates a production build in `kpos/build/`.

## Database Setup

### Run Migrations

```bash
cd APIS
npm run db:push
```

### Seed Initial Data (Optional)

```bash
npm run db:seed
```

## Running in Production

### Using PM2 (Recommended)

Install PM2 globally:
```bash
npm install -g pm2
```

Create PM2 ecosystem file `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'kpos-api',
      script: './dist/index.js',
      cwd: './APIS',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};
```

Start the application:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Manual Start

```bash
cd APIS
NODE_ENV=production node dist/index.js
```

## Nginx Configuration

1. Copy the nginx configuration:
```bash
sudo cp nginx.conf /etc/nginx/sites-available/kpos
sudo ln -s /etc/nginx/sites-available/kpos /etc/nginx/sites-enabled/
```

2. Update SSL certificate paths in the configuration:
```bash
sudo nano /etc/nginx/sites-available/kpos
```

3. Test and reload nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

4. Obtain SSL certificates (Let's Encrypt):
```bash
sudo certbot --nginx -d kpos.la -d www.kpos.la
```

## Deploying Frontend Static Files

```bash
# Copy built frontend to nginx directory
sudo cp -r kpos/build/* /var/www/kpos/
sudo chown -R www-data:www-data /var/www/kpos
```

## Monitoring

### PM2 Monitoring

```bash
pm2 monit
pm2 logs kpos-api
```

### Nginx Logs

```bash
sudo tail -f /var/log/nginx/kpos_access.log
sudo tail -f /var/log/nginx/kpos_error.log
```

## Updates

To update the application:

```bash
# Pull latest changes
git pull

# Rebuild backend
cd APIS
npm install
npm run build

# Rebuild frontend
cd ../kpos
npm install
npm run build

# Restart PM2
pm2 restart kpos-api

# Update static files
sudo cp -r kpos/build/* /var/www/kpos/
```

## Troubleshooting

### Backend won't start
- Check database connection in `.env`
- Verify all environment variables are set
- Check logs: `pm2 logs kpos-api`

### Frontend not loading
- Verify nginx configuration is correct
- Check static files are in `/var/www/kpos/`
- Check nginx error logs

### WebSocket connection issues
- Verify `VITE_WS_URL` is correct
- Check nginx WebSocket proxy configuration
- Ensure RabbitMQ is running

## Security Checklist

- [ ] Change all default passwords
- [ ] Use strong JWT_SECRET
- [ ] Enable SSL/TLS
- [ ] Configure firewall rules
- [ ] Set up regular backups
- [ ] Enable rate limiting
- [ ] Keep dependencies updated
- [ ] Monitor logs for suspicious activity
