-- TimeWiseHub — Schema 041: Invoice payment details

alter table public.profiles
  add column if not exists invoice_payment_details jsonb not null default '{}'::jsonb;

alter table public.organisations
  add column if not exists invoice_payment_details jsonb not null default '{}'::jsonb;
