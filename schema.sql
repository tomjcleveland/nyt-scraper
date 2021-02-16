-- This SQL file is expected to be executed via psql. If executed as plain
-- SQL, the psql \-command must be commented out or removed.
SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET timezone = UTC;
CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;

-------------------------
--BEGIN LOCAL ONLY SCHEMA
-------------------------

CREATE ROLE nyt_admin;
GRANT nyt_admin TO postgres;
CREATE ROLE nyt_app;
GRANT nyt_app TO nyt_admin;

CREATE DATABASE nyt;
GRANT CONNECT ON DATABASE nyt TO nyt_admin;
GRANT CONNECT ON DATABASE nyt TO nyt_app;
\connect nyt

CREATE SCHEMA nyt AUTHORIZATION nyt_admin;
SET search_path TO nyt;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA nyt;

ALTER ROLE nyt_admin SET search_path TO nyt;
ALTER ROLE nyt_app SET search_path TO nyt;
GRANT USAGE ON SCHEMA nyt TO nyt_app;
GRANT CREATE ON SCHEMA nyt TO nyt_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE nyt_admin GRANT SELECT ON TABLES TO nyt_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nyt_admin GRANT INSERT, UPDATE, DELETE ON TABLES TO nyt_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nyt_admin GRANT DELETE, TRUNCATE ON TABLES TO nyt_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE nyt_admin GRANT EXECUTE ON FUNCTIONS TO nyt_app;

SET ROLE nyt_admin;

-------------------------
--END LOCAL ONLY SCHEMA
-------------------------

-- update_transaction_columns updates the "created" columns for every insert
CREATE OR REPLACE FUNCTION update_transaction_columns() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated = transaction_timestamp() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Headlines

CREATE TABLE headlines
(
    id TEXT PRIMARY KEY,
    sourceid TEXT,
    headline TEXT,
    summary TEXT,
    uri TEXT,
    lastmajormodification TIMESTAMP WITH TIME ZONE,
    lastmodified TIMESTAMP WITH TIME ZONE,
    tone TEXT,
    retrieved TIMESTAMP WITH TIME ZONE,
    created TIMESTAMP WITH TIME ZONE DEFAULT transaction_timestamp() NOT NULL,
    updated TIMESTAMP WITH TIME ZONE DEFAULT transaction_timestamp() NOT NULL
);

DROP TRIGGER IF EXISTS update_headlines_transaction_columns ON headlines;
CREATE TRIGGER update_headlines_transaction_columns BEFORE UPDATE ON headlines FOR EACH ROW EXECUTE PROCEDURE update_transaction_columns();

CREATE INDEX headlines_search_idx ON headlines USING GIN (to_tsvector('english', headline));

-- Articles

CREATE TABLE articles
(
    uri TEXT PRIMARY KEY,
    weburl TEXT,
    abstract TEXT,
    leadparagraph TEXT,
    imageurl TEXT,
    headline TEXT,
    printheadline TEXT,
    published TIMESTAMP WITH TIME ZONE,
    byline TEXT,
    wordcount INTEGER,
    created TIMESTAMP WITH TIME ZONE DEFAULT transaction_timestamp() NOT NULL,
    updated TIMESTAMP WITH TIME ZONE DEFAULT transaction_timestamp() NOT NULL
);

DROP TRIGGER IF EXISTS update_articles_transaction_columns ON articles;
CREATE TRIGGER update_articles_transaction_columns BEFORE UPDATE ON articles FOR EACH ROW EXECUTE PROCEDURE update_transaction_columns();

-- View Rankings

CREATE TABLE viewrankings
(
    uri TEXT NOT NULL,
    rank INTEGER  NOT NULL,
    created TIMESTAMP WITH TIME ZONE DEFAULT transaction_timestamp() NOT NULL,
    updated TIMESTAMP WITH TIME ZONE DEFAULT transaction_timestamp() NOT NULL
);

DROP TRIGGER IF EXISTS update_viewrankings_transaction_columns ON viewrankings;
CREATE TRIGGER update_viewrankings_transaction_columns BEFORE UPDATE ON viewrankings FOR EACH ROW EXECUTE PROCEDURE update_transaction_columns();

-- Share Rankings

CREATE TABLE sharerankings
(
    uri TEXT NOT NULL,
    rank INTEGER  NOT NULL,
    created TIMESTAMP WITH TIME ZONE DEFAULT transaction_timestamp() NOT NULL,
    updated TIMESTAMP WITH TIME ZONE DEFAULT transaction_timestamp() NOT NULL
);

DROP TRIGGER IF EXISTS update_sharerankings_transaction_columns ON sharerankings;
CREATE TRIGGER update_sharerankings_transaction_columns BEFORE UPDATE ON sharerankings FOR EACH ROW EXECUTE PROCEDURE update_transaction_columns();

-- Email Rankings

CREATE TABLE emailrankings
(
    uri TEXT NOT NULL,
    rank INTEGER  NOT NULL,
    created TIMESTAMP WITH TIME ZONE DEFAULT transaction_timestamp() NOT NULL,
    updated TIMESTAMP WITH TIME ZONE DEFAULT transaction_timestamp() NOT NULL
);

DROP TRIGGER IF EXISTS update_emailrankings_transaction_columns ON emailrankings;
CREATE TRIGGER update_emailrankings_transaction_columns BEFORE UPDATE ON emailrankings FOR EACH ROW EXECUTE PROCEDURE update_transaction_columns();
