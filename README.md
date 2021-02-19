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

## Graph QL exploration

```
curl 'https://samizdat-graphql.nytimes.com/graphql/v2' \
  -H 'authority: samizdat-graphql.nytimes.com' \
  -H 'pragma: no-cache' \
  -H 'cache-control: no-cache' \
  -H 'nyt-app-version: 0.0.5' \
  -H 'nyt-token: MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs+/oUCTBmD/cLdmcecrnBMHiU/pxQCn2DDyaPKUOXxi4p0uUSZQzsuq1pJ1m5z1i0YGPd1U1OeGHAChWtqoxC7bFMCXcwnE1oyui9G1uobgpm1GdhtwkR7ta7akVTcsF8zxiXx7DNXIPd2nIJFH83rmkZueKrC4JVaNzjvD+Z03piLn5bHWU6+w+rA+kyJtGgZNTXKyPh6EC6o5N+rknNMG5+CdTq35p8f99WjFawSvYgP9V64kgckbTbtdJ6YhVP58TnuYgr12urtwnIqWP9KSJ1e5vmgf3tunMqWNm6+AnsqNj8mCLdCuc5cEB74CwUeQcP2HQQmbCddBy2y0mEwIDAQAB' \
  -H 'nyt-app-type: project-vi' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36' \
  -H 'x-nyt-programming-abtest: HOME_lightson_0121=1_Variant&HOME_chartbeat=0_control' \
  -H 'content-type: application/json' \
  -H 'accept: */*' \
  -H 'origin: https://www.nytimes.com' \
  -H 'sec-fetch-site: same-site' \
  -H 'sec-fetch-mode: cors' \
  -H 'sec-fetch-dest: empty' \
  -H 'referer: https://www.nytimes.com/' \
  -H 'accept-language: en-US,en;q=0.9,es;q=0.8,la;q=0.7' \
  -H 'cookie: nyt-a=z-EnbI3t2vLbxA7rCfDDLF; optimizelyEndUserId=oeu1564580208057r0.2423118182095445; walley=GA1.2.247846762.1564580210; _ga=GA1.2.1492934712.1570675170; LPVID=RkYjc2YTBlODVlMzFiYmNk; _derived_epik=dj0yJnU9THk5Uy1zdUVYR0hMdHJkdXFDQXBWam10UVlyRFRYRWombj1mQUI1NTA4aWZQS3lMU21mNEVTc3N3Jm09MSZ0PUFBQUFBRjY3VjdnJnJtPTEmcnQ9QUFBQUFGNjdWN2c; FPC=id=bcbd8d97-0377-4a10-a229-a99b6dcc1200; iter_id=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb21wYW55X2lkIjoiNWMwOThiM2QxNjU0YzEwMDAxMmM2OGY5IiwidXNlcl9pZCI6IjVkNjA5OWJjNDcwNDAxMDAwMTRlNjE1OSIsImlhdCI6MTU5Mjk2NjU0NH0.Bsf1-rfPdUKaCYQreeG233Ke3VSr0dWW76b_EpxUeUc; purr-cache=<K0<rUS-CA<C_<G_<S0; nyt-auth-method=username; __utma=69104142.1492934712.1570675170.1589335989.1610833440.3; __utmz=69104142.1610833440.3.1.utmcsr=google|utmccn=(organic)|utmcmd=organic|utmctr=(not%20provided); nyt-purr=cfshcfhssck; _fbp=fb.1.1611761418047.63835924; _gcl_au=1.1.1347484644.1612973578; _parsely_visitor={%22id%22:%22pid=6d4b1aa8493fe03b50982442caf401e8%22%2C%22session_count%22:3%2C%22last_session_ts%22:1613242414044}; __gads=ID=85173b4ee2c0355e:T=1601477910:R:S=ALNI_Mb9EPFS6yrA1tWsJ7_zsFP3w6XaMQ; nyt-gdpr=0; nyt-geo=US; b2b_cig_opt=%7B%22isCorpUser%22%3Afalse%7D; edu_cig_opt=%7B%22isEduUser%22%3Afalse%7D; NYT-S=1w.pI3e2K7UOFDSWMaf0bBePSVDTrEcxej4EgCEETOUDAAEN/uDZse4IVsU7VMZawZjOoea6bgYnRn0cf/aw.0nGoVU7PaQpUV0S9LPBBNqwWRvguF2ZiuKjxDTQO38FS1; walley_gid=GA1.2.1332535127.1613744279; nyt-us=1; nyt-m=7D3D29B9E6E0B5D2B7C03D8D4F0BE476&ier=i.0&igf=i.0&iub=i.0&ifv=i.0&pr=l.4.0.0.0.0&vp=i.0&imu=i.1&fv=i.0&cav=i.1&t=i.3&v=i.3&ft=i.0&prt=i.0&uuid=s.86debd7e-d8a6-4c18-8246-58950327cfc3&l=l.3.3498447062.265912246.4119432969&rc=i.0&igu=i.1&ica=i.0&iue=i.0&g=i.1&iru=i.1&ird=i.0&iir=i.0&iga=i.0&vr=l.4.0.0.0.0&igd=i.1&imv=i.0&ira=i.0&s=s.core&e=i.1614589200&n=i.2&er=i.1613752594; datadome=4TrumLoS5pkVZVs_fSAUClErIkOYQ97mle.vy_AafH1gha_V.2BBL_VDB5l966DJat0HZCgofOJIB88P1KvMNhcyHkCO7o92dRp3AnTJQM; nyt-jkidd=uid=67583061&lastRequest=1613752598085&activeDays=%5B1%2C1%2C1%2C1%2C1%2C1%2C1%2C1%2C1%2C0%2C1%2C1%2C1%2C1%2C0%2C1%2C0%2C0%2C1%2C0%2C1%2C1%2C1%2C1%2C1%2C1%2C0%2C1%2C0%2C1%5D&adv=23&a7dv=5&a14dv=9&a21dv=14&lastKnownType=regi' \
  --data-raw '{"operationName":"UserQuery","variables":{},"query":"   query UserQuery {  __schema { types { name } }   } "}' \
  --compressed
```

