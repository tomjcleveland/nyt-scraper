# nyt-scraper

A simple script for storing New York Times headlines in a database, so I can run some analysis on A/B testing.

## Inspecting the data

To find articles with multiple headlines, try:

```
$ psql -h nyt-headlines.cbyvknksdshk.us-east-1.rds.amazonaws.com -U postgres -d nyt -c "SELECT id,COUNT(DISTINCT headline) FROM nyt.headlines GROUP BY 1 ORDER BY 2 DESC;"
```

## Notes

### Still not getting all headlines

Right now my database has a single headline for article `53 Tons of Rotting Pork and Other Brexit Nightmares`, but I can clearly see at nytimes.com that theres a headline for the same URL with the title `Brexit Was Sold as Taking Back British Control. Post-Brexit Is Chaos.`. If you look at `fixtures/initialData.json` you can find this headline as the part of a "Block_Beta"—but not an "Article" which is what I'm using.

There has to be some way to follow the links in `intialData` to come up with all the headlines.

### Idea

For each article ID, search for an object where `object.id == id`. Check if this object has a key `headline`—if so, add that headline to the article. If not, go up one level and see if _that_ object has a key `headline`...etc.

### Time series

```sql
WITH minutecounts AS (
  SELECT
    date_trunc('hour', retrieved) + date_part('minute', retrieved)::int / 5 * interval '5 min' AS minute,
    headline,
    COUNT(*)
  FROM nyt.headlines
  WHERE uri='nyt://article/127c5461-8ea6-59e0-b6d2-55992d182431'
  GROUP BY 1, 2
  ORDER BY 1 DESC
  ),
  totalperminute AS (
  SELECT
  date_trunc('hour', retrieved) + date_part('minute', retrieved)::int / 5 * interval '5 min' AS minute,
    COUNT(*)
  FROM nyt.headlines
  WHERE uri='nyt://article/127c5461-8ea6-59e0-b6d2-55992d182431'
  GROUP BY 1
  ORDER BY 1 DESC
  )
  SELECT
  minutecounts.minute,
  headline,
  minutecounts.count AS count,
  totalperminute.count AS total
  FROM minutecounts
  JOIN totalperminute ON totalperminute.minute=minutecounts.minute;
```

### Full text search

```sql
SELECT DISTINCT h.headline
FROM nyt.articles AS a
  JOIN nyt.headlines AS h ON a.uri=h.uri
WHERE to_tsvector('english', h.headline) @@ to_tsquery('english', 'trump');
```

### Popularity

```sql
SELECT
  date_trunc('hour', created) AS hour,
  uri,
  SUM(rank) / COUNT(*) AS rank
FROM nyt.viewrankings
WHERE created > now() - interval '1 day'
GROUP BY 1, 2
ORDER BY 1;
```

### GraphQL

1. `nginx` running as CORS proxy on `localhost:3001`
   a. See [default-nginx](./default-nginx)
2. `create-react-app` serving GraphiQL on `localhost:3000`

Get all mutations:

```
{
  __schema {
    mutationType {
      name
      fields {
        name
        description
        deprecationReason
        args {
          description
          defaultValue
        }
      }
    }
  }
}
```

Recursive query (give 503 first byte timeout):

