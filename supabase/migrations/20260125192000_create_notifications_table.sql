BEGIN;

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb,
  read boolean DEFAULT false,
  created_at timestamp DEFAULT now()
);

CREATE INDEX idx_notifications_user_id_read ON notifications(user_id, read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
CREATE INDEX idx_notifications_type ON notifications(type);

COMMIT;
