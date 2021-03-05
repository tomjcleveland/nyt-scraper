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

-- CREATE TRIGGER headlines_refresh_articlestats AFTER INSERT OR UPDATE OR DELETE
-- ON headlines
-- FOR EACH STATEMENT EXECUTE PROCEDURE refresh_articlestats();

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

-- CREATE TRIGGER viewrankings_refresh_articlestats AFTER INSERT OR UPDATE OR DELETE
-- ON viewrankings
-- FOR EACH STATEMENT EXECUTE PROCEDURE refresh_articlestats();

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

-- CREATE TRIGGER sharerankings_refresh_articlestats AFTER INSERT OR UPDATE OR DELETE
-- ON sharerankings
-- FOR EACH STATEMENT EXECUTE PROCEDURE refresh_articlestats();

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

-- CREATE TRIGGER emailrankings_refresh_articlestats AFTER INSERT OR UPDATE OR DELETE
-- ON emailrankings
-- FOR EACH STATEMENT EXECUTE PROCEDURE refresh_articlestats();

------------------------
-- MATERIALIZED VIEWS --
------------------------

-- Article Stats

CREATE MATERIALIZED VIEW articlestats
AS
  WITH periodcounts AS (
    SELECT
      date_trunc('hour', retrieved) + date_part('minute', retrieved)::int / 30 * interval '30 minutes' AS period,
      uri,
      1 AS present
    FROM nyt.headlines
    GROUP BY 1, 2, 3
  ),
  articlecounts AS (
    SELECT
      a.uri,
      SUM(COALESCE(pc.present, 0)) AS periods
    FROM nyt.articles AS a
      LEFT JOIN periodcounts AS pc ON a.uri=pc.uri
    GROUP BY 1
  ),
  viewcounts AS (
    SELECT
      uri,
      MIN(COALESCE(rank, 21)) AS rank
    FROM nyt.viewrankings
    GROUP BY 1
  ),
  sharecounts AS (
    SELECT
      uri,
      MIN(COALESCE(rank, 21)) AS rank
    FROM nyt.sharerankings
    GROUP BY 1
  ),
  emailcounts AS (
    SELECT
      uri,
      MIN(COALESCE(rank, 21)) AS rank
    FROM nyt.emailrankings
    GROUP BY 1
  ),
  allcounts AS (
    SELECT
      vc.uri,
      MIN(COALESCE(vc.rank, 21)) AS viewrank,
      MIN(COALESCE(sc.rank, 21)) AS sharerank,
      MIN(COALESCE(ec.rank, 21)) AS emailrank
    FROM viewcounts AS vc
      FULL OUTER JOIN sharecounts AS sc ON vc.uri=sc.uri
      FULL OUTER JOIN emailcounts AS ec ON ec.uri=sc.uri
    GROUP BY 1
  )
  SELECT
    ac.uri,
    MIN(ac.periods) AS periods,
    MIN(COALESCE(cc.viewrank, 21)) AS viewcountmin,
    MIN(COALESCE(cc.sharerank, 21)) AS sharecountmin,
    MIN(COALESCE(cc.emailrank, 21)) AS emailcountmin,
    COUNT(DISTINCT h.headline) AS headlinecount
  FROM
    articlecounts AS ac
      LEFT JOIN nyt.headlines AS h ON ac.uri=h.uri
      LEFT JOIN allcounts AS cc ON cc.uri=ac.uri
  GROUP BY 1
WITH DATA;

CREATE UNIQUE INDEX articlestatsuri ON articlestats (uri);

CREATE OR REPLACE FUNCTION refresh_articlestats()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY articlestats;
    RETURN NULL;
END;
$$;
