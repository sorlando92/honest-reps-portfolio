-- Weekly cycle times (QUESTIONS.md Q17), edited in Coach settings. Times are
-- in the coach's timezone; check-in and review days stay in their own
-- columns. Example: {"checkin_opens_at": "06:00", "overdue_after_hours": 24,
-- "review_prep_day": 6, "review_prep_at": "22:00"}.
alter table public.coach_settings
  add column weekly_cycle jsonb not null default '{}'::jsonb;
