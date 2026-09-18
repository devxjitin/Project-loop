ALTER TABLE feedback_items
  ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(raw_text, ''))) STORED;

CREATE INDEX feedback_items_tenant_sentiment_created_idx ON feedback_items (tenant_id, sentiment, created_at DESC);
CREATE INDEX feedback_items_tenant_source_created_idx ON feedback_items (tenant_id, source, created_at DESC);
CREATE INDEX feedback_items_search_idx ON feedback_items USING gin (search_vector);