```graphql
query {
  article(id: "nyt://article/76072ea6-6ddb-56ed-9c46-4d5eb10085fd") {
    bylines {
      renderedRepresentation
      creators {
        ... on Person {
          givenName
          stream(first: 100) {
            edges {
              listPromotionalProperties {
                headline
              }
              node {
                promotionalSummary
                ... on Article {
                  headline {
                    default
                  }
                  bylines {
                    renderedRepresentation
                    creators {
                      ... on Person {
                        givenName
                        stream(first: 100) {
                          edges {
                            listPromotionalProperties {
                              headline
                            }
                            node {
                              promotionalSummary
                              ... on Article {
                                headline {
                                  default
                                }
                                bylines {
                                  renderedRepresentation
                                  creators {
                                    ... on Person {
                                      givenName
                                      stream(first: 100) {
                                        edges {
                                          listPromotionalProperties {
                                            headline
                                          }
                                          node {
                                            promotionalSummary
                                            ... on Article {
                                              headline {
                                                default
                                              }
                                              bylines {
                                                renderedRepresentation
                                                creators {
                                                  ... on Person {
                                                    givenName
                                                    stream(first: 100) {
                                                      edges {
                                                        listPromotionalProperties {
                                                          headline
                                                        }
                                                        node {
                                                          promotionalSummary
                                                          ... on Article {
                                                            headline {
                                                              default
                                                            }
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

#### HackerOne user

regiId: 161029898
token: 1wbJDKl/3uvaWMkO9w4bEU83RhTjEMkpOntvn1fJwmdbuF8wFXWfM5vDvs0hA8wgd8jOoea6bgYnRn0cf/aw.0nIs8qoykUXHi3DeCo6rhhfUuWtf59mXCFjxDTQO38FS1

## Deleted articles

```sql
SELECT h.uri, h.headline FROM nyt.headlines AS h LEFT JOIN nyt.articles AS a ON h.uri=a.uri WHERE a.uri IS NULL GROUP BY 1, 2
```

## Capitalization differences

```sql
WITH heads AS (
  SELECT uri, headline
  FROM nyt.headlines
  GROUP BY 1, 2
)
SELECT
  DISTINCT h1.uri
FROM heads AS h1
  JOIN heads AS h2 ON LOWER(h1.headline)=LOWER(h2.headline)
WHERE h1.headline != h2.headline
```

## Histogram: publication time

```sql
SELECT DATE_PART('hour', published), COUNT(*)
FROM nyt.articles
GROUP BY 1
ORDER BY 1 ASC
```

## Histogram: earliest headline time

```sql
WITH earliest AS (
  SELECT uri, MIN(created) AS created
  FROM nyt.headlines
  GROUP BY 1
)
SELECT DATE_PART('hour', created), COUNT(*)
FROM earliest
GROUP BY 1
ORDER BY 1 ASC
```

## Articles on front page for shortest time

```sql
SELECT
  a.uri,
  a.weburl,
  a.headline,
  st.periods
FROM nyt.articlestats AS st
  JOIN nyt.articles AS a ON st.uri=a.uri
WHERE st.periods != 0
ORDER BY st.periods ASC
LIMIT 10
```

## A/B testing vs. popularity

```sql
SELECT
  SUM(CASE WHEN COALESCE(headlinecount, 0) > 1 AND (viewcountmin < 21 OR sharecountmin < 21 OR emailcountmin < 21) THEN 1 ELSE 0 END) AS ie,
  SUM(CASE WHEN COALESCE(headlinecount, 0) <= 1 AND (viewcountmin < 21 OR sharecountmin < 21 OR emailcountmin < 21) THEN 1 ELSE 0 END) AS ce,
  SUM(CASE WHEN COALESCE(headlinecount, 0) <= 1 AND NOT (viewcountmin < 21 OR sharecountmin < 21 OR emailcountmin < 21) THEN 1 ELSE 0 END) AS cn,
  SUM(CASE WHEN COALESCE(headlinecount, 0) > 1 AND NOT (viewcountmin < 21 OR sharecountmin < 21 OR emailcountmin < 21) THEN 1 ELSE 0 END) AS "in"
FROM nyt.articlestats
```

````sql
SELECT
  headlinecount,
  SUM(CASE WHEN viewcountmin < 21 OR sharecountmin < 21 OR emailcountmin < 21 THEN 1 ELSE 0 END) AS ranked,
  COUNT(*) AS total
FROM nyt.articlestats
GROUP BY 1
ORDER BY 1 ASC
```

## Front page time by section

```sql
SELECT
  SPLIT_PART(a.weburl, '/', 7) AS section,
  SUM(st.periods)
FROM nyt.articles AS a
  JOIN nyt.articlestats AS st ON a.uri=st.uri
WHERE st.headlinecount > 0
GROUP BY 1
ORDER BY  2 DESC
````

## Deleted

```sql
SELECT
  a.uri,
  a.weburl,
  a.abstract,
  a.imageurl,
  a.published,
  a.headline AS canonicalheadline,
  a.printheadline AS printheadline,
  ast.viewcountmin,
  ast.sharecountmin,
  ast.emailcountmin,
  ast.headlinecount,
  ast.revisioncount,
  ast.periods
