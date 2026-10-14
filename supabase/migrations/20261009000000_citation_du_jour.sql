-- Citation du jour : likes partagés entre tous les athlètes
-- Les citations sont dans le code (src/data/citations.ts). La base ne stocke que les likes.

create table if not exists public.citation_likes (
  user_id    uuid     not null references auth.users(id) on delete cascade,
  quote_id   smallint not null check (quote_id between 1 and 365),
  created_at timestamptz not null default now(),
  primary key (user_id, quote_id)
);

-- Compteur public par citation, tenu à jour par trigger (écriture impossible côté client)
create table if not exists public.citation_stats (
  quote_id smallint primary key check (quote_id between 1 and 365),
  likes    integer  not null default 0 check (likes >= 0)
);

alter table public.citation_likes enable row level security;
alter table public.citation_stats enable row level security;

create policy "citation_likes: lire les siens"   on public.citation_likes for select to authenticated using (user_id = auth.uid());
create policy "citation_likes: ajouter les siens" on public.citation_likes for insert to authenticated with check (user_id = auth.uid());
create policy "citation_likes: retirer les siens" on public.citation_likes for delete to authenticated using (user_id = auth.uid());
create policy "citation_stats: lecture"           on public.citation_stats for select to authenticated using (true);

create or replace function public.citation_likes_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.citation_stats (quote_id, likes) values (new.quote_id, 1)
    on conflict (quote_id) do update set likes = public.citation_stats.likes + 1;
    return new;
  else
    update public.citation_stats set likes = greatest(likes - 1, 0) where quote_id = old.quote_id;
    return old;
  end if;
end $$;

drop trigger if exists citation_likes_sync on public.citation_likes;
create trigger citation_likes_sync after insert or delete on public.citation_likes
  for each row execute function public.citation_likes_sync();

-- Mise à jour en direct du compteur chez tous les athlètes
alter publication supabase_realtime add table public.citation_stats;
