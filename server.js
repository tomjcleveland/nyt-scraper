const express = require("express");
const ordinal = require("ordinal");
const {
  newDBClient,
  fetchLatestArticles,
  queryHeadlines,
  fetchArticleById,
  fetchRecentPopularityData,
  fetchDeletedHeadlines,
} = require("./db");
const { POPTYPE } = require("./enum");
const logger = require("./logger");
const { data } = require("./logger");
const { fetchArticleByUrl } = require("./nyt");
const { idFromUri } = require("./utils");
const app = express();
app.set("view engine", "ejs");
app.locals.ordinal = ordinal;
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

(async () => {
  const dbClient = await newDBClient();

  app.get("/", async (req, res) => {
    const articles = await fetchLatestArticles(dbClient);
    res.render("pages/index", {
      articles,
      COLORS,
    });
  });

  app.get("/popular", async (req, res) => {
    const popularityRows = await fetchRecentPopularityData(
      dbClient,
      POPTYPE.VIEWED
    );
    const headlines = popularityRowsToHeadlines(popularityRows);
    const popularityDataTable = popularityRowsToDataTable(popularityRows);
    res.render("pages/popular", {
      COLORS,
      headlines,
      popularityDataTable,
    });
  });

  app.get("/search", async (req, res) => {
    const results = await queryHeadlines(dbClient, req.query.q);
    res.render("pages/results", { query: req.query.q, COLORS, results });
  });

  app.get("/articles/:id", async (req, res) => {
    const article = await fetchArticleById(
      dbClient,
      `nyt://article/${req.params.id}`
    );
    res.render("pages/article", { article, COLORS });
  });

  app.get("/deleted", async (req, res) => {
    const deletedHeadlines = await fetchDeletedHeadlines(dbClient);
    res.render("pages/deleted", { deletedHeadlines, COLORS });
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
