-- Navigation and calendar events (docs/NAV_SPEC.md): quick_action_used,
-- calendar_expanded. Widens the event name check only (standing approval).
alter table public.events drop constraint events_name_known;
alter table public.events add constraint events_name_known check (name in (
  'signup_started', 'signup_completed', 'onboarding_completed', 'pwa_installed', 'push_enabled',
  'food_logged', 'food_entry_corrected', 'food_entry_deleted', 'weight_logged', 'habit_checked',
  'checkin_started', 'checkin_submitted', 'report_viewed', 'message_sent', 'upgrade_viewed',
  'upgrade_completed', 'subscription_canceled', 'review_card_opened', 'review_reply_sent',
  'meal_copied', 'day_switched', 'streak_milestone', 'day_note_saved', 'macro_card_mode_changed',
  'progress_viewed', 'progress_week_changed', 'weight_range_changed',
  'quick_action_used', 'calendar_expanded'
));
