const { Client } = require("pg");
const { idFromUri } = require("./utils");
const { POPTYPE } = require("./enum");
const uuidv4 = require("uuid").v4;

exports.newDBClient = async () => {
  const dbClient = new Client({
    user: "nyt_app",
    host: "nyt-headlines.cbyvknksdshk.us-east-1.rds.amazonaws.com",
    database: "nyt",
    password: "ivzqi6WyLRkMk9tnrsrsj8qtsDJuZUnBXF9B",
    port: 5432,
  });
  await dbClient.connect();
  return dbClient;
};

exports.addHeadline = async (client, headlineInfo) => {
  const query =
    "INSERT INTO headlines (snapshotid,id,sourceid,headline,summary,uri,lastmajormodification,lastmodified,tone,retrieved) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *";
  const values = [
    uuidv4(),
    headlineInfo.id,
    headlineInfo.sourceId,
    headlineInfo.headline,
    headlineInfo.summary,
    headlineInfo.uri,
    headlineInfo.lastMajorModification,
    headlineInfo.lastModified,
    headlineInfo.tone,
    headlineInfo.retrievedAt,
  ];

  await client.query(query, values);
};

exports.fetchArticleDetails = async (client, uri) => {
  const query = `SELECT * FROM nyt.articles WHERE uri=$1`;
  const res = await client.query(query, [uri]);
  return res.rows[0] || null;
};

exports.fetchArticleDetailsByUrl = async (client, url) => {
  const query = `SELECT * FROM nyt.articles WHERE weburl=$1`;
  const res = await client.query(query, [url]);
  return res.rows[0] || null;
};

exports.fetchArticleById = async (client, id) => {
  const query = `
    SELECT
      h.uri AS id,
      h.headline,
      a.weburl,
      a.abstract,
      a.imageurl,
      a.headline AS canonicalheadline,
      a.printheadline AS printheadline,
      COUNT(*),
      MAX(retrieved) AS lastRetrieved
    FROM nyt.articles AS a
      LEFT JOIN nyt.headlines AS h ON a.uri=h.uri
    WHERE a.uri=$1
    GROUP BY 1, 2, 3, 4, 5, 6, 7
  `;
  const res = await client.query(query, [id]);
  if (res.rows.length === 0) {
    return null;
  }
  const article = await articleFromheadlines(client, id, res.rows);
  return article;
};

exports.addArticleDetails = async (client, article) => {
  const query = `
    INSERT INTO nyt.articles (uri,weburl,abstract,leadparagraph,imageurl,headline,printheadline,published,byline,wordcount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT ON CONSTRAINT articles_pkey
    DO UPDATE SET weburl=EXCLUDED.weburl`;
  const imageUrl =
    article.multimedia.length > 0
      ? `https://www.nytimes.com/${article.multimedia[0].url}`
      : null;
  await client.query(query, [
    article.uri,
    article.web_url,
    article.abstract,
    article.lead_paragraph,
    imageUrl,
    article.headline.main,
    article.headline.print_headline,
    new Date(article.pub_date),
    article.byline.original,
    article.word_count,
  ]);
};

const fetchArticleTimeSeries = async (client, uri) => {
  const query = `
    WITH minutecounts AS (
      SELECT
        date_trunc('hour', retrieved) + date_part('minute', retrieved)::int / 30 * interval '30 minutes' AS minute,
        headline,
        COUNT(*)
      FROM nyt.headlines
      WHERE uri=$1
      GROUP BY 1, 2
      ORDER BY 1 DESC
    ),
    totalperminute AS (
      SELECT
      date_trunc('hour', retrieved) + date_part('minute', retrieved)::int / 30 * interval '30 minutes' AS minute,
        COUNT(*)
      FROM nyt.headlines
      WHERE uri=$1
      GROUP BY 1
      ORDER BY 1 DESC
    ),
    viewsperminute AS (
      SELECT
        date_trunc('hour', r.created) + date_part('minute', r.created)::int / 30 * interval '30 minutes' AS period,
        SUM(r.rank) / COUNT(*) AS rank
      FROM nyt.viewrankings AS r
      WHERE r.uri=$1
      GROUP BY 1
    )
    SELECT
      minutecounts.minute,
      viewsperminute.rank,
      headline,
      minutecounts.count AS count,
      totalperminute.count AS total
    FROM minutecounts
    JOIN totalperminute ON totalperminute.minute=minutecounts.minute
    LEFT JOIN viewsperminute ON minutecounts.minute=viewsperminute.period
  `;
  const res = await client.query(query, [uri]);
  return res.rows;
};