### UserQuery

```
curl 'https://samizdat-graphql.nytimes.com/graphql/v2' \
-H 'authority: samizdat-graphql.nytimes.com' \
-H 'pragma: no-cache' \
-H 'cache-control: no-cache' \
-H 'nyt-app-version: 0.0.5' \
-H 'nyt-token: MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs+/oUCTBmD/cLdmcecrnBMHiU/pxQCn2DDyaPKUOXxi4p0uUSZQzsuq1pJ1m5z1i0YGPd1U1OeGHAChWtqoxC7bFMCXcwnE1oyui9G1uobgpm1GdhtwkR7ta7akVTcsF8zxiXx7DNXIPd2nIJFH83rmkZueKrC4JVaNzjvD+Z03piLn5bHWU6+w+rA+kyJtGgZNTXKyPh6EC6o5N+rknNMG5+CdTq35p8f99WjFawSvYgP9V64kgckbTbtdJ6YhVP58TnuYgr12urtwnIqWP9KSJ1e5vmgf3tunMqWNm6+AnsqNj8mCLdCuc5cEB74CwUeQcP2HQQmbCddBy2y0mEwIDAQAB' \
-H 'nyt-app-type: project-vi' \
-H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36' \
-H 'x-nyt-programming-abtest: HOME_lightson_0121=0_Control&HOME_chartbeat=0_control' \
-H 'content-type: application/json' \
-H 'accept: */*' \
-H 'origin: https://www.nytimes.com' \
-H 'sec-fetch-site: same-site' \
-H 'sec-fetch-mode: cors' \
-H 'sec-fetch-dest: empty' \
-H 'referer: https://www.nytimes.com/' \
-H 'accept-language: en-US,en;q=0.9' \
-H 'cookie: nyt-a=IvuwKRll7q_CZssa6io4Me; nyt-gdpr=0; nyt-purr=cfshcfhssck; nyt-geo=US' \
--data-raw '{"operationName":"UserQuery","variables":{},"query":"   query UserQuery {     user {       __typename       profile {         displayName         email       }       userInfo {         regiId         entitlements         demographics {           emailSubscriptions           wat           bundleSubscriptions {             bundle             inGrace             promotion             source           }         }       }       subscriptionDetails {         graceStartDate         graceEndDate         isFreeTrial         hasQueuedSub         startDate         endDate         status         entitlements       }     }   } "}' \
--compressed
```

### MoreProgrammablesQuery

