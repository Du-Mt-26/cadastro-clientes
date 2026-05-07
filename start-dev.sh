#!/bin/bash
cd /home/z/my-project
while true; do
  echo "Starting Next.js dev server... $(date)"
  bun run dev 2>&1
  EXIT_CODE=$?
  echo "Server exited with code $EXIT_CODE, restarting in 3s... $(date)"
  sleep 3
done
