-- 나와봄: 방문 장소 공용 반응 집계 (Supabase SQL Editor에서 1회 실행)
-- 이메일, 전화번호, 개인 방문 기록은 저장하지 않습니다.
create table if not exists public.nawabom_place_reactions (
  place_key text not null check (length(place_key) between 1 and 240),
  user_id uuid not null,
  viewed boolean not null default false,
  liked boolean not null default false,
  primary key (place_key, user_id)
);
alter table public.nawabom_place_reactions enable row level security;
revoke all on public.nawabom_place_reactions from public, anon, authenticated;

create or replace function public.nawabom_react(p_key text, p_kind text)
returns table(views bigint, likes bigint, my_like boolean)
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Login required'; end if;
  if p_key is null or length(p_key) not between 1 and 240 or p_kind not in ('view','like') then
    raise exception 'Invalid input';
  end if;
  insert into public.nawabom_place_reactions(place_key,user_id,viewed,liked)
  values(p_key,v_user,true,p_kind='like')
  on conflict(place_key,user_id) do update set
    viewed=true,
    liked=case when p_kind='like' then not nawabom_place_reactions.liked
               else nawabom_place_reactions.liked end;
  return query
   select count(*) filter(where r.viewed)::bigint,
          count(*) filter(where r.liked)::bigint,
          coalesce(bool_or(r.user_id=v_user and r.liked),false)
   from public.nawabom_place_reactions r where r.place_key=p_key;
end;
$$;

create or replace function public.nawabom_stats(p_key text)
returns table(views bigint, likes bigint)
language sql security definer set search_path = ''
as $$
 select count(*) filter(where viewed)::bigint,
        count(*) filter(where liked)::bigint
 from public.nawabom_place_reactions
 where place_key=p_key and length(p_key) between 1 and 240;
$$;
revoke all on function public.nawabom_react(text,text) from public,anon;
grant execute on function public.nawabom_react(text,text) to authenticated;
revoke all on function public.nawabom_stats(text) from public;
grant execute on function public.nawabom_stats(text) to anon,authenticated;
