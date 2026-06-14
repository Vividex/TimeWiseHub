-- Schema 054: Group chat conversations
-- Extends chat_conversation_type enum, adds create_group_chat RPC,
-- and adds RLS policies for group member management.

-- ── 1. Extend enum ───────────────────────────────────────────────
ALTER TYPE public.chat_conversation_type ADD VALUE IF NOT EXISTS 'group';

-- ── 2. Update can_post_chat to allow group members to post ───────
-- (channels still require management role; dm and group allow any participant)
CREATE OR REPLACE FUNCTION public.can_post_chat(p_conversation uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_type public.chat_conversation_type;
  v_org  uuid;
BEGIN
  SELECT type, org_id INTO v_type, v_org
  FROM public.chat_conversations WHERE id = p_conversation;
  IF v_type IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE conversation_id = p_conversation AND user_id = auth.uid()
  ) THEN
    RETURN false;
  END IF;
  -- dm and group: any participant can post
  IF v_type IN ('dm', 'group') THEN
    RETURN true;
  END IF;
  -- channel: management only
  RETURN EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.org_id = v_org AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'manager')
  );
END;
$$;

-- ── 3. create_group_chat RPC (SECURITY DEFINER — bypasses INSERT RLS) ──
CREATE OR REPLACE FUNCTION public.create_group_chat(
  p_title     text,
  p_member_ids uuid[]
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me  uuid := auth.uid();
  v_org uuid;
  v_id  uuid;
  v_uid uuid;
BEGIN
  IF p_title IS NULL OR trim(p_title) = '' THEN
    RAISE EXCEPTION 'group name required';
  END IF;

  SELECT org_id INTO v_org
  FROM public.organisation_members
  WHERE user_id = v_me
  LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not a member of any organisation';
  END IF;

  INSERT INTO public.chat_conversations (org_id, type, title, created_by)
  VALUES (v_org, 'group', trim(p_title), v_me)
  RETURNING id INTO v_id;

  -- Add creator
  INSERT INTO public.chat_participants (conversation_id, user_id)
  VALUES (v_id, v_me);

  -- Add selected members (skip self and non-org members)
  FOREACH v_uid IN ARRAY p_member_ids LOOP
    IF v_uid <> v_me AND EXISTS (
      SELECT 1 FROM public.organisation_members
      WHERE org_id = v_org AND user_id = v_uid
    ) THEN
      INSERT INTO public.chat_participants (conversation_id, user_id)
      VALUES (v_id, v_uid)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_group_chat(text, uuid[]) TO authenticated;

-- ── 4. RLS: group members can add others ─────────────────────────
CREATE POLICY "Group members can add others"
  ON public.chat_participants FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = chat_participants.conversation_id
        AND c.type = 'group'
        AND public.is_chat_participant(chat_participants.conversation_id)
    )
  );

-- ── 5. RLS: leave group or creator removes member ─────────────────
CREATE POLICY "Leave or remove from group"
  ON public.chat_participants FOR DELETE
  USING (
    -- self: leave a group you belong to
    (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.chat_conversations c
        WHERE c.id = chat_participants.conversation_id AND c.type = 'group'
      )
    )
    OR
    -- group creator: remove others from their group
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = chat_participants.conversation_id
        AND c.type = 'group'
        AND c.created_by = auth.uid()
    )
  );

-- ── 6. RLS: group members can rename the group ────────────────────
CREATE POLICY "Group members can rename"
  ON public.chat_conversations FOR UPDATE
  USING (type = 'group' AND public.is_chat_participant(id))
  WITH CHECK (type = 'group' AND public.is_chat_participant(id));
