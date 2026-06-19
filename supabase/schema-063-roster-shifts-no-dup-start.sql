-- Soft-delete the newer copy of each existing duplicate pair
UPDATE roster_shifts
SET deleted_at = now()
WHERE id IN (
  '88797bab-e6f0-4097-b5a9-06715ebcb010',
  '17a6f09d-dfa2-4fa2-b9dd-fe1124729c85',
  'fe015ff2-9369-4e5f-b3a8-aa0c65c582a7'
);

-- Partial unique index: no two active shifts for the same employee can share
-- a start_time on the same day. Soft-deleted rows are excluded so they don't
-- block re-creation if a shift is restored.
CREATE UNIQUE INDEX roster_shifts_no_dup_start
ON roster_shifts (org_id, user_id, date, start_time)
WHERE deleted_at IS NULL;
