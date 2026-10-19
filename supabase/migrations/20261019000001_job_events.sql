-- Q76 (PM 2026-10-19): every scheduled job run is logged to events as
-- job_run, with no user id. Widens the event name check (standing approval)
-- and keeps job_run server only, like the other service role events.
alter table public.events drop constraint events_name_known;
alter table public.events add constraint events_name_known check (name in (
  'signup_started', 'signup_completed', 'onboarding_completed', 'pwa_installed', 'push_enabled',
  'food_logged', 'food_entry_corrected', 'food_entry_deleted', 'weight_logged', 'habit_checked',
  'checkin_started', 'checkin_submitted', 'report_viewed', 'message_sent', 'upgrade_viewed',
  'upgrade_completed', 'subscription_canceled', 'review_card_opened', 'review_reply_sent',
  'meal_copied', 'day_switched', 'streak_milestone', 'day_note_saved', 'macro_card_mode_changed',
  'progress_viewed', 'progress_week_changed', 'weight_range_changed',
  'quick_action_used', 'calendar_expanded',
  'search_performed', 'barcode_scanned', 'barcode_mismatch', 'label_scanned', 'custom_food_created',
  'job_run'
));

drop policy "events: insert own" on public.events;
create policy "events: insert own"
  on public.events for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and name not in ('signup_completed', 'upgrade_completed', 'subscription_canceled', 'review_reply_sent', 'job_run')
  );
