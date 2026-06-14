-- Remove the DiceBear avatar config column; photo uploads (avatar_url) are retained.
ALTER TABLE profiles DROP COLUMN IF EXISTS avatar_config;
