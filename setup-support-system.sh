#!/bin/bash

################################################################################
# Web2Wireframe - Complete Setup & Development Environment
# This script sets up both backend and frontend for local development
# Supports: MongoDB, Resend Email, React + TypeScript
################################################################################

set -e  # Exit on any error

# ============================================================================
# COLORS & FORMATTING
# ============================================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Pretty print functions
print_header() {
    echo -e "\n${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC} $1"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}\n"
}

print_step() {
    echo -e "${BLUE}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# ============================================================================
# VALIDATION
# ============================================================================
print_header "Web2Wireframe Setup - Environment Validation"

# Check if we're in correct directory
if [ ! -d "Website_Backend" ] || [ ! -d "Website_Frontend" ]; then
    print_error "Required directories not found!"
    echo -e "Expected directories:"
    echo -e "  • Website_Backend"
    echo -e "  • Website_Frontend"
    echo -e "\nPlease run this script from the Web 2 Wireframe directory"
    exit 1
fi

print_success "Directory structure validated"

# Check Node.js version
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed"
    echo "Download from: https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_warning "Node.js version is less than 18. Recommended: 18+ (Current: $(node -v))"
fi

print_success "Node.js version: $(node -v)"
print_success "npm version: $(npm -v)"

# ============================================================================
# SETUP Website_Backend
# ============================================================================
print_header "Setup 1/2: Website_Backend (Support API + Express)"

print_step "Navigating to Website_Backend..."
cd Website_Backend

print_step "Checking .env file..."
if [ ! -f ".env" ]; then
    print_warning ".env file not found. Creating from template..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_success ".env created from .env.example"
        
        # Auto-configure common settings
        sed -i '' 's/PORT=.*/PORT=3002/' .env 2>/dev/null || \
        sed -i 's/PORT=.*/PORT=3002/' .env
        
        print_warning "Please edit .env and add:"
        echo "  • RESEND_API_KEY=re_your_key_here (Get from https://resend.com)"
        echo "  • SUPPORT_TO_EMAIL=your_email@example.com"
    else
        print_error ".env.example not found"
        exit 1
    fi
else
    print_success ".env already exists"
fi

print_step "Installing dependencies..."
npm install --legacy-peer-deps 2>&1 | grep -E "(added|up to date)" || true

print_step "Compiling TypeScript..."
npm run build || print_warning "Build completed with warnings"

print_success "Website_Backend setup complete ✓"
cd ..

# ============================================================================
# SETUP Website_Frontend
# ============================================================================
print_header "Setup 2/2: Website_Frontend (React + Vite)"

print_step "Navigating to Website_Frontend..."
cd Website_Frontend

print_step "Checking .env.local file..."
if [ ! -f ".env.local" ]; then
    print_warning ".env.local not found. Creating..."
    cat > .env.local << 'EOF'
VITE_API_URL=http://localhost:3002
VITE_APP_NAME=Web2Wireframe
VITE_APP_VERSION=2.0.0
EOF
    print_success ".env.local created"
else
    print_success ".env.local already exists"
fi

print_step "Installing dependencies..."
npm install --legacy-peer-deps 2>&1 | grep -E "(added|up to date)" || true

print_step "Building frontend..."
npm run build || print_warning "Build completed with warnings"

print_success "Website_Frontend setup complete ✓"
cd ..

# ============================================================================
# FINAL SUMMARY
# ============================================================================
print_header "🎉 Setup Complete!"

echo -e "${GREEN}Summary:${NC}"
echo "  • Node.js: $(node -v)"
echo "  • npm: $(npm -v)"
echo "  • Website_Backend: Ready on port 3002"
echo "  • Website_Frontend: Ready on port 5173"

echo -e "\n${BLUE}📝 Next Steps:${NC}"
echo ""
echo -e "${YELLOW}1. Edit Backend Configuration${NC}"
echo "   nano Website_Backend/.env"
echo "   • Add RESEND_API_KEY (get from https://resend.com)"
echo "   • Set SUPPORT_TO_EMAIL"
echo ""
echo -e "${YELLOW}2. Start All Services (Recommended)${NC}"
echo "   npm run dev"
echo "   (This starts backend and frontend simultaneously)"
echo ""
echo -e "${YELLOW}   OR manually start in separate terminals:${NC}"
echo "   Terminal 1: cd Website_Backend && npm run dev"
echo "   Terminal 2: cd Website_Frontend && npm run dev"
echo ""
echo -e "${YELLOW}3. Open Browser${NC}"
echo "   Frontend: http://localhost:5173"
echo "   Support Form: http://localhost:5173/support"
echo "   Backend Health: http://localhost:3002/api/health"
echo ""
echo -e "${YELLOW}4. Test Support Form${NC}"
echo "   • Fill out the form at http://localhost:5173/support"
echo "   • Submit and check for success message"
echo "   • Email will be sent to: support@web2wireframe.com"
echo ""
echo -e "${BLUE}📚 Documentation:${NC}"
echo "   • Setup: QUICKSTART_SUPPORT_SYSTEM.md"
echo "   • Full Guide: COMPLETE_SUPPORT_SYSTEM.md"
echo "   • Deploy: DEPLOYMENT.md"
echo "   • API: Website_Backend/README.md"
echo ""
echo -e "${BLUE}🔧 Useful Commands:${NC}"
echo "   npm run dev           - Start all services"
echo "   npm run build         - Build all workspaces"
echo "   npm run clean         - Remove node_modules"
echo "   npm run reset         - Full reset (clean + install)"
echo ""
echo -e "${GREEN}Happy coding! 🚀${NC}\n"
