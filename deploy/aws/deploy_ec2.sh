#!/usr/bin/env bash
# Run this ON an Ubuntu EC2 instance (t3.medium+ recommended) after cloning the project.
# Security group: open 22 (SSH), 80 + 443 (Nginx). Everything else stays private.
# Attach an IAM role with FocusLinkAIPolicy so no keys are needed in backend/.env.
set -euo pipefail
cd "$(dirname "$0")/../.."   # repo root

sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker "$USER"

[ -f backend/.env ] || cp backend/.env.example backend/.env
echo ">> Edit backend/.env (DATABASE_URL_OVERRIDE to RDS, AWS_ENABLED=true, S3_BUCKET, SITE_URL) then press Enter"
read -r

# Using RDS (DATABASE_URL_OVERRIDE in backend/.env)? start without the local db container.
if grep -q "^DATABASE_URL_OVERRIDE=" backend/.env; then
  sudo docker compose --env-file backend/.env up -d --build --no-deps backend web nginx
else
  sudo docker compose --env-file backend/.env up -d --build
fi

IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
echo "Website + app: http://$IP/"
echo "NOTE: browsers only allow the webcam/mic on HTTPS. Point your domain at $IP and follow"
echo "      docs/PIPELINE.md step 9 (Let's Encrypt) — or use an ALB with an ACM certificate."