exports.fetchArticlePopularitySeries = async (client, uri) => {
  const query = `
    SELECT
      date_trunc('hour', r.created) + date_part('minute', r.created)::int / 30 * interval '30 minutes' AS period,
      SUM(r.rank) / COUNT(*) AS rank
    FROM nyt.viewrankings AS r
    WHERE r.uri='nyt://article/5829a960-5dde-5e6d-9fa1-b0afd8252c45'
    GROUP BY 1
  `;
  const res = await client.query(query, [uri]);
  return res.rows;
};

exports.queryHeadlines = async (client, searchQuery) => {
  const tsQuery = searchQuery
    .split(" ")
    .map((w) => `${w}:*`)
    .join(" & ");
  const query = `
    SELECT h.headline, h.uri, MIN(h.retrieved) AS published
    FROM nyt.articles AS a
      JOIN nyt.headlines AS h ON a.uri=h.uri
    WHERE to_tsvector('english', h.headline) @@ to_tsquery('english', $1)
    GROUP BY 1, 2
    LIMIT 10;
  `;
  const res = await client.query(query, [tsQuery]);
  return res.rows;
};

exports.fetchLatestArticles = async (client) => {
  const query = `
    WITH current AS (
      SELECT DISTINCT uri FROM nyt.headlines WHERE retrieved > (now() - interval '30 minutes')
    )
    SELECT
      h.uri AS id,
      h.headline,
      a.weburl,
      a.abstract,
      a.imageurl,
      a.headline AS canonicalheadline,
      a.printheadline AS printheadline,
      COUNT(*),
      MAX(retrieved) AS lastRetrieved
    FROM nyt.headlines AS h
      LEFT JOIN nyt.articles AS a ON h.uri=a.uri
      INNER JOIN current ON current.uri=a.uri
    GROUP BY 1, 2, 3, 4, 5, 6, 7
    ORDER BY 4 DESC`;
  const res = await client.query(query);
  const articlesById = res.rows.reduce((acc, curr) => {
    acc[curr.id] = acc[curr.id] || [];
    acc[curr.id].push({
      headline: curr.headline,
      count: parseInt(curr.count, 10),
      retrieved: curr.lastRetrieved,
      url: curr.weburl,
      abstract: curr.abstract,
      imageUrl: curr.imageurl,
      canonicalheadline: curr.canonicalheadline,
      printheadline: curr.printheadline,
    });
    return acc;
  }, {});
  const results = Object.keys(articlesById).map(async (id) => {
    const currHeadlines = articlesById[id];
    return await articleFromheadlines(client, id, currHeadlines);
  });

  return Promise.all(results);
};

exports.addDeletedArticle = async (client, uri, headline) => {
  const query = `INSERT INTO nyt.deletedarticles (uri, headline) VALUES ($1,$2)`;
  await client.query(query, [uri, headline]);
};

const POPTYPE_TO_TABLE = {
  [POPTYPE.EMAILED]: "emailrankings",
  [POPTYPE.VIEWED]: "viewrankings",
  [POPTYPE.SHARED]: "sharerankings",
};

exports.insertPopularityData = async (client, type, data) => {
  const table = POPTYPE_TO_TABLE[type];
  const query = `INSERT INTO nyt.${table} (uri,rank) VALUES ($1,$2)`;
  for (let datum of data) {
    await client.query(query, [datum.uri, datum.rank]);
  }
};

exports.fetchRecentPopularityData = async (client, type) => {
  const table = POPTYPE_TO_TABLE[type];
  const query = `
    SELECT
      date_trunc('hour', p.created) AS hour,
      p.uri,
      a.headline,
      a.weburl,
      SUM(p.rank) / COUNT(p.rank) AS rank
    FROM nyt.${table} AS p
      JOIN nyt.articles AS a ON a.uri=p.uri
    WHERE p.created > now() - interval '1 day'
    GROUP BY 1, 2, 3, 4
    ORDER BY 1;`;
  const res = await client.query(query);
  return res.rows;
};

const articleFromheadlines = async (dbClient, id, currHeadlines) => {
  const withPct = currHeadlines.map((currHeadline) => {
    const total = currHeadlines.reduce((acc, curr) => acc + curr.count, 0);
    return {
      ...currHeadline,
      isCanonical: currHeadline.headline === currHeadline.canonicalheadline,
      pct: Math.round((100 * currHeadline.count) / total),
    };
  });

  // Get time series for article with multiple headlines
  let timeSeries = null;
  if (currHeadlines.length > 1) {
    timeSeries = await fetchArticleTimeSeries(dbClient, id);
  }

  return {
    id: idFromUri(id),
    uri: id,
    url: currHeadlines[0].weburl,
    timeSeries,
    abstract: currHeadlines[0].abstract,
    imageUrl: currHeadlines[0].imageurl,
    canonicalheadline: currHeadlines[0].canonicalheadline,
    printheadline: currHeadlines[0].printheadline,
    headlines: withPct,
  };
};
