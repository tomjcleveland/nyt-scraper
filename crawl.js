const puppeteer = require("puppeteer");
const {
  newDBClient,
  addHeadline,
  fetchArticleDetails,
  addArticleDetails,
  fetchLatestArticles,
} = require("./db");
const USER_AGENTS = require("./userAgents");
const logger = require("./logger");
const { fetchArticle } = require("./nyt");

const getRandomUserAgent = () => {
  const idx = Math.floor(Math.random() * USER_AGENTS.length);
  return USER_AGENTS[idx];
};

const loadNYTHeadlines = async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const userAgent = getRandomUserAgent();
  page.setUserAgent(userAgent);
  logger.info(`Opened new page with User-Agent: ${userAgent}`);
  await page.goto("https://www.nytimes.com/");
  const initialState = await page.evaluate((_) => {
    return window.__preloadedData.initialState;
  });
  await browser.close();
  const articleIds = Object.keys(initialState)
    .filter((key) => {
      if (key.startsWith("Article:")) {
        return true;
      }
      return false;
    })
    .map((id) => id.split(".")[0])
    .filter((id, idx, arr) => arr.indexOf(id) === idx);
  const retrievedAt = new Date();
  return articleIds.map((id) => {
    const articleDetails = initialState[id];
    return {
      id: id,
      sourceId: articleDetails.sourceId,
      headline: articleDetails.promotionalHeadline,
      summary: articleDetails.promotionalSummary,
      uri: articleDetails.uri,
      lastMajorModification: new Date(articleDetails.lastMajorModification),
      lastModified: new Date(articleDetails.lastModified),
      tone: articleDetails.tone,
      retrievedAt,
    };
  });
};

const upsertArticle = async (dbClient, uri) => {
  const existingArticle = await fetchArticleDetails(dbClient, uri);
  if (!existingArticle) {
    logger.info(`Fetching article metadata for ${uri}`);
    const fetchedArticle = await fetchArticle(uri);
    if (!fetchedArticle) {
      throw new Error(`No article found for uri ${uri}`);
    }
    await addArticleDetails(dbClient, fetchedArticle);
  }
};

const takeHeadlineSnapshot = async () => {
  logger.info("Script started");
  const dbClient = await newDBClient();
  const headlineInfo = await loadNYTHeadlines();
  for (const hi of headlineInfo) {
    await addHeadline(dbClient, hi);
    await upsertArticle(dbClient, hi.uri);
  }
  dbClient.end();
  logger.info(`Saved ${headlineInfo.length} headlines to DB`);
};

const updateArticleData = async () => {
  const dbClient = await newDBClient();
  const articles = await fetchLatestArticles(dbClient);
  for (let article of articles) {
    try {
      await upsertArticle(dbClient, article.uri);
    } catch (err) {
      logger.error(`Failed to upsert ${article.headlines[0].headline}`, err);
    }
  }
  dbClient.end();
};

takeHeadlineSnapshot();
// updateArticleData();
