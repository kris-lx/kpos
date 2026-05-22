# KPOS Production Build Script (Windows PowerShell)
# This script builds both the backend API and frontend for production deployment

$ErrorActionPreference = "Stop"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "KPOS Production Build Script" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

# Check if required directories exist
if (-not (Test-Path "APIS")) {
    Write-Error "APIS directory not found"
    exit 1
}

if (-not (Test-Path "kpos")) {
    Write-Error "kpos directory not found"
    exit 1
}

# Build Backend API
Write-Host ""
Write-Host "Building Backend API..." -ForegroundColor Cyan
Push-Location APIS

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing backend dependencies..."
    npm install
}

# Build TypeScript
Write-Host "Compiling TypeScript..."
npm run build

if ($LASTEXITCODE -eq 0) {
    Write-Success "Backend build completed"
} else {
    Write-Error "Backend build failed"
    Pop-Location
    exit 1
}

Pop-Location

# Build Frontend
Write-Host ""
Write-Host "Building Frontend..." -ForegroundColor Cyan
Push-Location kpos

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing frontend dependencies..."
    npm install
}

# Build SvelteKit
Write-Host "Building SvelteKit application..."
npm run build

if ($LASTEXITCODE -eq 0) {
    Write-Success "Frontend build completed"
} else {
    Write-Error "Frontend build failed"
    Pop-Location
    exit 1
}

Pop-Location

# Summary
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Build Summary" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Success "Backend: APIS/dist/"
Write-Success "Frontend: kpos/build/"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Configure environment variables (copy env.example to .env)"
Write-Host "2. Set up PostgreSQL, Redis, and RabbitMQ"
Write-Host "3. Run database migrations: cd APIS; npm run db:push"
Write-Host "4. Start backend: cd APIS; npm run start:prod"
Write-Host "5. Configure nginx with nginx.conf"
Write-Host "6. Copy frontend build to nginx: sudo cp -r kpos/build/* /var/www/kpos/"
Write-Host ""
Write-Success "Production build completed successfully!"
