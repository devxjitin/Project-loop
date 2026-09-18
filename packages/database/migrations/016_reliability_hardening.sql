-- Correct the original nullable external-id constraint. PostgreSQL's
-- `UNIQUE NULLS NOT DISTINCT` treats all NULL values as equal, which prevents
-- normal CSV imports where a source does not supply an external identifier.
ALTER TABLE feedback_items
  DROP CONSTRAINT IF EXISTS feedback_items_tenant_id_source_external_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS feedback_items_external_id_unique
  ON feedback_items (tenant_id, source, external_id)
  WHERE external_id IS NOT NULL;

-- Fail clearly before converting legacy free-form sentiment values to the enum.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM feedback_items
    WHERE sentiment IS NOT NULL AND sentiment NOT IN ('positive', 'neutral', 'negative')
  ) THEN
    RAISE EXCEPTION 'Cannot apply sentiment enum: feedback_items contains invalid sentiment values';
  END IF;
END $$;

-- Keep denormalized tenant ids consistent with their owning records. RLS alone
-- cannot detect a cross-tenant foreign-key reference written by a privileged worker.
CREATE OR REPLACE FUNCTION assert_feedback_embedding_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM feedback_items WHERE id = NEW.feedback_item_id AND tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'feedback embedding tenant must match feedback item tenant';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION assert_feedback_theme_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM feedback_items WHERE id = NEW.feedback_item_id AND tenant_id = NEW.tenant_id)
     OR NOT EXISTS (SELECT 1 FROM themes WHERE id = NEW.theme_id AND tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'feedback theme tenant must match feedback item and theme tenant';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION assert_qa_message_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM qa_sessions WHERE id = NEW.session_id AND tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Q&A message tenant must match Q&A session tenant';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS feedback_embeddings_tenant_consistency ON feedback_embeddings;
CREATE TRIGGER feedback_embeddings_tenant_consistency BEFORE INSERT OR UPDATE ON feedback_embeddings FOR EACH ROW EXECUTE FUNCTION assert_feedback_embedding_tenant();
DROP TRIGGER IF EXISTS feedback_item_themes_tenant_consistency ON feedback_item_themes;
CREATE TRIGGER feedback_item_themes_tenant_consistency BEFORE INSERT OR UPDATE ON feedback_item_themes FOR EACH ROW EXECUTE FUNCTION assert_feedback_theme_tenant();
DROP TRIGGER IF EXISTS qa_messages_tenant_consistency ON qa_messages;
CREATE TRIGGER qa_messages_tenant_consistency BEFORE INSERT OR UPDATE ON qa_messages FOR EACH ROW EXECUTE FUNCTION assert_qa_message_tenant();
