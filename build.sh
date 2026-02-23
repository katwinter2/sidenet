#!/bin/bash
# Build script: copies index.html to dist/ and injects Firebase env vars

mkdir -p dist

sed \
  -e "s|__FIREBASE_API_KEY__|${FIREBASE_API_KEY}|g" \
  -e "s|__FIREBASE_AUTH_DOMAIN__|${FIREBASE_AUTH_DOMAIN}|g" \
  -e "s|__FIREBASE_DATABASE_URL__|${FIREBASE_DATABASE_URL}|g" \
  -e "s|__FIREBASE_PROJECT_ID__|${FIREBASE_PROJECT_ID}|g" \
  -e "s|__FIREBASE_STORAGE_BUCKET__|${FIREBASE_STORAGE_BUCKET}|g" \
  -e "s|__FIREBASE_MESSAGING_SENDER_ID__|${FIREBASE_MESSAGING_SENDER_ID}|g" \
  -e "s|__FIREBASE_APP_ID__|${FIREBASE_APP_ID}|g" \
  index.html > dist/index.html