```
curl 'https://samizdat-graphql.nytimes.com/graphql/v2' \
  -H 'authority: samizdat-graphql.nytimes.com' \
  -H 'pragma: no-cache' \
  -H 'cache-control: no-cache' \
  -H 'accept: */*' \
  -H 'nyt-app-version: 0.0.5' \
  -H 'nyt-token: MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs+/oUCTBmD/cLdmcecrnBMHiU/pxQCn2DDyaPKUOXxi4p0uUSZQzsuq1pJ1m5z1i0YGPd1U1OeGHAChWtqoxC7bFMCXcwnE1oyui9G1uobgpm1GdhtwkR7ta7akVTcsF8zxiXx7DNXIPd2nIJFH83rmkZueKrC4JVaNzjvD+Z03piLn5bHWU6+w+rA+kyJtGgZNTXKyPh6EC6o5N+rknNMG5+CdTq35p8f99WjFawSvYgP9V64kgckbTbtdJ6YhVP58TnuYgr12urtwnIqWP9KSJ1e5vmgf3tunMqWNm6+AnsqNj8mCLdCuc5cEB74CwUeQcP2HQQmbCddBy2y0mEwIDAQAB' \
  -H 'nyt-app-type: project-vi' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36' \
  -H 'x-nyt-programming-abtest: HOME_lightson_0121=0_Control&HOME_chartbeat=0_control' \
  -H 'content-type: application/json' \
  -H 'origin: https://www.nytimes.com' \
  -H 'sec-fetch-site: same-site' \
  -H 'sec-fetch-mode: cors' \
  -H 'sec-fetch-dest: empty' \
  -H 'referer: https://www.nytimes.com/' \
  -H 'accept-language: en-US,en;q=0.9' \
  -H 'cookie: nyt-a=IvuwKRll7q_CZssa6io4Me; nyt-gdpr=0; nyt-purr=cfshcfhssck; nyt-geo=US; nyt-m=109BA1564A8075E1252D4E8624C580D2&iir=i.0&e=i.1614589200&fv=i.0&igf=i.0&ira=i.0&uuid=s.8d48a69a-2cc2-4245-a719-1eca5b31cd12&ft=i.0&ifv=i.0&iga=i.0&er=i.1613770060&vr=l.4.0.0.0.0&pr=l.4.0.0.0.0&t=i.1&rc=i.0&imv=i.0&ird=i.0&iru=i.1&v=i.0&n=i.2&vp=i.0&imu=i.1&s=s.core&g=i.0&cav=i.0&prt=i.0&igd=i.0&iub=i.0&igu=i.1&ica=i.0&iue=i.0&ier=i.0; purr-cache=<K0<r<C_<G_<S0; b2b_cig_opt=%7B%22isCorpUser%22%3Afalse%7D; edu_cig_opt=%7B%22isEduUser%22%3Afalse%7D; nyt-jkidd=uid=0&lastRequest=1613770060824&activeDays=%5B0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C1%5D&adv=1&a7dv=1&a14dv=1&a21dv=1&lastKnownType=anon; _gcl_au=1.1.640147955.1613770062; datadome=ULkh2DoeRZiFqtxEHKuh054rmkXamf20gv2qnDXsEzn_dckpg1_G5FOpwpcHT~bBK4R9.Hg8z_6ES4v5Mf0iBXFdAPsp5Bb9F-5ppyVr1D; walley=GA1.2.840783926.1613770062; walley_gid=GA1.2.2064183874.1613770063; __gads=ID=b8ceb07ba0b31c36-22d92a1cabc60098:T=1613770062:S=ALNI_MZQoe7p5tT8dgLTWtiQaBD51lkJVA; iter_id=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhaWQiOiI2MDMwMmQ1MTYwNzA5MzAwMDE1ZmNiNjUiLCJjb21wYW55X2lkIjoiNWMwOThiM2QxNjU0YzEwMDAxMmM2OGY5IiwiaWF0IjoxNjEzNzcwMDY1fQ.Kap39xC3MfKzE8umr098tr85QM8S4zMVkcs0HGVqRC0; _gat_UA-58630905-2=1' \
  --data-raw '{"operationName":"MoreProgrammablesQuery","variables":{"programId":"home-large","overrides":[],"contentLimit":1000},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"9f22f7cc07ad67987ab0883eb1c11e9bc1343b94b7f55387b3f43390c24cf33b"}}}' \
  --compressed
```

### MoreProgrammablesPersonalizedQuery

