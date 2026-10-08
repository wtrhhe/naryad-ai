begin;
create extension if not exists pgtap with schema extensions;
select plan(1);
select results_eq(
  $$select action, from_statuses, to_status, array(select unnest(roles) order by 1), array(select unnest(requires) order by 1), irreversible
    from public.work_order_transition_rules order by action::text$$,
  $$values
  ('accept'::public.work_order_action, '{issued,queued}'::public.work_order_status[], 'accepted'::public.work_order_status, '{worker}'::text[], '{}'::text[], false),
  ('approve'::public.work_order_action, '{ai_review}'::public.work_order_status[], 'closed'::public.work_order_status, '{master}'::text[], '{}'::text[], true),
  ('cancel'::public.work_order_action, '{issued,queued,accepted,rejected,in_progress,paused,done,ai_review,rework}'::public.work_order_status[], 'cancelled'::public.work_order_status, '{master}'::text[], '{reason}'::text[], true),
  ('change_priority'::public.work_order_action, '{issued,queued,accepted,rejected,in_progress,paused,done,ai_review,rework}'::public.work_order_status[], null::public.work_order_status, '{master}'::text[], '{priority}'::text[], false),
  ('comment'::public.work_order_action, '{issued,queued,accepted,rejected,in_progress,paused,done,ai_review,rework,closed,cancelled}'::public.work_order_status[], null::public.work_order_status, '{master,worker}'::text[], '{comment}'::text[], false),
  ('complete'::public.work_order_action, '{in_progress}'::public.work_order_status[], 'done'::public.work_order_status, '{worker}'::text[], '{closing}'::text[], true),
  ('pause'::public.work_order_action, '{in_progress}'::public.work_order_status[], 'paused'::public.work_order_status, '{worker}'::text[], '{reason}'::text[], false),
  ('queue'::public.work_order_action, '{issued}'::public.work_order_status[], 'queued'::public.work_order_status, '{worker}'::text[], '{}'::text[], false),
  ('reassign'::public.work_order_action, '{issued,queued,accepted,rejected}'::public.work_order_status[], 'issued'::public.work_order_status, '{master}'::text[], '{assignee}'::text[], false),
  ('reject'::public.work_order_action, '{issued,queued}'::public.work_order_status[], 'rejected'::public.work_order_status, '{worker}'::text[], '{reason}'::text[], true),
  ('resume'::public.work_order_action, '{paused}'::public.work_order_status[], 'in_progress'::public.work_order_status, '{worker}'::text[], '{}'::text[], false),
  ('return_rework'::public.work_order_action, '{ai_review}'::public.work_order_status[], 'rework'::public.work_order_status, '{master,system}'::text[], '{comment}'::text[], false),
  ('start'::public.work_order_action, '{accepted,rework}'::public.work_order_status[], 'in_progress'::public.work_order_status, '{worker}'::text[], '{}'::text[], false),
  ('submit_review'::public.work_order_action, '{done}'::public.work_order_status[], 'ai_review'::public.work_order_status, '{master,system}'::text[], '{}'::text[], false)
  $$,
  'database transition rules match lib/domain/work-order-machine.ts'
);
select * from finish();
rollback;
