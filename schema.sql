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
CREATE INDEX headlines_retrieved ON headlines (retrieved);

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
    desk TEXT,
    section TEXT,
    subsection TEXT,
    tone TEXT,
    tsv TSVECTOR,
    deletedat TIMESTAMP WITH TIME ZONE,
    refreshedat TIMESTAMP WITH TIME ZONE DEFAULT transaction_timestamp() NOT NULL,
    created TIMESTAMP WITH TIME ZONE DEFAULT transaction_timestamp() NOT NULL,
    updated TIMESTAMP WITH TIME ZONE DEFAULT transaction_timestamp() NOT NULL
);

DROP TRIGGER IF EXISTS update_articles_transaction_columns ON articles;
CREATE TRIGGER update_articles_transaction_columns BEFORE UPDATE ON articles FOR EACH ROW EXECUTE PROCEDURE update_transaction_columns();

CREATE INDEX article_search_idx ON articles USING GIN (tsv);

CREATE OR REPLACE FUNCTION refreshSearchIndex() RETURNS void AS $$
  WITH uniqueheadlines AS (
    SELECT
      uri,
      headline
    FROM headlines
    GROUP BY 1, 2
  ),
  headlineblobs AS (
    SELECT
      uri,
      STRING_AGG(headline, ' ') AS headlines
    FROM uniqueheadlines
    GROUP BY 1
  ),
  latestbodytimes AS (
    SELECT
      uri,
      MAX(created) AS created
    FROM articlerevisions
    GROUP BY 1
  ),
  latestbodies AS (
    SELECT
      r.uri,
      r.body
    FROM articlerevisions AS r
      INNER JOIN latestbodytimes AS lbt
        ON (r.uri=lbt.uri AND r.created=lbt.created)
  )
  UPDATE
    articles
  SET tsv=to_tsvector('english', COALESCE(hb.headlines, '') || COALESCE(lb.body, ''))
  FROM articles AS a
    LEFT JOIN headlineblobs AS hb ON hb.uri=a.uri
    LEFT JOIN latestbodies AS lb ON lb.uri=a.uri
  WHERE articles.uri=a.uri
$$
LANGUAGE sql;

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

-- Article revisions

CREATE TABLE articlerevisions
(
    uri TEXT NOT NULL,
    body TEXT NOT NULL,
    created TIMESTAMP WITH TIME ZONE DEFAULT transaction_timestamp() NOT NULL
);

-- Times Tags

CREATE TABLE timestags
(
    uri TEXT NOT NULL,
    tag TEXT NOT NULL,
    created TIMESTAMP WITH TIME ZONE DEFAULT transaction_timestamp() NOT NULL,
    UNIQUE (uri, tag)
);

-- Creators

CREATE TABLE creators
(
    uri TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT,
    image TEXT,
    created TIMESTAMP WITH TIME ZONE DEFAULT transaction_timestamp() NOT NULL
);

-- Articles <> Creators

CREATE TABLE articlescreators
(
    articleuri TEXT NOT NULL REFERENCES articles (uri),
    creatoruri TEXT NOT NULL REFERENCES creators (uri),
    created TIMESTAMP WITH TIME ZONE DEFAULT transaction_timestamp() NOT NULL,
    UNIQUE (articleuri, creatoruri)
);

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
  revisioncounts AS (
    SELECT
      uri,
      COUNT(*)
    FROM nyt.articlerevisions
    GROUP BY 1
  ),
  allcounts AS (
    SELECT
      COALESCE(vc.uri, sc.uri, ec.uri) AS uri,
      MIN(COALESCE(vc.rank, 21)) AS viewrank,
      MIN(COALESCE(sc.rank, 21)) AS sharerank,
      MIN(COALESCE(ec.rank, 21)) AS emailrank
    FROM viewcounts AS vc
      FULL OUTER JOIN sharecounts AS sc ON vc.uri=sc.uri
      FULL OUTER JOIN emailcounts AS ec ON vc.uri=ec.uri
    GROUP BY 1
  ),
  aggtags AS (
    SELECT
      tt.uri,
      STRING_AGG(tt.tag, '||') AS tags
    FROM nyt.timestags AS tt
    GROUP BY 1
  ),
  normalizedviews AS (
  SELECT
      uri,
      date_trunc('hour', created) + date_part('minute', created)::int / 30 * interval '30 minutes' AS period,
      ROUND(AVG(COALESCE(rank, 21))) AS rank
    FROM nyt.viewrankings
    GROUP BY 1, 2
  ),
  views AS (
    SELECT
      uri,
      SUM(CASE
        WHEN rank = 1 THEN 63720
        WHEN rank = 2 THEN 21844
        WHEN rank = 3 THEN 15921
        WHEN rank = 4 THEN 13241
        WHEN rank = 5 THEN 11617
        WHEN rank = 6 THEN 10462
        WHEN rank = 7 THEN 9584
        WHEN rank = 8 THEN 8878
        WHEN rank = 9 THEN 8329
        WHEN rank = 10 THEN 7829
        WHEN rank = 11 THEN 7431
        WHEN rank = 12 THEN 7034
        WHEN rank = 13 THEN 6753
        WHEN rank = 14 THEN 6483
        WHEN rank = 15 THEN 6264
        WHEN rank = 16 THEN 6018
        WHEN rank = 17 THEN 5829
        WHEN rank = 18 THEN 5680
        WHEN rank = 19 THEN 5445
        WHEN rank = 20 THEN 5352
      END) AS views
    FROM normalizedviews
    GROUP BY 1
  )
  SELECT
    ac.uri,
    MIN(ac.periods) AS periods,
    MIN(COALESCE(cc.viewrank, 21)) AS viewcountmin,
    MIN(COALESCE(cc.sharerank, 21)) AS sharecountmin,
    MIN(COALESCE(cc.emailrank, 21)) AS emailcountmin,
    COUNT(DISTINCT h.headline) AS headlinecount,
    MIN(COALESCE(rc.count, 0)) AS revisioncount,
    MIN(agt.tags) AS tags,
    MIN(v.views) AS views
  FROM
    articlecounts AS ac
      LEFT JOIN nyt.headlines AS h ON ac.uri=h.uri
      LEFT JOIN allcounts AS cc ON cc.uri=ac.uri
      LEFT JOIN revisioncounts AS rc ON rc.uri=ac.uri
      LEFT JOIN aggtags AS agt ON agt.uri=ac.uri
      LEFT JOIN views AS v ON v.uri=ac.uri
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
