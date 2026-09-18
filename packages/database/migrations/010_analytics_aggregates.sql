CREATE MATERIALIZED VIEW analytics_sentiment_daily AS
SELECT tenant_id, date_trunc('day', coalesce(occurred_at, created_at))::date AS day,
  count(*) FILTER (WHERE sentiment = 'positive')::integer AS positive_count,
  count(*) FILTER (WHERE sentiment = 'neutral')::integer AS neutral_count,
  count(*) FILTER (WHERE sentiment = 'negative')::integer AS negative_count,
  count(*)::integer AS total_count
FROM feedback_items GROUP BY tenant_id, date_trunc('day', coalesce(occurred_at, created_at))::date;
CREATE UNIQUE INDEX analytics_sentiment_daily_unique ON analytics_sentiment_daily (tenant_id, day);

CREATE MATERIALIZED VIEW analytics_theme_counts AS
SELECT fit.tenant_id, fit.theme_id, t.name AS theme_name, date_trunc('day', coalesce(f.occurred_at, f.created_at))::date AS day,
  count(*) FILTER (WHERE f.sentiment = 'positive')::integer AS positive_count,
  count(*) FILTER (WHERE f.sentiment = 'neutral')::integer AS neutral_count,
  count(*) FILTER (WHERE f.sentiment = 'negative')::integer AS negative_count,
  count(*)::integer AS total_count
FROM feedback_item_themes fit JOIN feedback_items f ON f.id = fit.feedback_item_id JOIN themes t ON t.id = fit.theme_id
GROUP BY fit.tenant_id, fit.theme_id, t.name, date_trunc('day', coalesce(f.occurred_at, f.created_at))::date;
CREATE UNIQUE INDEX analytics_theme_counts_unique ON analytics_theme_counts (tenant_id, theme_id, day);

CREATE MATERIALIZED VIEW analytics_channel_counts AS
SELECT tenant_id, source, date_trunc('day', coalesce(occurred_at, created_at))::date AS day, count(*)::integer AS total_count
FROM feedback_items GROUP BY tenant_id, source, date_trunc('day', coalesce(occurred_at, created_at))::date;
CREATE UNIQUE INDEX analytics_channel_counts_unique ON analytics_channel_counts (tenant_id, source, day);
