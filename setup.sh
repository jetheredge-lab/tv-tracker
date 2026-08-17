#!/usr/bin/env bash
# ==============================================================================
# TV TRACKER - UBUNTU / LINUX AUTOMATED ENVIRONMENT SETUP & BOOTSTRAP SCRIPT
# ==============================================================================
# This script checks all required prerequisites (Node.js, npm, Docker, Docker Compose),
# prompts to install any missing tools automatically on Ubuntu/Debian,
# configures environment variables, initializes database schemas, and boots the backend.
# ==============================================================================

set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${CYAN}${BOLD}"
echo "================================================================="
echo "   📺 TV TRACKER & RECOMMENDATION ENGINE - SYSTEM SETUP         "
echo "================================================================="
echo -e "${NC}"

# Function to check command existence
has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

# 1. OS Verification
echo -e "${BLUE}[1/5] Checking Operating System...${NC}"
if [ -f /etc/os-release ]; then
  . /etc/os-release
  echo -e "  ${GREEN}✓${NC} Detected OS: ${BOLD}$NAME ($VERSION)${NC}"
else
  echo -e "  ${YELLOW}!${NC} Generic Linux system detected."
fi

# Helper to ask confirmation
ask_install() {
  local package_name="$1"
  local prompt_msg="$2"
  read -p "$(echo -e "${YELLOW}Missing ${package_name}. ${prompt_msg} [Y/n]: ${NC}")" -n 1 -r
  echo
  if [[ $REPLY =~ ^[Nn]$ ]]; then
    return 1
  fi
  return 0
}

# 2. Check & Install Prerequisites
echo -e "\n${BLUE}[2/5] Checking Prerequisites & Dependencies...${NC}"

# A. Git
if has_cmd git; then
  echo -e "  ${GREEN}✓${NC} Git is installed ($(git --version))"
else
  if ask_install "Git" "Install git using apt?"; then
    sudo apt-get update && sudo apt-get install -y git
  else
    echo -e "  ${RED}✗ Git is required. Exiting.${NC}"
    exit 1
  fi
fi

# B. Curl
if has_cmd curl; then
  echo -e "  ${GREEN}✓${NC} curl is installed"
else
  echo -e "  ${YELLOW}!${NC} Installing curl..."
  sudo apt-get update && sudo apt-get install -y curl
fi

# C. Node.js (Require Node >= 18)
NODE_OK=false
if has_cmd node; then
  NODE_VER=$(node -v | tr -d 'v' | cut -d'.' -f1)
  if [ "$NODE_VER" -ge 18 ]; then
    echo -e "  ${GREEN}✓${NC} Node.js is installed ($(node -v))"
    NODE_OK=true
  else
    echo -e "  ${YELLOW}!${NC} Node.js $(node -v) is installed, but Node.js 18+ is required."
  fi
fi

if [ "$NODE_OK" = false ]; then
  if ask_install "Node.js 20 LTS" "Install Node.js 20 LTS via NodeSource?"; then
    echo -e "  ${CYAN}Installing Node.js 20 LTS...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo -e "  ${GREEN}✓${NC} Node.js $(node -v) and npm $(npm -v) installed successfully."
  else
    echo -e "  ${RED}✗ Node.js >= 18 is required. Please install Node.js manually.${NC}"
    exit 1
  fi
fi

# D. Docker & Docker Compose
DOCKER_OK=false
if has_cmd docker; then
  echo -e "  ${GREEN}✓${NC} Docker is installed ($(docker --version))"
  DOCKER_OK=true
else
  if ask_install "Docker" "Install Docker CE on this machine?"; then
    echo -e "  ${CYAN}Installing Docker CE...${NC}"
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker "$USER" || true
    echo -e "  ${GREEN}✓${NC} Docker installed. (Note: You may need to run 'newgrp docker' or re-login for group changes to take effect)."
    DOCKER_OK=true
  else
    echo -e "  ${YELLOW}!${NC} Docker skipped. (Make sure you have an external PostgreSQL database accessible)."
  fi
