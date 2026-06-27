-- Session notes: transcript storage, AI summary, and project linking for video calls
ALTER TABLE scheduled_calls
  ADD COLUMN project_id             UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN transcript             TEXT,
  ADD COLUMN summary                TEXT,
  ADD COLUMN transcript_started_by  UUID REFERENCES auth.users(id);