```
curl 'https://samizdat-graphql.nytimes.com/graphql/v2' \
  -H 'authority: samizdat-graphql.nytimes.com' \
  -H 'pragma: no-cache' \
  -H 'cache-control: no-cache' \
  -H 'accept: */*' \
  -H 'nyt-app-version: 0.0.5' \
  -H 'nyt-token: MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs+/oUCTBmD/cLdmcecrnBMHiU/pxQCn2DDyaPKUOXxi4p0uUSZQzsuq1pJ1m5z1i0YGPd1U1OeGHAChWtqoxC7bFMCXcwnE1oyui9G1uobgpm1GdhtwkR7ta7akVTcsF8zxiXx7DNXIPd2nIJFH83rmkZueKrC4JVaNzjvD+Z03piLn5bHWU6+w+rA+kyJtGgZNTXKyPh6EC6o5N+rknNMG5+CdTq35p8f99WjFawSvYgP9V64kgckbTbtdJ6YhVP58TnuYgr12urtwnIqWP9KSJ1e5vmgf3tunMqWNm6+AnsqNj8mCLdCuc5cEB74CwUeQcP2HQQmbCddBy2y0mEwIDAQAB' \
  -H 'nyt-app-type: project-vi' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36' \
  -H 'x-nyt-programming-abtest: HOME_lightson_0121=0_Control&HOME_chartbeat=0_control' \
  -H 'content-type: application/json' \
  -H 'origin: https://www.nytimes.com' \
  -H 'sec-fetch-site: same-site' \
  -H 'sec-fetch-mode: cors' \
  -H 'sec-fetch-dest: empty' \
  -H 'referer: https://www.nytimes.com/' \
  -H 'accept-language: en-US,en;q=0.9' \
  -H 'cookie: nyt-a=IvuwKRll7q_CZssa6io4Me; nyt-gdpr=0; nyt-purr=cfshcfhssck; nyt-geo=US; nyt-m=109BA1564A8075E1252D4E8624C580D2&iir=i.0&e=i.1614589200&fv=i.0&igf=i.0&ira=i.0&uuid=s.8d48a69a-2cc2-4245-a719-1eca5b31cd12&ft=i.0&ifv=i.0&iga=i.0&er=i.1613770060&vr=l.4.0.0.0.0&pr=l.4.0.0.0.0&t=i.1&rc=i.0&imv=i.0&ird=i.0&iru=i.1&v=i.0&n=i.2&vp=i.0&imu=i.1&s=s.core&g=i.0&cav=i.0&prt=i.0&igd=i.0&iub=i.0&igu=i.1&ica=i.0&iue=i.0&ier=i.0; purr-cache=<K0<r<C_<G_<S0; b2b_cig_opt=%7B%22isCorpUser%22%3Afalse%7D; edu_cig_opt=%7B%22isEduUser%22%3Afalse%7D; nyt-jkidd=uid=0&lastRequest=1613770060824&activeDays=%5B0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C1%5D&adv=1&a7dv=1&a14dv=1&a21dv=1&lastKnownType=anon; _gcl_au=1.1.640147955.1613770062; datadome=ULkh2DoeRZiFqtxEHKuh054rmkXamf20gv2qnDXsEzn_dckpg1_G5FOpwpcHT~bBK4R9.Hg8z_6ES4v5Mf0iBXFdAPsp5Bb9F-5ppyVr1D; walley=GA1.2.840783926.1613770062; walley_gid=GA1.2.2064183874.1613770063; __gads=ID=b8ceb07ba0b31c36-22d92a1cabc60098:T=1613770062:S=ALNI_MZQoe7p5tT8dgLTWtiQaBD51lkJVA; iter_id=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhaWQiOiI2MDMwMmQ1MTYwNzA5MzAwMDE1ZmNiNjUiLCJjb21wYW55X2lkIjoiNWMwOThiM2QxNjU0YzEwMDAxMmM2OGY5IiwiaWF0IjoxNjEzNzcwMDY1fQ.Kap39xC3MfKzE8umr098tr85QM8S4zMVkcs0HGVqRC0; _gat_UA-58630905-2=1' \
  --data-raw '{"operationName":"MoreProgrammablesPersonalizedQuery","variables":{"programId":"home-large"},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"8842bf3234e8462eed979f8610460bbbed64df180fec239b1f4f39c224a6a9fc"}}}' \
  --compressed
```

### Well

