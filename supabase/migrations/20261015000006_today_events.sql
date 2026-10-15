-- Today v2 events (PRD section 5, docs/TODAY_SPEC.md "Events"). NOT ADDITIVE:
-- the name check is dropped and recreated with three more names (it only
-- widens what is accepted; RLS is unchanged). Ships with 20261015000004.
alter table public.events drop constraint events_name_known;
alter table public.events add constraint events_name_known check (name in (
  'signup_started', 'signup_completed', 'onboarding_completed', 'pwa_installed', 'push_enabled',
  'food_logged', 'food_entry_corrected', 'food_entry_deleted', 'weight_logged', 'habit_checked',
  'checkin_started', 'checkin_submitted', 'report_viewed', 'message_sent', 'upgrade_viewed',
  'upgrade_completed', 'subscription_canceled', 'review_card_opened', 'review_reply_sent',
  'meal_copied', 'day_switched', 'streak_milestone'
));
