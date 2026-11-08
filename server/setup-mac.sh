#!/bin/bash
# One-time server setup on macOS. Run from anywhere:
#   bash ~/Documents/Projects/student-score-prediction/server/setup-mac.sh
#
# 1. Makes sure MySQL is installed (Homebrew) and running
# 2. Creates .env from .env.example if missing
# 3. npm install, creates the database + tables, adds demo data
set -e
cd "$(dirname "$0")"

mysql_up() { nc -z 127.0.0.1 3306 >/dev/null 2>&1; }

echo "== 1/3 MySQL"
if mysql_up; then
  echo "MySQL is already running on port 3306."
elif [ -x /usr/local/mysql/bin/mysqld ]; then
  echo "MySQL from the official installer is installed but not running."
  echo "Start it in System Settings -> MySQL -> Start MySQL Server, then run this script again."
  exit 1
else
  if ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew is not installed. Install it from https://brew.sh, then run this script again."
    exit 1
  fi
  FORMULA=$(brew list --formula 2>/dev/null | grep -E '^mysql(@[0-9.]+)?$' | head -1 || true)
  if [ -z "$FORMULA" ]; then
    echo "Installing MySQL with Homebrew (takes a few minutes)..."
    if brew install mysql@8.0; then FORMULA=mysql@8.0
    else
      echo "mysql@8.0 not available, trying mysql@8.4..."
      brew install mysql@8.4 && FORMULA=mysql@8.4
    fi
  fi
  echo "Starting $FORMULA..."
  brew services start "$FORMULA"
  for _ in $(seq 1 30); do mysql_up && break; sleep 1; done
  if ! mysql_up; then
    echo "MySQL did not start. Check: brew services list"
    exit 1
  fi
  echo "MySQL is running."
fi

echo "== 2/3 .env"
if [ -f .env ]; then
  echo ".env already exists, leaving it as is."
else
  cp .env.example .env
  echo "Created .env (user root, empty password = Homebrew's default)."
fi

echo "== 3/3 install, database, demo data"
npm install
npm run db:init
npm run seed

echo
echo "Setup done. Now start the API:"
echo "  cd $(pwd) && npm run dev"
echo "and in a second Terminal window, the client:"
echo "  cd $(cd ../client && pwd) && npm install && npm start"
echo "then open http://localhost:3000"