```
curl 'https://samizdat-graphql.nytimes.com/graphql/v2' \
  -H 'authority: samizdat-graphql.nytimes.com' \
  -H 'pragma: no-cache' \
  -H 'cache-control: no-cache' \
  -H 'accept: */*' \
  -H 'nyt-app-version: 0.0.5' \
  -H 'nyt-token: MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs+/oUCTBmD/cLdmcecrnBMHiU/pxQCn2DDyaPKUOXxi4p0uUSZQzsuq1pJ1m5z1i0YGPd1U1OeGHAChWtqoxC7bFMCXcwnE1oyui9G1uobgpm1GdhtwkR7ta7akVTcsF8zxiXx7DNXIPd2nIJFH83rmkZueKrC4JVaNzjvD+Z03piLn5bHWU6+w+rA+kyJtGgZNTXKyPh6EC6o5N+rknNMG5+CdTq35p8f99WjFawSvYgP9V64kgckbTbtdJ6YhVP58TnuYgr12urtwnIqWP9KSJ1e5vmgf3tunMqWNm6+AnsqNj8mCLdCuc5cEB74CwUeQcP2HQQmbCddBy2y0mEwIDAQAB' \
  -H 'nyt-app-type: project-vi' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36' \
  -H 'x-nyt-programming-abtest: HOME_lightson_0121=0_Control&HOME_chartbeat=0_control' \
  -H 'content-type: application/json' \
  -H 'origin: https://www.nytimes.com' \
  -H 'sec-fetch-site: same-site' \
  -H 'sec-fetch-mode: cors' \
  -H 'sec-fetch-dest: empty' \
  -H 'referer: https://www.nytimes.com/' \
  -H 'accept-language: en-US,en;q=0.9' \
  -H 'cookie: nyt-a=IvuwKRll7q_CZssa6io4Me; nyt-gdpr=0; nyt-purr=cfshcfhssck; nyt-geo=US; nyt-m=109BA1564A8075E1252D4E8624C580D2&iir=i.0&e=i.1614589200&fv=i.0&igf=i.0&ira=i.0&uuid=s.8d48a69a-2cc2-4245-a719-1eca5b31cd12&ft=i.0&ifv=i.0&iga=i.0&er=i.1613770060&vr=l.4.0.0.0.0&pr=l.4.0.0.0.0&t=i.1&rc=i.0&imv=i.0&ird=i.0&iru=i.1&v=i.0&n=i.2&vp=i.0&imu=i.1&s=s.core&g=i.0&cav=i.0&prt=i.0&igd=i.0&iub=i.0&igu=i.1&ica=i.0&iue=i.0&ier=i.0; purr-cache=<K0<r<C_<G_<S0; b2b_cig_opt=%7B%22isCorpUser%22%3Afalse%7D; edu_cig_opt=%7B%22isEduUser%22%3Afalse%7D; nyt-jkidd=uid=0&lastRequest=1613770060824&activeDays=%5B0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C1%5D&adv=1&a7dv=1&a14dv=1&a21dv=1&lastKnownType=anon; _gcl_au=1.1.640147955.1613770062; walley=GA1.2.840783926.1613770062; walley_gid=GA1.2.2064183874.1613770063; __gads=ID=b8ceb07ba0b31c36-22d92a1cabc60098:T=1613770062:S=ALNI_MZQoe7p5tT8dgLTWtiQaBD51lkJVA; iter_id=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhaWQiOiI2MDMwMmQ1MTYwNzA5MzAwMDE1ZmNiNjUiLCJjb21wYW55X2lkIjoiNWMwOThiM2QxNjU0YzEwMDAxMmM2OGY5IiwiaWF0IjoxNjEzNzcwMDY1fQ.Kap39xC3MfKzE8umr098tr85QM8S4zMVkcs0HGVqRC0; datadome=.vzI8pod15PpCamlva2xGZbCP2W586ypZxQS_psXHqYGPv4yHztFh0aH_V_pEEk~Awi86V4ilSYj5mBEEhHe_GJuHalBhxRO7yBhsrIiQf' \
  --data-raw '{"operationName":"Well","variables":{"ids":["section/world","section/us","section/politics","section/nyregion","section/business","section/technology","section/science","section/sports","section/obituaries","section/upshot","section/climate","section/education","section/health","section/reader-center","section/opinion","section/opinion/columnists","section/opinion/editorials","section/opinion/contributors","section/opinion/sunday","section/arts","section/arts/design","section/movies","section/arts/television","section/arts/music","section/theater","section/arts/dance","section/books","section/books/review","section/style","section/food","section/well","section/magazine","section/t-magazine","section/travel","section/fashion/weddings","section/realestate"]},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"31d7eb228756c88d9b785712f8be5c53efa1e1469bdfce547538ddd2b4612214"}}}' \
  --compressed
```

