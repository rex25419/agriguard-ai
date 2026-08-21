#!/bin/bash
while true; do
  echo "Starting RPC tunnel..."
  npx localtunnel --port 8545 --subdomain agriguard-rpc &
  RPC_PID=$!
  echo "Starting Frontend tunnel..."
  npx localtunnel --port 5173 --subdomain agriguard-frontend &
  FRONT_PID=$!
  
  sleep 3600 # Restart every hour to prevent timeouts
  kill $RPC_PID
  kill $FRONT_PID
done
