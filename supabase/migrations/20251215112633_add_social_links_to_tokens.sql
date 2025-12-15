/*
  # Add Social Media Links to Tokens

  1. Changes
    - Add `telegram_url` column to tokens table for Telegram group/channel links
    - Add `discord_url` column to tokens table for Discord server links
    - Add `x_url` column to tokens table for X (Twitter) profile links
  
  2. Notes
    - All fields are optional (nullable) to maintain backward compatibility
    - URLs are stored as text type for flexibility
*/

ALTER TABLE tokens
ADD COLUMN IF NOT EXISTS telegram_url text,
ADD COLUMN IF NOT EXISTS discord_url text,
ADD COLUMN IF NOT EXISTS x_url text;