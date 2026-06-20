ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS reminder_sent boolean NOT NULL DEFAULT false;
