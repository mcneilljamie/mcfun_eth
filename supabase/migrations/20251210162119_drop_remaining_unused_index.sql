/*
  # Drop Remaining Unused Index

  1. Drop idx_tokens_created_at
    - This index on tokens.created_at is not used by any queries
    - Queries filter by token_address (primary key), not by created_at alone
    - Removing unused indexes improves write performance and reduces storage

  Note: We only query tokens by token_address, so the created_at index is not needed
*/

DROP INDEX IF EXISTS idx_tokens_created_at;