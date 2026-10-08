create or replace function public.review_photo_matches(target_order uuid, max_distance integer default 6)
returns table (photo_id uuid, match_photo_id uuid, match_order_id uuid, match_order_number bigint, distance integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, o.id, o.work_order_id, w.number, d.distance
  from public.photos p
  join public.photos o
    on o.phash is not null
   and o.work_order_id <> p.work_order_id
   and o.created_at < p.created_at
  join public.work_orders w on w.id = o.work_order_id
  cross join lateral (
    select bit_count(('x' || p.phash)::bit(64) # ('x' || o.phash)::bit(64))::integer as distance
  ) d
  where p.work_order_id = target_order
    and p.kind = 'after'
    and p.phash is not null
    and d.distance <= least(greatest(max_distance, 0), 16)
  order by p.id, d.distance, o.created_at;
$$;

revoke execute on function public.review_photo_matches(uuid, integer) from public, anon, authenticated;
grant execute on function public.review_photo_matches(uuid, integer) to service_role;

select cron.schedule('review-watcher', '* * * * *', $$select private.invoke_cron_target('reviews')$$);
