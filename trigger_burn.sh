#!/bin/bash
source /tmp/cc-agent/61154910/project/.env
curl -X POST "${VITE_SUPABASE_URL}/functions/v1/burn-event-indexer" \
  -H "Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json"
