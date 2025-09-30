#!/usr/bin/env bash
set -euo pipefail

REGION=${REGION:-us-east-1}
BUCKET_NAME=$1
DISTRIBUTION_ID=$2

echo "[+] Building frontend"
cd frontend
npm ci --silent || npm install --silent
npm run build --silent

echo "[+] Syncing to s3://$BUCKET_NAME"
aws s3 sync dist "s3://$BUCKET_NAME" --delete --region "$REGION" --cache-control max-age=300

echo "[+] Creating CloudFront invalidation"
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" | cat

echo "Done"
