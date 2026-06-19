CREATE TABLE member_availability (
  id           uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id       uuid     NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  day_of_week  smallint NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Mon … 6=Sun
  hour         smallint NOT NULL CHECK (hour >= 0 AND hour <= 23),
  available    boolean  NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id, day_of_week, hour)
);

ALTER TABLE member_availability ENABLE ROW LEVEL SECURITY;

-- Users manage their own availability
CREATE POLICY "users manage own availability" ON member_availability
  FOR ALL TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Managers/admins/owners can read all availability in their org
CREATE POLICY "managers read org availability" ON member_availability
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE org_id = member_availability.org_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin', 'manager')
    )
  );

-- Managers can also write any member's availability
CREATE POLICY "managers write org availability" ON member_availability
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE org_id = member_availability.org_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisation_members
      WHERE org_id = member_availability.org_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin', 'manager')
    )
  );
