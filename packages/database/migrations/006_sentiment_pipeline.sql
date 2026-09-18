CREATE TYPE sentiment_label AS ENUM ('positive', 'neutral', 'negative');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM feedback_items WHERE sentiment IS NOT NULL AND sentiment NOT IN ('positive', 'neutral', 'negative')) THEN
    RAISE EXCEPTION 'Cannot convert feedback_items.sentiment: invalid legacy values exist';
  END IF;
END $$;

ALTER TABLE feedback_items
  ALTER COLUMN sentiment TYPE sentiment_label USING sentiment::sentiment_label;

CREATE TABLE sentiment_cache (
  content_hash TEXT PRIMARY KEY,
  sentiment sentiment_label NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX feedback_items_unclassified_idx ON feedback_items (created_at ASC) WHERE sentiment IS NULL;
