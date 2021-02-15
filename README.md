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
