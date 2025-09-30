#!/usr/bin/env bash
set -euo pipefail

# Config
ACCOUNT_ID=${ACCOUNT_ID:-590184001652}
REGION=${REGION:-us-east-1}
REPO_NAME=${REPO_NAME:-arch-ide/rust-server}
IMAGE_URI="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME"

echo "[+] Using account: $ACCOUNT_ID region: $REGION repo: $REPO_NAME"

# Ensure repo exists
aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$REGION" >/dev/null 2>&1 || \
  aws ecr create-repository --repository-name "$REPO_NAME" --image-scanning-configuration scanOnPush=true --region "$REGION" >/dev/null

# Login to ECR
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

# Buildx for linux/amd64
docker buildx create --use >/dev/null 2>&1 || true

GIT_SHA=$(git rev-parse --short HEAD)
TAGS=("latest" "$GIT_SHA")

echo "[+] Building arch-ide rust-server image for linux/amd64..."
docker buildx build \
  --platform linux/amd64 \
  -t "$IMAGE_URI:latest" \
  -t "$IMAGE_URI:$GIT_SHA" \
  ./rust-server \
  --push

echo "[+] Pushed tags: ${TAGS[*]} to $IMAGE_URI"
echo "IMAGE_URI=$IMAGE_URI:$GIT_SHA"
