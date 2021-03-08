const { Client } = require("pg");
const { idFromUri } = require("./utils");
const { POPTYPE } = require("./enum");
const uuidv4 = require("uuid").v4;

const NEWS_CATEGORIES = [
  "us",
  "world",
  "business",
  "technology",
  "climate",
  "science",
  "nyregion",
  "briefing",
  "upshot",
  "health",
  "education",
];

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
      a.published,
      a.imageurl,
      a.headline AS canonicalheadline,
      a.printheadline AS printheadline,
      MIN(h.retrieved) AS firstseen,
      COUNT(*),
      MAX(retrieved) AS lastRetrieved,
      MIN(ast.periods) AS periods,
      MIN(ast.headlinecount) AS headlinecount,
      MIN(ast.viewcountmin) AS viewcountmin,
      MIN(ast.sharecountmin) AS sharecountmin,
      MIN(ast.emailcountmin) AS emailcountmin
    FROM nyt.articles AS a
      LEFT JOIN nyt.headlines AS h ON a.uri=h.uri
      JOIN nyt.articlestats AS ast ON ast.uri=a.uri
    WHERE a.uri=$1
    GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
  `;
  const res = await client.query(query, [id]);
  if (res.rows.length === 0) {
    return null;
  }
  const article = await articleFromheadlines(client, id, res.rows);
  return articleFromStats(article);
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
        MIN(retrieved) AS firstseen,
        COUNT(*)
      FROM nyt.headlines
      WHERE uri=$1
      GROUP BY 1
      ORDER BY 1 DESC
    ),
    viewsperminute AS (
      SELECT
        date_trunc('hour', r.created) + date_part('minute', r.created)::int / 30 * interval '30 minutes' AS period,
        AVG(r.rank) AS rank
      FROM nyt.viewrankings AS r
      WHERE r.uri=$1
      GROUP BY 1
    )
    SELECT
      COALESCE(minutecounts.minute, viewsperminute.period) AS minute,
      viewsperminute.rank,
      headline,
      minutecounts.count AS count,
      tpm.count AS total,
      tpm.firstseen
    FROM minutecounts
    JOIN totalperminute AS tpm ON tpm.minute=minutecounts.minute
    FULL OUTER JOIN viewsperminute ON minutecounts.minute=viewsperminute.period
  `;
  const res = await client.query(query, [uri]);
  return res.rows.map((ts) => {
    return {
      ...ts,
      rank: parseFloat(ts.rank),
      count: parseInt(ts.count, 10),
      total: parseInt(ts.total, 10),
    };
  });
};

