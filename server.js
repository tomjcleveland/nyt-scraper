const express = require("express");
const { newDBClient, fetchLatestArticles } = require("./db");
const app = express();
app.set("view engine", "ejs");
const port = 3000;

(async () => {
  const dbClient = await newDBClient();

  app.get("/", async (req, res) => {
    const articles = await fetchLatestArticles(dbClient);
    res.render("pages/index", { articles: articles });
  });

  app.get("/health", async (req, res) => {
    res.send();
  });

  app.listen(port, () => {
    console.log(`nyt-headlines app listening on :${port}`);
  });
})();
