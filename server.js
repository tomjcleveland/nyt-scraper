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
  fetchMostXArticles,
  fetchLatestDiff,
  fetchDeletedArticles,
  fetchDiff,
  fetchArticleCreators,
  fetchMostPopularCreators,
} = require("./db");
const { TONE } = require("./types");
const { getExpressLocals, COLORS } = require("./helpers");
const { POPTYPE } = require("./enum");
const logger = require("./logger");
const { idFromUri } = require("./utils");
const Sentry = require("@sentry/node");
const { sentryInit } = require("./sentry");
const { fetchPostingDifficultyData } = require("./hackerNews");

sentryInit();
const app = express();
app.use(Sentry.Handlers.requestHandler());
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
      ? `${vars.article.canonicalheadline} | NYT Tracker`
      : "NYT Tracker");
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
    const tone = TONE[req.query.tone];
    const articlesByTone = await fetchCurrentArticles(dbClient);
    let articles = Object.values(articlesByTone).flat();
    if (tone) {
      articles = articlesByTone[tone];
    }
    const toneCounts = Object.keys(articlesByTone).reduce((prev, curr) => {
      prev[curr] = articlesByTone[curr].length;
      return prev;
    }, {});
    renderPage(req, res, "pages/frontpage", {
      articles,
      tone,
      toneCounts,
      title: "NYT Tracker | Front page",
      description: "The current front page of the New York Times.",
    });
  });

  app.get("/topviewed", async (req, res) => {
    const articles = await fetchRecentPopularityData(dbClient, POPTYPE.VIEWED);
    renderPage(req, res, "pages/mostviewed", {
      articles,
      title: "Most viewed articles",
      description: "The 20 most-viewed New York Times articles, right now.",
    });
  });

  app.get("/topshared", async (req, res) => {
    const articles = await fetchRecentPopularityData(dbClient, POPTYPE.SHARED);
    renderPage(req, res, "pages/mostshared", {
      articles,
      title: "Most shared articles",
      description: "The 20 most-shared New York Times articles, right now.",
    });
  });

  app.get("/topemailed", async (req, res) => {
    const articles = await fetchRecentPopularityData(dbClient, POPTYPE.EMAILED);
    renderPage(req, res, "pages/mostemailed", {
      articles,
      title: "Most emailed articles",
      description: "The 20 most-emailed New York Times articles, right now.",
    });
  });

  app.get("/mostpromoted", async (req, res) => {
    const allTime = req.query.duration === "allTime";
    const articles = await fetchMostXArticles(dbClient, allTime, "periods");
    renderPage(req, res, "pages/mostshown", {
      articles,
      title: "Most promoted articles",
      description: `The most-promoted articles ${
        allTime ? "of all time" : "in the last week"
      }.`,
    });
  });

  app.get("/mostheadlines", async (req, res) => {
    const allTime = req.query.duration === "allTime";
    const articles = await fetchMostXArticles(
      dbClient,
      allTime,
      "headlinecount"
    );
    renderPage(req, res, "pages/mostheadlines", {
      articles,
      title: "Articles with the most headlines",
      description: `The articles with the most headlines ${
        allTime ? "of all time" : "in the last week"
      }.`,
    });
  });

  app.get("/mostrevisions", async (req, res) => {
    const allTime = req.query.duration === "allTime";
    const articles = await fetchMostXArticles(
      dbClient,
      allTime,
      "revisioncount"
    );
    renderPage(req, res, "pages/mostrevisions", {
      articles,
      title: "Articles with the most revisions",
      description: `The articles that have been revised most ${
        allTime ? "of all time" : "in the last week"
      }.`,
    });
  });

  app.get("/search", async (req, res) => {
    const results = await queryHeadlines(dbClient, req.query.q);
    renderPage(req, res, "pages/results", {
      query: req.query.q,
      results,
      title: `Results for '${req.query.q}' | NYT Tracker`,
      description: `All articles in the NYT Tracker database for '${req.query.q}'`,
    });
  });

  app.get("/about", async (req, res) => {
    const results = await queryHeadlines(dbClient, req.query.q);
    renderPage(req, res, "pages/about", {
      title: "About NYT Tracker",
      description: "We track the front page of the New York Times.",
    });
  });

  app.get("/articles/:id", async (req, res) => {
    const uri = `nyt://article/${req.params.id}`;
    const index = parseInt(req.query.rev, 10) || 0;
    if (index < 0) {
      res.redirect(req.path);
      return;
    }
    const article = await fetchArticleById(dbClient, uri);
    if (!article) {
      res.sendStatus(404);
      return;
    }
    const creators = await fetchArticleCreators(dbClient, uri);
    const diffInfo = await fetchDiff(dbClient, uri, index);
    if (diffInfo?.noSuchRevision) {
      res.redirect(req.path);
      return;
    }
    renderPage(req, res, "pages/article", { article, creators, diffInfo });
  });

  app.get("/stats", async (req, res) => {
    const stats = await fetchOverallStats(dbClient);
    renderPage(req, res, "pages/stats", {
      stats,
      title: "Statistics | NYT Tracker",
      description: "Overall statistics for New York Times articles.",
    });
  });

  app.get("/creators", async (req, res) => {
    const creators = await fetchMostPopularCreators(dbClient);
    const creatorsBySection = creators.reduce((prev, curr) => {
      prev[curr.section] = prev[curr.section] || [];
      if (prev[curr.section].length < 10) {
        prev[curr.section] = [...prev[curr.section], curr];
      }
      return prev;
    }, {});
    renderPage(req, res, "pages/creators", {
      creatorsBySection,
      title: "Journalists | NYT Tracker",
      description: "View top New York Times journalists.",
    });
  });

  app.get("/deleted", async (req, res) => {
    const allTime = req.query.duration === "allTime";
    const articles = await fetchDeletedArticles(dbClient, allTime);
    renderPage(req, res, "pages/deleted", {
      articles,
      title: "Deleted articles | NYT Tracker",
      description: "Articles that have deleted from the NYT's public API.",
    });
  });

  app.get("/hn", async (req, res) => {
    const hnData = await fetchPostingDifficultyData();
    renderPage(req, res, "pages/hn", {
      hnData,
      title: "When to post to Hacker News",
      description:
        "Use live data to determine the best time to post to Hacker News.",
    });
  });

  app.get("/health", async (req, res) => {
    res.send();
  });

  app.listen(port, () => {
    logger.info(`nyt-headlines app listening on :${port}`);
  });
})();
