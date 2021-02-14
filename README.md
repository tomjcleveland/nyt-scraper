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
    date_trunc('hour', retrieved) AS minute,
    headline,
    COUNT(*)
  FROM nyt.headlines
  WHERE uri='nyt://article/965c72e1-4f41-53a8-96dd-f1925388aea1'
  GROUP BY 1, 2
  ORDER BY 1 DESC
),
totalperhour AS (
  SELECT
    date_trunc('hour', retrieved) AS minute,
    COUNT(*)
  FROM nyt.headlines
  WHERE uri='nyt://article/965c72e1-4f41-53a8-96dd-f1925388aea1'
  GROUP BY 1
  ORDER BY 1 DESC
),
runningtotal AS (
  SELECT
    minute,
    SUM(count) OVER (ORDER BY minute) AS totalcount
  FROM totalperhour
)
SELECT
  minutecounts.minute,
  headline,
  SUM(count) OVER (PARTITION BY headline ORDER BY minutecounts.minute),
  runningtotal.totalcount
FROM minutecounts
JOIN runningtotal ON runningtotal.minute=minutecounts.minute;
```
