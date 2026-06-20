ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS reminder_5min_sent boolean NOT NULL DEFAULT false;
ALTER TABLE scheduled_calls  ADD COLUMN IF NOT EXISTS reminder_5min_sent boolean NOT NULL DEFAULT false;
