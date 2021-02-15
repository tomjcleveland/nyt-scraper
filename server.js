const express = require("express");
const {
  newDBClient,
  fetchLatestArticles,
  queryHeadlines,
  fetchArticleById,
} = require("./db");
const { fetchArticleByUrl } = require("./nyt");
const app = express();
app.set("view engine", "ejs");
const port = 3000;

const COLORS = {
  FULL: [
    "rgba(239, 68, 68, 1)", // Red 500
    "rgba(59, 130, 246, 1)", // Blue 500
    "rgba(16, 185, 129, 1)", // Green 500
    "rgba(236, 72, 153, 1)", // Pink 500
    "rgba(245, 158, 11, 1)", // Yellow 500
    "rgba(139, 92, 246, 1)", // Purple 500
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

(async () => {
  const dbClient = await newDBClient();

  app.get("/", async (req, res) => {
    const articles = await fetchLatestArticles(dbClient);
    res.render("pages/index", { articles, COLORS });
  });

  app.get("/search", async (req, res) => {
    const results = await queryHeadlines(dbClient, req.query.q);
    res.json(results);
  });

  app.get("/articles/:id", async (req, res) => {
    const article = await fetchArticleById(
      dbClient,
      `nyt://article/${req.params.id}`
    );
    res.render("pages/article", { article, COLORS });
  });

  app.get("/health", async (req, res) => {
    res.send();
  });

  app.listen(port, () => {
    console.log(`nyt-headlines app listening on :${port}`);
  });
})();
