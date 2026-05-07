#!/bin/bash
cd /home/z/my-project
while true; do
  echo "Starting Next.js dev server... $(date)"
  node node_modules/.bin/next dev -p 3000 2>&1
  echo "Server exited with code $?, restarting in 2s... $(date)"
  sleep 2
done