fi

if has_cmd docker-compose || docker compose version >/dev/null 2>&1; then
  echo -e "  ${GREEN}✓${NC} Docker Compose is available"
else
  if [ "$DOCKER_OK" = true ]; then
    echo -e "  ${CYAN}Installing Docker Compose plugin...${NC}"
    sudo apt-get install -y docker-compose-plugin || true
  fi
fi

# 3. Environment File Configuration (.env)
echo -e "\n${BLUE}[3/5] Configuring Environment Variables...${NC}"
if [ ! -f backend/.env ]; then
  echo -e "  ${CYAN}Creating backend/.env from backend/.env.example...${NC}"
  cp backend/.env.example backend/.env

  # Generate random secure JWT Secret
  if has_cmd openssl; then
    RANDOM_JWT=$(openssl rand -hex 24)
    sed -i "s/super-secret-tvtracker-jwt-key-change-in-production/$RANDOM_JWT/g" backend/.env || true
  fi
  echo -e "  ${GREEN}✓${NC} Generated secure JWT secret in backend/.env"
else
  echo -e "  ${GREEN}✓${NC} backend/.env file already exists."
fi

# 4. Backend Dependencies & Database Setup
echo -e "\n${BLUE}[4/5] Installing Backend Packages & Preparing Database...${NC}"
cd backend

echo -e "  ${CYAN}Installing npm dependencies...${NC}"
npm install

if [ "$DOCKER_OK" = true ]; then
  echo -e "  ${CYAN}Starting PostgreSQL container via Docker Compose...${NC}"
  docker compose up -d postgres || sudo docker compose up -d postgres
  
  echo -e "  ${CYAN}Waiting for PostgreSQL to be ready...${NC}"
  sleep 4
fi

echo -e "  ${CYAN}Generating Prisma Client & Pushing Schema...${NC}"
npx prisma generate
npx prisma db push --skip-generate || true

echo -e "  ${CYAN}Building TypeScript production distribution...${NC}"
npm run build
cd ..

# 5. Launch Option
echo -e "\n${GREEN}${BOLD}=================================================================${NC}"
echo -e "${GREEN}${BOLD}   🎉 SETUP COMPLETE! TV Tracker is ready to run.               ${NC}"
echo -e "${GREEN}${BOLD}=================================================================${NC}"
echo
echo -e "To start the backend server, choose one of the following:"
echo -e "  ${BOLD}1. Run in development mode (hot reload):${NC}"
echo -e "     ${CYAN}cd backend && npm run dev${NC}"
echo
echo -e "  ${BOLD}2. Run in production mode with Docker Compose:${NC}"
echo -e "     ${CYAN}cd backend && docker compose up -d${NC}"
echo
echo -e "  ${BOLD}3. Expose via Cloudflare Tunnel over HTTPS:${NC}"
echo -e "     Set ${BOLD}CLOUDFLARE_TUNNEL_TOKEN${NC} in ${BOLD}backend/.env${NC} and run:"
echo -e "     ${CYAN}cd backend && docker compose --profile cloudflare up -d${NC}"
echo
echo -e "  ${BOLD}4. Run automated test suite:${NC}"
echo -e "     ${CYAN}cd backend && npm test${NC}"
echo
echo -e "${CYAN}Backend will listen on: ${BOLD}http://localhost:4000${NC}"
echo -e "${CYAN}Health endpoint:       ${BOLD}http://localhost:4000/api/health${NC}"
echo

read -p "$(echo -e "${YELLOW}Would you like to start the backend in background mode right now? [y/N]: ${NC}")" -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  cd backend
  if [ "$DOCKER_OK" = true ]; then
    docker compose up -d backend || sudo docker compose up -d backend
    echo -e "${GREEN}✓ TV Tracker backend container started on http://localhost:4000${NC}"
  else
    npm run start &
    echo -e "${GREEN}✓ TV Tracker backend process started on http://localhost:4000${NC}"
  fi
fi
