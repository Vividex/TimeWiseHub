-- ============================================================
-- TimeWiseHub — Schema 079: Chat attachment bucket column
-- Lets a chat_attachments row point at a storage bucket other than
-- chat-attachments (e.g. program-assets), so sharing a program file into
-- session chat can reuse the existing AttachmentChip UI (thumbnail, open,
-- download) and re-sign a fresh URL on every view instead of baking a
-- short-lived signed URL into the message body forever.
-- Run via Supabase MCP apply_migration (name: chat_attachment_bucket)
-- ============================================================

alter table public.chat_attachments
  add column bucket text not null default 'chat-attachments';

create or replace function public.send_chat_message(
  p_id uuid, p_conversation uuid, p_body text, p_attachments jsonb
)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_att jsonb;
begin
  insert into public.chat_messages (id, conversation_id, sender_id, body)
  values (coalesce(p_id, gen_random_uuid()), p_conversation, auth.uid(), coalesce(p_body, ''))
  returning id into v_id;

  if p_attachments is not null then
    for v_att in select * from jsonb_array_elements(p_attachments) loop
      insert into public.chat_attachments (message_id, storage_path, file_name, mime_type, size_bytes, bucket)
      values (
        v_id,
        v_att->>'storage_path',
        v_att->>'file_name',
        v_att->>'mime_type',
        (v_att->>'size_bytes')::bigint,
        coalesce(v_att->>'bucket', 'chat-attachments')
      );
    end loop;
  end if;
  return v_id;
end;
$$;
