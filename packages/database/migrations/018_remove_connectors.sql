-- CSV upload is the sole feedback-ingestion path. Remove external connector
-- credentials, endpoints, and their associated tenant-scoped data.
DROP TABLE IF EXISTS connector_oauth_states;
DROP TABLE IF EXISTS connectors;
DROP TYPE IF EXISTS connector_status;
DROP TYPE IF EXISTS connector_type;
