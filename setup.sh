#!/usr/bin/env bash
set -e
command -v node >/dev/null || { echo 'Node.js is required'; exit 1; }
command -v npm >/dev/null || { echo 'npm is required'; exit 1; }
command -v gcc >/dev/null || { echo 'GCC is required'; exit 1; }
command -v python3 >/dev/null || { echo 'Python 3 is required'; exit 1; }
command -v javac >/dev/null || { echo 'JDK (javac) is required'; exit 1; }
command -v java >/dev/null || { echo 'Java runtime is required'; exit 1; }
[ -f .env ] || cp .env.example .env
npm install
chmod +x start.sh setup.sh
echo 'Setup complete. Run ./start.sh'