FROM nyt.articles AS a
  INNER JOIN nyt.articlestats AS ast ON ast.uri=a.uri
WHERE a.deletedat IS NOT NULL
AND a.uri LIKE '%article%'
ORDER BY a.deletedat DESC
```

```sql
SELECT
  uri,
  MAX(created)
FROM nyt.headlines
WHERE to_tsvector('english', headline) @@ to_tsquery('english', 'biden')
GROUP BY 1
ORDER BY 2 DESC
LIMIT 20
```

## Search index

```sql
WITH uniqueheadlines AS (
  SELECT
    uri,
    headline
  FROM nyt.headlines
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
  FROM nyt.articlerevisions
  GROUP BY 1
),
latestbodies AS (
  SELECT
    r.uri,
    r.body
  FROM nyt.articlerevisions AS r
    INNER JOIN latestbodytimes AS lbt
      ON (r.uri=lbt.uri AND r.created=lbt.created)
)
UPDATE
  nyt.articles
SET tsv=to_tsvector('english', COALESCE(hb.headlines, '') || COALESCE(lb.body, ''))
FROM nyt.articles AS a
  LEFT JOIN headlineblobs AS hb ON hb.uri=a.uri
  LEFT JOIN latestbodies AS lb ON lb.uri=a.uri
WHERE articles.uri=a.uri
```

```sql
CREATE OR REPLACE FUNCTION refreshSearchIndex() RETURNS void AS $$
  WITH uniqueheadlines AS (
    SELECT
      uri,
      headline
    FROM nyt.headlines
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
    FROM nyt.articlerevisions
    GROUP BY 1
  ),
  latestbodies AS (
    SELECT
      r.uri,
      r.body
    FROM nyt.articlerevisions AS r
      INNER JOIN latestbodytimes AS lbt
        ON (r.uri=lbt.uri AND r.created=lbt.created)
  )
  UPDATE
    nyt.articles
  SET tsv=to_tsvector('english', COALESCE(hb.headlines, '') || COALESCE(lb.body, ''))
  FROM nyt.articles AS a
    LEFT JOIN headlineblobs AS hb ON hb.uri=a.uri
    LEFT JOIN latestbodies AS lb ON lb.uri=a.uri
  WHERE articles.uri=a.uri
$$
LANGUAGE sql;
```

```sql
WITH toptworevisions AS (
  SELECT
    uri,
    created
  FROM nyt.articlerevisions
  ORDER BY created DESC
  LIMIT 2
),
penultimate AS (
  SELECT
    uri,
    MIN(created) AS created
  FROM toptworevisions
  GROUP BY 1
)
DELETE
FROM
  nyt.articlerevisions AS ar
  USING penultimate AS p
WHERE p.created=ar.created
AND p.uri=ar.uri
AND ar.uri='nyt://article/d7c0e386-157e-5b9f-8e93-b875919fc13c';
```

```sql
WITH topten AS (
  SELECT
    ast.uri,
    ast.viewcountmin,
    ast.sharecountmin,
    ast.emailcountmin,
    ast.headlinecount,
    ast.revisioncount,
    ast.periods
  FROM nyt.articlestats AS ast
    JOIN nyt.articles AS a ON a.uri=ast.uri
  WHERE periods > 0
  ORDER BY periods ASC
  LIMIT 20
)
SELECT
  a.uri,
  a.headline AS canonicalheadline,
  tt.periods
FROM nyt.articles AS a
  INNER JOIN topten AS tt ON tt.uri=a.uri
