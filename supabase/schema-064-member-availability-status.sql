-- Replace boolean available with a 3-state status field.
-- Existing rows: true→'available', false→'unavailable'.
ALTER TABLE member_availability
  ADD COLUMN status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'unavailable', 'uncontactable'));

UPDATE member_availability
  SET status = CASE WHEN available THEN 'available' ELSE 'unavailable' END;

ALTER TABLE member_availability DROP COLUMN available;
