#!/bin/bash

# KPOS Production Build Script
# This script builds both the backend API and frontend for production deployment

set -e

echo "========================================="
echo "KPOS Production Build Script"
echo "========================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Check if required directories exist
if [ ! -d "APIS" ]; then
    print_error "APIS directory not found"
    exit 1
fi

if [ ! -d "kpos" ]; then
    print_error "kpos directory not found"
    exit 1
fi

# Build Backend API
echo ""
echo "Building Backend API..."
cd APIS

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing backend dependencies..."
    npm install
fi

# Build TypeScript
echo "Compiling TypeScript..."
npm run build

if [ $? -eq 0 ]; then
    print_success "Backend build completed"
else
    print_error "Backend build failed"
    exit 1
fi

cd ..

# Build Frontend
echo ""
echo "Building Frontend..."
cd kpos

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

# Build SvelteKit
echo "Building SvelteKit application..."
npm run build

if [ $? -eq 0 ]; then
    print_success "Frontend build completed"
else
    print_error "Frontend build failed"
    exit 1
fi

cd ..

# Summary
echo ""
echo "========================================="
echo "Build Summary"
echo "========================================="
print_success "Backend: APIS/dist/"
print_success "Frontend: kpos/build/"
echo ""
echo "Next steps:"
echo "1. Configure environment variables (copy env.example to .env)"
echo "2. Set up PostgreSQL, Redis, and RabbitMQ"
echo "3. Run database migrations: cd APIS && npm run db:push"
echo "4. Start backend: cd APIS && npm run start:prod"
echo "5. Configure nginx with nginx.conf"
echo "6. Copy frontend build to nginx: sudo cp -r kpos/build/* /var/www/kpos/"
echo ""
print_success "Production build completed successfully!"