ORDER BY tt.periods ASC
```

```sql
WITH normalizedviews AS (
  SELECT
    uri,
    date_trunc('hour', created) + date_part('minute', created)::int / 30 * interval '30 minutes' AS period,
    AVG(COALESCE(rank, 21)) AS rank
  FROM nyt.viewrankings
  GROUP BY 1, 2
),
viewscores AS (
  SELECT
    uri,
    SUM(21 - rank) AS score
  FROM normalizedviews
  GROUP BY 1
),
authorsections AS (
  SELECT
    ac.creatoruri AS uri,
    MODE() WITHIN GROUP (ORDER BY a.section) AS section
  FROM nyt.articlescreators AS ac
    JOIN nyt.articles AS a ON a.uri=ac.articleuri
  GROUP BY 1
),
authorscores AS (
  SELECT
    c.name,
    ase.section,
    ROUND(AVG(vs.score)) AS score,
    COUNT(*) AS articlecount
  FROM nyt.creators AS c
    JOIN nyt.articlescreators AS ac
      ON ac.creatoruri=c.uri
    JOIN viewscores AS vs ON vs.uri=ac.articleuri
    JOIN authorsections AS ase
      ON c.uri=ase.uri
  GROUP  BY 1, 2
)
SELECT
  name,
  section,
  score,
  articlecount
FROM authorscores
WHERE section='opinion'
ORDER BY 3 DESC
```

## Wikipedia data

Okay ideally I'd end up with a results like:

```
WITH 24trailing AS (
  SELECT
    hour,
    domain,
    title,
    SUM(views) OVER (
      PARTITION BY (domain, title)
      ORDER BY hour
      ROWS BETWEEN 23 PRECEDING AND CURRENT ROW
    ) AS dailyviews
),
??? as (
  24-hour-rank,title,num_views_in_current_hour
)
SELECT
  24-hour-rank,
  AVG(num_views_in_current_hour)
GROUP BY 1
```

## Average new articles/day

```sql
WITH dailycounts AS (
  SELECT
    date_trunc('day', published) AS published,
    COUNT(*) AS count
  FROM nyt.articles
  GROUP BY 1
)
SELECT ROUND(AVG(count))
FROM dailycounts
WHERE published > DATE '2021-02-15';
```

## Estimating views

```sql
WITH normalizedviews AS (
  SELECT
    uri,
    date_trunc('hour', created) + date_part('minute', created)::int / 30 * interval '30 minutes' AS period,
    AVG(COALESCE(rank, 21)) AS rank
  FROM nyt.viewrankings
  GROUP BY 1, 2
),
views AS (
  SELECT
    uri,
    SUM(CASE
      WHEN rank = 1 THEN 4806
      WHEN rank = 2 THEN 1703
      WHEN rank = 3 THEN 1325
      WHEN rank = 4 THEN 1111
      WHEN rank = 5 THEN 972
      WHEN rank = 6 THEN 880
      WHEN rank = 7 THEN 805
      WHEN rank = 8 THEN 749
      WHEN rank = 9 THEN 700
      WHEN rank = 10 THEN 655
      WHEN rank = 11 THEN 623
      WHEN rank = 12 THEN 597
      WHEN rank = 13 THEN 576
      WHEN rank = 14 THEN 560
      WHEN rank = 15 THEN 546
      WHEN rank = 16 THEN 534
      WHEN rank = 17 THEN 521
      WHEN rank = 18 THEN 510
      WHEN rank = 19 THEN 499
      WHEN rank = 20 THEN 489
    END) AS views
  FROM normalizedviews
  GROUP BY 1
)
SELECT
  a.headline,
  v.views
FROM views AS v
  JOIN nyt.articles AS a ON a.uri=v.uri
ORDER BY views DESC LIMIT 10;
```

```sql
SELECT
  a.tone,
  ROUND(AVG(ast.views)) AS avgviews,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ast.views)) AS medianviews
FROM nyt.articles AS a
  JOIN nyt.articlestats AS ast
    ON a.uri=ast.uri
GROUP BY 1
ORDER BY 2 DESC
```

```sql
SELECT
  a.section,
  SUM(COALESCE(ast.views, 0)) AS totalviews,
  SUM(COALESCE(ast.periods, 0)) AS totalperiods
FROM nyt.articles AS a
  JOIN nyt.articlestats AS ast
    ON a.uri=ast.uri
GROUP BY 1
ORDER BY 2 DESC
```
