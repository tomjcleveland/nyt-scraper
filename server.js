const express = require("express");
const {
  newDBClient,
  queryHeadlines,
  fetchArticleById,
  fetchRecentPopularityData,
  fetchDeletedHeadlines,
  fetchCurrentArticles,
  fetchMostShownArticles,
  fetchOverallStats,
} = require("./db");
const { getExpressLocals, COLORS } = require("./helpers");
const { POPTYPE } = require("./enum");
const logger = require("./logger");
const { idFromUri } = require("./utils");
const app = express();
app.set("view engine", "ejs");
app.locals = getExpressLocals();
const port = 3000;

const renderPage = (req, res, path, vars) => {
  let baseUrl;
  const hostname = req.get("host");
  if (hostname === `localhost:${port}`) {
    baseUrl = `http://${hostname}`;
  } else {
    // I can't for the life of me figure out
    // how to get the original hostname after
    // the ALB forwards the request
    baseUrl = "https://nyt.tjcx.me";
  }
  const title =
    vars?.title ||
    (vars?.article
      ? `${vars.article.canonicalheadline} | NYT Headlines`
      : "NYT Headlines");
  const description =
    vars?.description ||
    (vars?.article
      ? vars.article?.abstract
      : "Tracking the front page of the New York Times.");
  const imageUrl =
    vars?.article?.imageUrl || `${baseUrl}/img/nyt-headlines-social.jpg`;
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
    req,
  });
};

(async () => {
  const dbClient = await newDBClient();

  app.use(express.static("public"));

  app.get("/", async (req, res) => {
    const articles = await fetchRecentPopularityData(dbClient, POPTYPE.VIEWED);
    renderPage(req, res, "pages/mostviewed", {
      articles,
      title: "Most viewed articles",
      description: "The 20 most-viewed New York Times articles, right now.",
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
      title: "Most viewed articles",
      description: "The 20 most-viewed New York Times articles, right now.",
    });
  });

  app.get("/mostshared", async (req, res) => {
    const articles = await fetchRecentPopularityData(dbClient, POPTYPE.SHARED);
    renderPage(req, res, "pages/mostshared", {
      articles,
      title: "Most shared articles",
      description: "The 20 most-shared New York Times articles, right now.",
    });
  });

  app.get("/mostpromoted", async (req, res) => {
    const articles = await fetchMostShownArticles(
      dbClient,
      req.query.duration === "allTime"
    );
    renderPage(req, res, "pages/mostshown", {
      articles,
      title: "Most promoted articles",
      description: "The most-promoted articles from the last week.",
    });
  });

  app.get("/mostemailed", async (req, res) => {
    const articles = await fetchRecentPopularityData(dbClient, POPTYPE.EMAILED);
    renderPage(req, res, "pages/mostemailed", {
      articles,
      title: "Most emailed articles",
      description: "The 20 most-emailed New York Times articles, right now.",
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
      title: `Results for '${req.query.q}' | NYT Headlines`,
      description: `All articles in the NYT Headlines database for '${req.query.q}'`,
    });
  });

  app.get("/about", async (req, res) => {
    const results = await queryHeadlines(dbClient, req.query.q);
    renderPage(req, res, "pages/about", {
      title: "About NYT Headlines",
      description: "We track the front page of the New York Times.",
    });
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
    const stats = await fetchOverallStats(dbClient);
    renderPage(req, res, "pages/stats", {
      stats,
      title: "Statistics | NYT Headlines",
      description: "Overall statistics for New York Times articles.",
    });
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
