#!/bin/bash
# Build script: copies files to dist/ and injects Firebase env vars into JS

mkdir -p dist/css dist/js

# Copy CSS (no env vars needed)
cp css/styles.css dist/css/styles.css

# Copy index.html (no env vars in HTML anymore)
cp index.html dist/index.html

# Inject Firebase env vars into state.js, copy all other JS files as-is
for f in js/*.js; do
  filename=$(basename "$f")
  if [ "$filename" = "state.js" ]; then
    sed \
      -e "s|__FIREBASE_API_KEY__|${FIREBASE_API_KEY}|g" \
      -e "s|__FIREBASE_AUTH_DOMAIN__|${FIREBASE_AUTH_DOMAIN}|g" \
      -e "s|__FIREBASE_DATABASE_URL__|${FIREBASE_DATABASE_URL}|g" \
      -e "s|__FIREBASE_PROJECT_ID__|${FIREBASE_PROJECT_ID}|g" \
      -e "s|__FIREBASE_STORAGE_BUCKET__|${FIREBASE_STORAGE_BUCKET}|g" \
      -e "s|__FIREBASE_MESSAGING_SENDER_ID__|${FIREBASE_MESSAGING_SENDER_ID}|g" \
      -e "s|__FIREBASE_APP_ID__|${FIREBASE_APP_ID}|g" \
      "$f" > "dist/js/$filename"
  else
    cp "$f" "dist/js/$filename"
  fi
done
