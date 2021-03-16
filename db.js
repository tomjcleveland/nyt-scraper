const { Client } = require("pg");
const Diff2html = require("diff2html");
const Diff = require("diff");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
dayjs.extend(utc);
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
      a.uri AS id,
      a.uri,
      a.weburl,
      a.abstract,
      a.published,
      a.imageurl,
      a.headline AS canonicalheadline,
      a.printheadline AS printheadline,
      a.wordcount,
      a.deletedat,
      a.refreshedat,
      a.desk,
      a.section,
      a.subsection,
      a.tone,
      ast.periods,
      ast.headlinecount,
      ast.viewcountmin,
      ast.sharecountmin,
      ast.emailcountmin,
      ast.revisioncount,
      ast.tags
    FROM nyt.articles AS a
      JOIN nyt.articlestats AS ast ON ast.uri=a.uri
    WHERE a.uri=$1
  `;
  const res = await client.query(query, [id]);
  if (res.rows.length === 0) {
    return null;
  } else if (res.rows.length > 1) {
    throw new Error(`fetchArticleById returned ${res.rows.length} rows`);
  }
  const timeSeries = await fetchArticleTimeSeries(client, id);
  const headlines = [
    ...new Set(timeSeries.map((p) => p.headline).filter((h) => !!h)),
  ];
  return {
    ...articleFromStats(res.rows[0]),
    headlines,
    timeSeries,
  };
};

exports.fetchDiff = async (client, uri, index) => {
  const currIndex = index || 0;
  const query = `
    SELECT body, created FROM nyt.articlerevisions
    WHERE uri=$1 ORDER BY created DESC`;
  const res = await client.query(query, [uri]);
  if (!res.rows || res.rows.length < 2) {
    return null;
  } else if (res.rows.length < 2 + currIndex) {
    return { noSuchRevision: true };
  }

  const revisedAt = res.rows[currIndex].created;
  const patch = Diff.createPatch(
    dayjs(revisedAt).format("MMMM D, YYYY [at] h:mm a"),
    res.rows[currIndex + 1].body,
    res.rows[currIndex].body
  );
  const diffHtml = Diff2html.html(patch, {
    drawFileList: false,
  });
  return {
    revisedAt,
    index: currIndex,
    count: res.rows.length - 1,
    diffHtml,
  };
};

exports.upsertRevision = async (client, uri, body) => {
  const query1 = `
  SELECT body FROM nyt.articlerevisions WHERE uri=$1 ORDER BY created DESC LIMIT 1`;
  const res = await client.query(query1, [uri]);
  if (res.rows && res.rows.length > 0 && res.rows[0].body === body) {
    // No update
    return false;
  }
  const query2 = `
  INSERT INTO nyt.articlerevisions (uri,body)
  VALUES ($1,$2)`;
  await client.query(query2, [uri, body]);
  return true;
};

exports.upsertTimesTag = async (client, uri, tag) => {
  const query = `
    INSERT INTO nyt.timestags (uri,tag) VALUES ($1,$2)
    ON CONFLICT DO NOTHING`;
  await client.query(query, [uri, tag]);
};

exports.fetchArticlesToRefresh = async (client, count) => {
  const query = `
    SELECT uri, COALESCE(refreshedat, TIMESTAMP '1990-05-24 10:23:54') AS refreshedat
    FROM nyt.articles
    WHERE deletedat IS NULL
    ORDER BY refreshedat ASC
    LIMIT $1
  `;
  const res = await client.query(query, [count]);
  return res.rows.map((r) => r.uri);
};

exports.markArticleDeleted = async (client, uri) => {
  const query = `UPDATE nyt.articles SET deletedat=$2 WHERE uri=$1`;
  await client.query(query, [uri, new Date()]);
};

exports.addArticleDetails = async (client, article) => {
  const query = `
    INSERT INTO nyt.articles
      (uri,weburl,abstract,leadparagraph,imageurl,headline,printheadline,published,byline,wordcount,refreshedat,desk,section,subsection,tone)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    ON CONFLICT ON CONSTRAINT articles_pkey
    DO UPDATE SET
      weburl=EXCLUDED.weburl,
      wordcount=EXCLUDED.wordcount,
      desk=EXCLUDED.desk,
      section=EXCLUDED.section,
      subsection=EXCLUDED.subsection,
      tone=EXCLUDED.tone,
      refreshedat=EXCLUDED.refreshedat
  `;
  const imageUrl =
    article.multimedia && article.multimedia.length > 0
      ? `https://www.nytimes.com/${article.multimedia[0].url}`
      : null;
  await client.query(query, [
    article.uri,
    article.web_url || article.weburl || article.url,
    article.abstract,
    article.lead_paragraph,
    imageUrl,
    article.headline.main,
    article.headline.print_headline,
    article.pub_date ? new Date(article.pub_date) : null,
    article.byline?.original,
    article.wordCount,
    article.refreshedat,
    article.desk,
    article.section,
    article.subsection,
    article.tone,
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
      COALESCE(a.section, 'unknown') AS section,
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
  let categoryOpinionCount = 0;
  for (let row of frontPageBySectionRes.rows) {
    if (row.section === "opinion") {
      categoryOpinionCount += parseInt(row.totalperiods, 10);
    } else if (NEWS_CATEGORIES.includes(row.section)) {
      categoryNewsCount += parseInt(row.totalperiods, 10);
    } else {
      categoryFluffCount += parseInt(row.totalperiods, 10);
    }
  }
  const frontPageByCategory = [
    ["Category", "Front page time"],
    ["News", categoryNewsCount],
    ["Opinion", categoryOpinionCount],
    ["Fluff", categoryFluffCount],
  ];

  const frontPageByTagQuery = `
    SELECT
      tt.tag,
      SUM(ast.periods) AS totalperiods
    FROM nyt.timestags AS tt
    JOIN nyt.articlestats AS ast
      ON tt.uri=ast.uri
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 20`;
  const frontPageByTagRes = await client.query(frontPageByTagQuery);
  const frontPageByTag = [
    ["Tag", "Front page time"],
    ...frontPageByTagRes.rows
      .filter((r) => !r.tag.startsWith("your-feed"))
      // .filter((r) => ["Democratic Party", "Republican Party"].includes(r.tag))
      .map((r) => {
        return [r.tag, parseInt(r.totalperiods, 10)];
      }),
  ];

  const frontPageByToneQuery = `
    SELECT
      COALESCE(a.tone, 'NO_TONE_SET') AS tone,
      SUM(ast.periods) AS totalperiods
    FROM nyt.articles AS a
    JOIN nyt.articlestats AS ast
      ON a.uri=ast.uri
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 20`;
  const frontPageByToneRes = await client.query(frontPageByToneQuery);
  const frontPageByTone = [
    ["Tone", "Front page time"],
    ...frontPageByToneRes.rows.map((r) => {
      return [r.tone, parseInt(r.totalperiods, 10)];
    }),
  ];

  const abEffectsQuery = `
    SELECT
      headlinecount,
      SUM(CASE WHEN viewcountmin < 21 OR sharecountmin < 21 OR emailcountmin < 21 THEN 1 ELSE 0 END) AS ranked,
      COUNT(*) AS total
    FROM nyt.articlestats
    GROUP BY 1
    ORDER BY 1 ASC`;
  const abEffectsRes = await client.query(abEffectsQuery);
  const abEffects = [
    ["# of headlines", "% that rank"],
    ...abEffectsRes.rows.slice(1, 5).map((r) => {
      return [
        r.headlinecount,
        Math.round((100 * parseInt(r.ranked, 10)) / parseInt(r.total, 10)),
      ];
    }),
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
    frontPageByTag,
    frontPageByTone,
    newsCategories: {
      news: NEWS_CATEGORIES,
      fluff: frontPageBySectionRes.rows
        .filter(
          (r) => !NEWS_CATEGORIES.includes(r.section) && r.section !== "opinion"
        )
        .map((r) => r.section),
    },
  };
};

const stripNewlines = (str) => {
  return str.replace(/\n/gi, "");
};

exports.dedupeRevisions = async (client, uri) => {
  const query1 = `
    SELECT body, created FROM nyt.articlerevisions
    WHERE uri=$1 ORDER BY created DESC`;
  const res = await client.query(query1, [uri]);
  if (!res.rows || res.rows.length < 2) {
    return null;
  }

  const revsToDelete = [];
  let lastRevStripped = stripNewlines(res.rows[0].body);
  for (let i = 1; i < res.rows.length; i++) {
    const currRevStripped = stripNewlines(res.rows[i].body);
    if (currRevStripped === lastRevStripped) {
      revsToDelete.push(res.rows[i].created);
    }
  }

  for (let revToDelete of revsToDelete) {
    const revTimestamp = dayjs(revToDelete)
      .utc()
      .format("YYYY-MM-DD HH:mm:ss.SSS");
    const query2 = `
      DELETE FROM nyt.articlerevisions
      WHERE uri=$1
        AND DATE_TRUNC('minute', created) = DATE_TRUNC('minute', TIMESTAMP '${revTimestamp}')`;
    const res2 = await client.query(query2, [uri]);
    if (res2.rowCount != 1) {
      throw new Error(
        `Expected to delete one revision for ${uri}; deleted ${res2.rowCount}`
      );
    }
  }
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
      a.uri,
      a.weburl,
      a.abstract,
      a.imageurl,
      a.published,
      a.headline AS canonicalheadline,
      a.printheadline AS printheadline,
      a.deletedat,
      ts_rank_cd(a.tsv, to_tsquery('english', $1)) AS searchrank,
      ast.viewcountmin,
      ast.sharecountmin,
      ast.emailcountmin,
      ast.headlinecount,
      ast.revisioncount,
      ast.periods
    FROM nyt.articles AS a
      JOIN nyt.articlestats AS ast ON ast.uri=a.uri
    WHERE a.tsv @@ to_tsquery('english', $1)
    ORDER BY searchrank DESC
    LIMIT 20
  `;
  const res = await client.query(query, [tsQuery]);
  return res.rows.map((a) => articleFromStats(a));
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

exports.fetchMostXArticles = async (client, allTime, field) => {
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
        ast.revisioncount,
        ast.periods
      FROM nyt.articlestats AS ast
        JOIN nyt.articles AS a ON a.uri=ast.uri
      ${intervalClause}
      ORDER BY ${field} DESC
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
      a.deletedat,
      tt.viewcountmin,
      tt.sharecountmin,
      tt.emailcountmin,
      tt.headlinecount,
      tt.revisioncount,
      tt.periods
    FROM nyt.articles AS a
      INNER JOIN topten AS tt ON tt.uri=a.uri
    ORDER BY tt.${field} DESC`;
  const res = await client.query(query);
  return res.rows.map((a, i) => ({ ...articleFromStats(a), rank: i + 1 }));
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
      a.deletedat,
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
 * @param {Boolean} allTime Whether to fetch all-time data, or just the last week
 * @returns {Headline[]}
 */
exports.fetchDeletedArticles = async (client, allTime) => {
  let intervalClause = `a.published > now() - interval '7 days' AND`;
  if (allTime) {
    intervalClause = "";
  }
  const query = `
    SELECT
      a.uri,
      a.weburl,
      a.abstract,
      a.imageurl,
      a.published,
      a.headline AS canonicalheadline,
      a.printheadline AS printheadline,
      a.deletedat,
      ast.viewcountmin,
      ast.sharecountmin,
      ast.emailcountmin,
      ast.headlinecount,
      ast.revisioncount,
      ast.periods
    FROM nyt.articles AS a
      INNER JOIN nyt.articlestats AS ast ON ast.uri=a.uri
    WHERE ${intervalClause}
    a.deletedat IS NOT NULL
    AND a.uri LIKE '%article%'
    ORDER BY a.deletedat DESC
  `;
  const res = await client.query(query);
  return res.rows.map((a, i) => ({ ...articleFromStats(a), rank: i + 1 }));
};

const articleFromStats = (row) => {
  const url = row.weburl || row.url;
  return {
    ...row,
    id: idFromUri(row.uri),
    tags: row.tags ? row.tags.split("||") : null,
    headlineCount: parseInt(row.headlinecount, 10),
    frontPagePeriods: parseInt(row.periods, 10),
    viewRankMin: parseInt(row.viewcountmin, 10),
    shareRankMin: parseInt(row.sharecountmin, 10),
    emailRankMin: parseInt(row.emailcountmin, 10),
    revisioncount: parseInt(row.revisioncount, 10),
    imageUrl: row.imageurl || row.imageUrl,
    section: row.section || (url ? url.split("/")[6] : null),
  };
};
