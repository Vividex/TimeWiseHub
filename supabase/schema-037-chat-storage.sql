-- ============================================================
-- TimeWiseHub — Schema 037: Chat attachments storage
-- Path convention: <conversation_id>/<message_id>/<uuid>-<filename>
-- foldername(name)[1] = conversation_id  → gate on participation.
-- Run via Supabase MCP apply_migration (name: chat_storage)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

-- Read an object if you participate in its conversation.
create policy "View chat attachment objects"
  on storage.objects for select
  using (
    bucket_id = 'chat-attachments'
    and public.is_chat_participant(((storage.foldername(name))[1])::uuid)
  );

-- Upload an object only where you may post (channel role gate applies).
create policy "Upload chat attachment objects"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-attachments'
    and public.can_post_chat(((storage.foldername(name))[1])::uuid)
  );

-- Delete your own uploaded objects (owner column = uploader's auth uid).
create policy "Delete own chat attachment objects"
  on storage.objects for delete
  using (
    bucket_id = 'chat-attachments'
    and owner = auth.uid()
  );
