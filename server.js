const express = require("express");
const ordinal = require("ordinal");
const dayjs = require("dayjs");
const {
  newDBClient,
  fetchLatestArticles,
  queryHeadlines,
  fetchArticleById,
  fetchRecentPopularityData,
  fetchDeletedHeadlines,
  fetchCurrentArticles,
  fetchMostViewedArticles,
  fetchMostShownArticles,
  fetchStats,
} = require("./db");
const { POPTYPE } = require("./enum");
const logger = require("./logger");
const { data } = require("./logger");
const { fetchArticleByUrl } = require("./nyt");
const { idFromUri } = require("./utils");
const app = express();
app.set("view engine", "ejs");
app.locals.ordinal = ordinal;
app.locals.dayjs = dayjs;
const port = 3000;

const COLORS = {
  FULL: [
    "#EF4444", // Red 500
    "#3B82F6", // Blue 500
    "#10B981", // Green 500
    "#EC4899", // Pink 500
    "#F59E0B", // Yellow 500
    "#8B5CF6", // Purple 500
  ],
  LIGHT: [
    "rgba(239, 68, 68, 0.2)", // Red 500
    "rgba(59, 130, 246, 0.2)", // Blue 500
    "rgba(16, 185, 129, 0.2)", // Green 500
    "rgba(236, 72, 153, 0.2)", // Pink 500
    "rgba(245, 158, 11, 0.2)", // Yellow 500
    "rgba(139, 92, 246, 0.2)", // Purple 500
  ],
};

const renderPage = (req, res, path, vars) => {
  let hostname = req.hostname;
  if (hostname === "localhost") {
    hostname += `:${port}`;
  }
  const baseUrl = `${req.protocol}://${hostname}`;
  const title = vars.article
    ? `${vars.article.canonicalheadline} | NYT Headlines`
    : "NYT Headlines";
  const description = vars.article
    ? vars.article?.abstract
    : "Tracking the front page of the New York Times.";
  const imageUrl =
    vars.article?.imageUrl || `${baseUrl}/img/nyt-headlines-social.jpg`;
  const openGraphData = {
    title,
    description,
    imageUrl,
    canonicalUrl: `${baseUrl}${req.originalUrl}`,
  };
  res.render(path, {
    ...(vars || {}),
    ...openGraphData,
    COLORS,
    path: req.path,
  });
};

(async () => {
  const dbClient = await newDBClient();

  app.use(express.static("public"));

  app.get("/", async (req, res) => {
    const articles = await fetchCurrentArticles(dbClient);
    renderPage(req, res, "pages/frontpage", {
      articles,
    });
  });

  app.get("/frontpage", async (req, res) => {
    const articles = await fetchCurrentArticles(dbClient);
    renderPage(req, res, "pages/frontpage", {
      articles,
    });
  });

  app.get("/mostviewed", async (req, res) => {
    const articles = await fetchRecentPopularityData(dbClient, POPTYPE.VIEWED);
    renderPage(req, res, "pages/mostviewed", {
      articles,
    });
  });

  app.get("/mostshared", async (req, res) => {
    const articles = await fetchRecentPopularityData(dbClient, POPTYPE.SHARED);
    renderPage(req, res, "pages/mostshared", {
      articles,
    });
  });

  app.get("/mostemailed", async (req, res) => {
    const articles = await fetchRecentPopularityData(dbClient, POPTYPE.EMAILED);
    renderPage(req, res, "pages/mostemailed", {
      articles,
    });
  });

  app.get("/popular", async (req, res) => {
    const popularityRows = await fetchRecentPopularityData(
      dbClient,
      POPTYPE.VIEWED
    );
    const headlines = popularityRowsToHeadlines(popularityRows);
    const popularityDataTable = popularityRowsToDataTable(popularityRows);
    renderPage(req, res, "pages/popular", {
      headlines,
      popularityDataTable,
    });
  });

  app.get("/search", async (req, res) => {
    const results = await queryHeadlines(dbClient, req.query.q);
    renderPage(req, res, "pages/results", {
      query: req.query.q,
      results,
    });
  });

  app.get("/about", async (req, res) => {
    const results = await queryHeadlines(dbClient, req.query.q);
    renderPage(req, res, "pages/about");
  });

  app.get("/articles/:id", async (req, res) => {
    const article = await fetchArticleById(
      dbClient,
      `nyt://article/${req.params.id}`
    );
    if (!article) {
      res.sendStatus(404);
      return;
    }
    renderPage(req, res, "pages/article", { article });
  });

  app.get("/stats", async (req, res) => {
    const articles = await fetchStats(dbClient);
    const sorted = articles.sort((a, b) => {
      return (a.viewRankMin || 21) - (b.viewRankMin || 21);
    });
    renderPage(req, res, "pages/stats", { articles: sorted });
  });

  app.get("/deleted", async (req, res) => {
    const deletedHeadlines = await fetchDeletedHeadlines(dbClient);
    renderPage(req, res, "pages/deleted", { deletedHeadlines });
  });

  app.get("/health", async (req, res) => {
    res.send();
  });

  app.listen(port, () => {
    logger.info(`nyt-headlines app listening on :${port}`);
  });
})();

const popularityRowsToDataTable = (rows) => {
  const headlines = [...new Set(rows.map((row) => row.headline))];
  const rowsByDate = {};
  for (let row of rows) {
    const idx = headlines.indexOf(row.headline);
    const dateFormatted = row.hour.toISOString();
    let dataRow = rowsByDate[dateFormatted];
    if (!dataRow) {
      dataRow = [];
      let headlineLength = headlines.length;
      while (headlineLength--) dataRow.push(null);
    }
    dataRow[idx] = { v: parseInt(row.rank, 10) * -1, f: row.rank };
    rowsByDate[dateFormatted] = dataRow;
  }

  const data = [["Headline", ...headlines]];
  for (let key in rowsByDate) {
    data.push([key, ...rowsByDate[key]]);
  }
  return data;
};

const popularityRowsToHeadlines = (rows) => {
  rows.sort((a, b) => b.hour - a.hour);
  const latestFetchDate = rows[0].hour;
  return rows
    .filter((r) => r.hour.getTime() === latestFetchDate.getTime())
    .map((h) => ({ id: idFromUri(h.uri), ...h }));
};