exports.fetchOverallStats = async (client) => {
  const pieChartQuery = `
    SELECT
      COUNT(*),
      SUM(CASE WHEN headlinecount > 0 THEN 1 ELSE 0 END) AS frontpage,
      SUM(CASE WHEN
        viewcountmin < 21 OR sharecountmin < 21 OR emailcountmin < 21
        THEN 1 ELSE 0 END) AS ranked
    FROM nyt.articlestats`;
  const pieChartRes = await client.query(pieChartQuery);
  const pieChartResult = pieChartRes.rows[0];
  const totalCount = parseInt(pieChartResult.count, 10);
  const totalFrontPageCount = parseInt(pieChartResult.frontpage, 10);
  const overlapCount =
    parseInt(pieChartResult.ranked, 10) +
    parseInt(pieChartResult.frontpage, 10) -
    pieChartResult.count;
  const pieChart = [
    ["Category", "# articles"],
    ["Front page only", parseInt(pieChartResult.frontpage, 10) - overlapCount],
    ["Ranked only", parseInt(pieChartResult.ranked, 10) - overlapCount],
    ["Ranked & front page", overlapCount],
  ];

  const frontPageBySectionQuery = `
    SELECT
      SPLIT_PART(a.weburl, '/', 7) AS section,
      SUM(st.periods) AS totalperiods
    FROM nyt.articles AS a
      JOIN nyt.articlestats AS st ON a.uri=st.uri
    WHERE st.headlinecount > 0
    GROUP BY 1
    ORDER BY  2 DESC`;
  const frontPageBySectionRes = await client.query(frontPageBySectionQuery);
  const frontPageBySection = [
    ["Section", "Front page time"],
    ...frontPageBySectionRes.rows.map((r) => [
      r.section,
      parseInt(r.totalperiods, 10),
    ]),
  ];
  let categoryNewsCount = 0;
  let categoryFluffCount = 0;
  for (let row of frontPageBySectionRes.rows) {
    if (NEWS_CATEGORIES.includes(row.section)) {
      categoryNewsCount += parseInt(row.totalperiods, 10);
    } else {
      categoryFluffCount += parseInt(row.totalperiods, 10);
    }
  }
  const frontPageByCategory = [
    ["Category", "Front page time"],
    ["News", categoryNewsCount],
    ["Fluff", categoryFluffCount],
  ];

  const abEffectsQuery = `
    SELECT
      SUM(CASE WHEN COALESCE(headlinecount, 0) > 1 AND (viewcountmin < 21 OR sharecountmin < 21 OR emailcountmin < 21) THEN 1 ELSE 0 END) AS ie,
      SUM(CASE WHEN COALESCE(headlinecount, 0) <= 1 AND (viewcountmin < 21 OR sharecountmin < 21 OR emailcountmin < 21) THEN 1 ELSE 0 END) AS ce,
      SUM(CASE WHEN COALESCE(headlinecount, 0) <= 1 AND NOT (viewcountmin < 21 OR sharecountmin < 21 OR emailcountmin < 21) THEN 1 ELSE 0 END) AS cn,
      SUM(CASE WHEN COALESCE(headlinecount, 0) > 1 AND NOT (viewcountmin < 21 OR sharecountmin < 21 OR emailcountmin < 21) THEN 1 ELSE 0 END) AS "in"
    FROM nyt.articlestats`;
  const abEffectsRes = await client.query(abEffectsQuery);
  const abData = abEffectsRes.rows[0];
  const abEffects = [
    ["Group", "% that rank"],
    ["A/B Tested", Math.round((100 * abData.ie) / abData.in)],
    ["One headline", Math.round((100 * abData.ce) / abData.cn)],
  ];

  const headlineHistQuery = `SELECT headlinecount, COUNT(*)
    FROM nyt.articlestats
    GROUP BY 1
    ORDER BY 1 ASC`;
  const headlineHistRes = await client.query(headlineHistQuery);
  const headlineHistogram = [
    ["Headlines", "% of total"],
    ...headlineHistRes.rows.slice(1).map((r) => {
      return [
        parseInt(r.headlinecount, 10),
        Math.round((100 * parseInt(r.count, 10)) / totalFrontPageCount),
      ];
    }),
  ];

  const daysHistQuery = `
    SELECT
      CEILING(COALESCE(periods::decimal, 0.0) / 2) AS days,
      COUNT(*)
    FROM nyt.articlestats
    GROUP BY 1
    ORDER BY 1 ASC`;
  const daysHistRes = await client.query(daysHistQuery);
  const daysHistogram = [
    ["Days", "% of total"],
    ...daysHistRes.rows.slice(1, 48).map((r) => {
      return [
        parseInt(r.days, 10),
        (100 * parseInt(r.count, 10)) / totalFrontPageCount,
      ];
    }),
  ];

  const scatterQuery = `
    SELECT headlinecount, viewcountmin
    FROM nyt.articlestats`;
  const scatterRes = await client.query(scatterQuery);
  const scatter = [
    ["# headlines", "Best view rank"],
    ...scatterRes.rows
      .filter((r) => r.viewcountmin <= 20 && r.headlinecount > 0)
      .map((r) => [
        parseInt(r.headlinecount, 10),
        { v: -1 * parseInt(r.viewcountmin, 10), f: r.viewcountmin },
      ]),
  ];

  return {
    headlineHistogram,
    daysHistogram,
    scatter,
    firstCapture: new Date(2021, 1, 13),
    articleCount: parseInt(pieChartResult.count, 10),
    pieChart,
    abEffects,
    frontPageBySection,
    frontPageByCategory,
    newsCategories: {
      news: NEWS_CATEGORIES,
      fluff: frontPageBySectionRes.rows
        .filter((r) => !NEWS_CATEGORIES.includes(r.section))
        .map((r) => r.section),
    },
  };
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
  if (!searchQuery) {
    return [];
  }
  const tsQuery = searchQuery
    .split(" ")
    .map((w) => `${w}:*`)
    .join(" & ");
  const query = `
    SELECT
      h.uri AS id,
      h.headline,
      a.weburl,
      a.abstract,
      a.imageurl,
      a.headline AS canonicalheadline,
      a.printheadline AS printheadline,
      ast.viewcountmin,
      ast.sharecountmin,
      ast.emailcountmin,
      ast.headlinecount,
      ast.periods,
      COUNT(*),
      MAX(retrieved) AS lastRetrieved
    FROM nyt.articles AS a
      JOIN nyt.headlines AS h ON a.uri=h.uri
      JOIN nyt.articlestats AS ast ON ast.uri=h.uri
    WHERE to_tsvector('english', h.headline) @@ to_tsquery('english', $1)
    GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
    ORDER BY 11 DESC
    LIMIT 20;
  `;
  const res = await client.query(query, [tsQuery]);
  const articles = await articlesFromHeadlines(client, res.rows, true);
  return articles.map((a) => articleFromStats(a));
};

