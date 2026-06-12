-- V015: per-admin opt-in for board new-post email alerts (refund/correction, inquiry)

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS board_notify_opt_in BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN admin_users.board_notify_opt_in IS
  'When true, active admin receives board_admin_new_post email on FO refund/correction or inquiry submission.';
