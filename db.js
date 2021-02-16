const { Client } = require("pg");
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
  SELECT * FROM nyt.articles WHERE uri=$1`;
  const res = await client.query(query, [id]);
  return res.rows[0] || null;
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
    )
    SELECT
      minutecounts.minute,
      headline,
      minutecounts.count AS count,
      totalperminute.count AS total
    FROM minutecounts
    JOIN totalperminute ON totalperminute.minute=minutecounts.minute;
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
    SELECT h.headline, h.uri
    FROM nyt.articles AS a
      JOIN nyt.headlines AS h ON a.uri=h.uri
    WHERE to_tsvector('english', h.headline) @@ to_tsquery('english', $1)
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
      a.printheadline,
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
      canonicalHeadline: curr.canonicalheadline,
      printHeadline: curr.printheadline,
    });
    return acc;
  }, {});
  const results = Object.keys(articlesById).map(async (id) => {
    const currHeadlines = articlesById[id];
    const withPct = currHeadlines.map((currHeadline) => {
      const total = currHeadlines.reduce((acc, curr) => acc + curr.count, 0);
      return {
        ...currHeadline,
        isCanonical: currHeadline.headline === currHeadline.canonicalHeadline,
        pct: Math.round((100 * currHeadline.count) / total),
      };
    });

    // Get time series for article with multiple headlines
    let timeSeries = null;
    if (currHeadlines.length > 1) {
      timeSeries = await fetchArticleTimeSeries(client, id);
    }

    return {
      id,
      uri: id,
      url: currHeadlines[0].url,
      timeSeries,
      abstract: currHeadlines[0].abstract,
      imageUrl: currHeadlines[0].imageUrl,
      canonicalHeadline: currHeadlines[0].canonicalHeadline,
      printHeadline: currHeadlines[0].printHeadline,
      headlines: withPct,
    };
  });

  return Promise.all(results);
};