/**
 * Fetches articles currently on the front page
 * @param {*} client
 * @returns {Article[]}
 */
exports.fetchCurrentArticles = async (client) => {
  const query = `
    WITH lp AS (
      SELECT MAX(retrieved) AS period FROM nyt.headlines
    ),
    latest AS (
      SELECT h.uri
      FROM nyt.headlines AS h JOIN lp ON lp.period=h.retrieved
    )
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
      ast.periods
    FROM latest
      JOIN nyt.articles AS a ON latest.uri=a.uri
      JOIN nyt.articlestats AS ast ON ast.uri=a.uri
    ORDER BY 5 ASC`;
  const res = await client.query(query);
  return res.rows.map((a) => articleFromStats(a));
};

/**
 * Fetches stats for all articles in time range
 * @param {*} client
 * @returns {Article[]}
 */
exports.fetchStats = async (client) => {
  const query = `
    SELECT
      a.uri,
      a.imageurl,
      a.abstract,
      a.headline AS canonicalheadline,
      s.viewcountmin,
      s.sharecountmin,
      s.emailcountmin,
      s.headlinecount,
      s.periods
    FROM nyt.articles AS a
      JOIN nyt.articlestats AS s ON s.uri=a.uri
    WHERE a.published > now() - interval '1 day'
  `;
  const res = await client.query(query);
  return res.rows.map((a) => articleFromStats(a));
};

/**
 * Fetches current most-viewed articles, with time series
 * @param {*} client
 * @returns {Article[]}
 */
exports.fetchMostViewedArticles = async (client) => {
  const query = `
    WITH latestranked AS (
      SELECT uri, rank FROM nyt.viewrankings WHERE date_trunc('hour', created)=date_trunc('hour', (SELECT MAX(created) FROM nyt.viewrankings))
    )
    SELECT
      h.uri AS id,
      latestranked.rank AS rank,
      h.headline,
      a.weburl,
      a.abstract,
      a.imageurl,
      a.headline AS canonicalheadline,
      a.printheadline AS printheadline,
      COUNT(*),
      MAX(retrieved) AS lastRetrieved
    FROM nyt.headlines AS h
      JOIN nyt.articles AS a ON h.uri=a.uri
      INNER JOIN latestranked ON latestranked.uri=a.uri
    GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
    ORDER BY 4 DESC`;
  const res = await client.query(query);
  return articlesFromHeadlines(client, res.rows);
};

exports.fetchMostShownArticles = async (client, allTime) => {
  let intervalClause = `WHERE a.published > now() - interval '7 days'`;
  if (allTime) {
    intervalClause = "";
  }
  const query = `
    WITH topten AS (
      SELECT
        ast.uri,
        ast.viewcountmin,
        ast.sharecountmin,
        ast.emailcountmin,
        ast.headlinecount,
        ast.periods
      FROM nyt.articlestats AS ast
        JOIN nyt.articles AS a ON a.uri=ast.uri
      ${intervalClause}
      ORDER BY periods DESC
      LIMIT 20
    )
    SELECT
      a.uri,
      a.weburl,
      a.abstract,
      a.imageurl,
      a.published,
      a.headline AS canonicalheadline,
      a.printheadline AS printheadline,
      tt.viewcountmin,
      tt.sharecountmin,
      tt.emailcountmin,
      tt.headlinecount,
      tt.periods
    FROM nyt.articles AS a
      INNER JOIN topten AS tt ON tt.uri=a.uri
    ORDER BY tt.periods DESC`;
  const res = await client.query(query);
  return res.rows.map((a, i) => ({ ...articleFromStats(a), rank: i + 1 }));
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
  if (!table) return null;
  const query = `
    WITH latestpopminute AS (
      SELECT date_trunc('minute', created) AS minute
      FROM nyt.${table}
      ORDER BY 1 DESC
      LIMIT 1
    ),
    latestpopdata AS (
      SELECT uri, rank
      FROM nyt.${table} AS pr
      JOIN latestpopminute AS lpm
        ON date_trunc('minute', pr.created)=lpm.minute
    )
    SELECT
      lpd.rank,
      a.uri,
      a.imageurl,
      a.weburl,
      a.abstract,
      a.published,
      a.headline AS canonicalheadline,
      s.viewcountmin,
      s.sharecountmin,
      s.emailcountmin,
      s.headlinecount,
      s.periods
    FROM latestpopdata AS lpd
      JOIN nyt.articles AS a ON a.uri=lpd.uri
      JOIN nyt.articlestats AS s ON s.uri=a.uri
    ORDER BY 1 ASC`;
  const res = await client.query(query);
  return res.rows.map((a) => articleFromStats(a));
};

