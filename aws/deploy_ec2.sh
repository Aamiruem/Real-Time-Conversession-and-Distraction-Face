#!/usr/bin/env bash
# Run this ON an Ubuntu EC2 instance (t3.medium+ recommended) after cloning the project.
# Security group: open 22 (SSH), 8501 (Streamlit), 8000 (API, optional).
# Attach an IAM role with FocusLinkAIPolicy so no keys are needed in .env.
set -euo pipefail

sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker "$USER"

[ -f .env ] || cp .env.example .env
echo ">> Edit .env (DATABASE_URL to RDS, AWS_ENABLED=true, S3_BUCKET) then press Enter"
read -r

# Using RDS? run only backend + frontend; otherwise compose also starts local Postgres.
sudo docker compose up -d --build backend frontend

echo "Frontend: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):8501"
echo "NOTE: browsers only allow the webcam on HTTPS or localhost. Put the app behind an"
echo "      Application Load Balancer / Nginx with an ACM or Let's Encrypt certificate."
