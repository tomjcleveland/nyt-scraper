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

## Time on front page

```sql
WITH periodcounts AS (
  SELECT
    date_trunc('hour', retrieved) + date_part('minute', retrieved)::int / 30 * interval '30 minutes' AS period,
    uri,
    headline,
    1 AS present
    FROM nyt.headlines
    GROUP BY 1, 2, 3, 4
)
SELECT
  uri,
  headline,
  SUM(present) AS periods
FROM periodcounts
GROUP BY 1, 2
ORDER BY periods DESC
```

```sql
WITH latestpopminute AS (
  SELECT date_trunc('minute', created) AS minute
  FROM nyt.viewrankings
  ORDER BY 1 DESC
  LIMIT 1
),
latestpopdata AS (
  SELECT uri, rank
  FROM nyt.viewrankings AS pr
  JOIN latestpopminute AS lpm
    ON date_trunc('minute', pr.created)=lpm.minute
)
SELECT
  lpd.rank,
  a.uri,
  a.imageurl,
  a.abstract,
  a.headline AS canonicalheadline,
  s.viewcountmin,
  s.sharecountmin,
  s.emailcountmin,
  s.headlinecount,
  s.periods
FROM latestpopdata AS lpd
  JOIN nyt.articles AS a ON a.uri=lpd.uri
  JOIN nyt.articlestats AS s ON s.uri=a.uri
```

```sql
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
WHERE ac.uri='nyt://article/0e3ba8f8-01b3-5551-8b1b-0c205ea3cc51'
GROUP BY 1;
-- SELECT * FROM allcounts
-- WHERE uri='nyt://article/0e3ba8f8-01b3-5551-8b1b-0c205ea3cc51';
```

```sql
SELECT headlinecount, COUNT(*)
FROM nyt.articlestats
GROUP BY 1
ORDER BY 1 ASC
```