/**
 * Fetch headlines whose URIs no longer exist in the public API
 * @param {*} client
 * @returns {Headline[]}
 */
exports.fetchDeletedHeadlines = async (client) => {
  const query = `
    SELECT h.uri, h.headline FROM nyt.headlines AS h LEFT JOIN nyt.articles AS a ON h.uri=a.uri WHERE a.uri IS NULL GROUP BY 1, 2
  `;
  const res = await client.query(query);
  return res.rows;
};

/**
 * Create many Articles from headlines data
 * @param {*} dbClient
 * @param {*} id
 * @param {*} currHeadlines
 * @param {boolean} [skipTimeSeries] If true, skip fetching time series data
 * @returns {Article[]}
 */
const articlesFromHeadlines = async (
  dbClient,
  headlineRows,
  skipTimeSeries
) => {
  const articlesById = headlineRows.reduce((acc, curr) => {
    acc[curr.id] = acc[curr.id] || [];
    acc[curr.id].push({
      ...curr,
      headline: curr.headline,
      count: parseInt(curr.count, 10),
      retrieved: curr.lastRetrieved,
    });
    return acc;
  }, {});

  const results = Object.keys(articlesById).map(async (id) => {
    const currHeadlines = articlesById[id];
    return await articleFromheadlines(
      dbClient,
      id,
      currHeadlines,
      skipTimeSeries
    );
  });

  return Promise.all(results);
};

const articleFromStats = (row) => {
  const url = row.weburl || row.url;
  return {
    ...row,
    id: idFromUri(row.uri),
    headlineCount: parseInt(row.headlinecount, 10),
    frontPagePeriods: parseInt(row.periods, 10),
    viewRankMin: parseInt(row.viewcountmin, 10),
    shareRankMin: parseInt(row.sharecountmin, 10),
    emailRankMin: parseInt(row.emailcountmin, 10),
    imageUrl: row.imageurl || row.imageUrl,
    section: url ? url.split("/")[6] : null,
  };
};

/**
 * Create a Article object from headline data
 * @param {*} dbClient
 * @param {string} id
 * @param {*} currHeadlines
 * @param {boolean} [skipTimeSeries] If true, skip fetching time series data
 * @returns {Article}
 */
const articleFromheadlines = async (
  dbClient,
  id,
  currHeadlines,
  skipTimeSeries
) => {
  const url = currHeadlines[0].weburl;
  const rank = parseInt(currHeadlines[0].rank, 10);
  const abstract = currHeadlines[0].abstract;
  const imageUrl = currHeadlines[0].imageurl;
  const canonicalheadline = currHeadlines[0].canonicalheadline;
  const printheadline = currHeadlines[0].printheadline;
  const periods = currHeadlines[0].periods;
  const viewcountmin = currHeadlines[0].viewcountmin;
  const sharecountmin = currHeadlines[0].sharecountmin;
  const emailcountmin = currHeadlines[0].emailcountmin;
  const headlinecount = currHeadlines[0].headlinecount;
  const published = currHeadlines[0].published;
  const total = currHeadlines.reduce(
    (acc, curr) => acc + parseInt(curr.count, 10),
    0
  );
  const frontPagePeriods = parseInt(currHeadlines[0].periods, 10);
  const withPct = currHeadlines
    .map((currHeadline) => {
      const newHeadline = {
        ...currHeadline,
        pct: Math.round((100 * parseInt(currHeadline.count, 10)) / total),
      };
      delete newHeadline.weburl;
      delete newHeadline.rank;
      delete newHeadline.abstract;
      delete newHeadline.imageurl;
      delete newHeadline.canonicalheadline;
      delete newHeadline.printheadline;
      delete newHeadline.periods;
      delete newHeadline.viewcountmin;
      delete newHeadline.sharecountmin;
      delete newHeadline.emailcountmin;
      delete newHeadline.headlinecount;
      return newHeadline;
    })
    .sort((a, b) => a.firstseen - b.firstseen);

  // Get time series for article with multiple headlines
  let timeSeries = null;
  if (!skipTimeSeries) {
    timeSeries = await fetchArticleTimeSeries(dbClient, id);
  }

  return {
    id: idFromUri(id),
    uri: id,
    url,
    rank,
    timeSeries,
    abstract,
    imageUrl,
    published,
    canonicalheadline,
    printheadline,
    frontPagePeriods,
    periods,
    viewcountmin,
    sharecountmin,
    emailcountmin,
    headlinecount,
    headlines: withPct,
  };
};