```
curl 'https://samizdat-graphql.nytimes.com/graphql/v2' \
  -H 'authority: samizdat-graphql.nytimes.com' \
  -H 'pragma: no-cache' \
  -H 'cache-control: no-cache' \
  -H 'accept: */*' \
  -H 'nyt-app-version: 0.0.5' \
  -H 'nyt-token: MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs+/oUCTBmD/cLdmcecrnBMHiU/pxQCn2DDyaPKUOXxi4p0uUSZQzsuq1pJ1m5z1i0YGPd1U1OeGHAChWtqoxC7bFMCXcwnE1oyui9G1uobgpm1GdhtwkR7ta7akVTcsF8zxiXx7DNXIPd2nIJFH83rmkZueKrC4JVaNzjvD+Z03piLn5bHWU6+w+rA+kyJtGgZNTXKyPh6EC6o5N+rknNMG5+CdTq35p8f99WjFawSvYgP9V64kgckbTbtdJ6YhVP58TnuYgr12urtwnIqWP9KSJ1e5vmgf3tunMqWNm6+AnsqNj8mCLdCuc5cEB74CwUeQcP2HQQmbCddBy2y0mEwIDAQAB' \
  -H 'nyt-app-type: project-vi' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36' \
  -H 'x-nyt-programming-abtest: HOME_lightson_0121=0_Control&HOME_chartbeat=0_control' \
  -H 'content-type: application/json' \
  -H 'origin: https://www.nytimes.com' \
  -H 'sec-fetch-site: same-site' \
  -H 'sec-fetch-mode: cors' \
  -H 'sec-fetch-dest: empty' \
  -H 'referer: https://www.nytimes.com/' \
  -H 'accept-language: en-US,en;q=0.9' \
  -H 'cookie: nyt-a=IvuwKRll7q_CZssa6io4Me; nyt-gdpr=0; nyt-purr=cfshcfhssck; nyt-geo=US; nyt-m=109BA1564A8075E1252D4E8624C580D2&iir=i.0&e=i.1614589200&fv=i.0&igf=i.0&ira=i.0&uuid=s.8d48a69a-2cc2-4245-a719-1eca5b31cd12&ft=i.0&ifv=i.0&iga=i.0&er=i.1613770060&vr=l.4.0.0.0.0&pr=l.4.0.0.0.0&t=i.1&rc=i.0&imv=i.0&ird=i.0&iru=i.1&v=i.0&n=i.2&vp=i.0&imu=i.1&s=s.core&g=i.0&cav=i.0&prt=i.0&igd=i.0&iub=i.0&igu=i.1&ica=i.0&iue=i.0&ier=i.0; purr-cache=<K0<r<C_<G_<S0; b2b_cig_opt=%7B%22isCorpUser%22%3Afalse%7D; edu_cig_opt=%7B%22isEduUser%22%3Afalse%7D; nyt-jkidd=uid=0&lastRequest=1613770060824&activeDays=%5B0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C1%5D&adv=1&a7dv=1&a14dv=1&a21dv=1&lastKnownType=anon; _gcl_au=1.1.640147955.1613770062; walley=GA1.2.840783926.1613770062; walley_gid=GA1.2.2064183874.1613770063; __gads=ID=b8ceb07ba0b31c36-22d92a1cabc60098:T=1613770062:S=ALNI_MZQoe7p5tT8dgLTWtiQaBD51lkJVA; iter_id=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhaWQiOiI2MDMwMmQ1MTYwNzA5MzAwMDE1ZmNiNjUiLCJjb21wYW55X2lkIjoiNWMwOThiM2QxNjU0YzEwMDAxMmM2OGY5IiwiaWF0IjoxNjEzNzcwMDY1fQ.Kap39xC3MfKzE8umr098tr85QM8S4zMVkcs0HGVqRC0; datadome=.vzI8pod15PpCamlva2xGZbCP2W586ypZxQS_psXHqYGPv4yHztFh0aH_V_pEEk~Awi86V4ilSYj5mBEEhHe_GJuHalBhxRO7yBhsrIiQf' \
  --data-raw '{"query": "query Query {__schema {queryType { name } } }"}' \
  --compressed
```
