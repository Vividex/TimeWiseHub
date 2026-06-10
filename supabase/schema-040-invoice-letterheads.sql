-- TimeWiseHub — Schema 040: Invoice letterheads

alter table public.profiles
  add column if not exists invoice_letterhead text;

alter table public.organisations
  add column if not exists invoice_letterhead text;
