const puppeteer = require("puppeteer");
const {
  newDBClient,
  addHeadline,
  fetchArticleDetails,
  fetchArticleDetailsByUrl,
  addArticleDetails,
  fetchLatestArticles,
} = require("./db");
const UserAgent = require("user-agents");
const logger = require("./logger");
const { sentryInit, captureException } = require("./sentry");
const {
  fetchArticleByUri,
  fetchArticleByUrl,
  upsertArticleByUri,
  upsertArticleByUrl,
} = require("./nyt");

sentryInit();

const getRandomUserAgent = () => {
  return new UserAgent().toString();
};

const loadNYTHomepage = async (browser) => {
  const page = await browser.newPage();
  const userAgent = getRandomUserAgent();
  page.setUserAgent(userAgent);
  logger.info(`Opened new page with User-Agent: ${userAgent}`);
  await page.goto("https://www.nytimes.com/");
  return page;
};

const removeDoubleHeadline = (headline) => {
  if (headline.length % 2 === 1) {
    return headline;
  }
  const firstHalf = headline.slice(0, headline.length / 2);
  const secondHalf = headline.slice(headline.length / 2);
  if (firstHalf === secondHalf) {
    return firstHalf;
  }
  return headline;
};

const loadNYTHeadlinesDOM = async (dbClient, browser) => {
  const page = await loadNYTHomepage(browser);
  const headings = await page.$$("h2, h3");
  const results = [];
  const retrievedAt = new Date();
  for (let heading of headings) {
    let headline = await heading.evaluate((e) => e.textContent);
    headline = removeDoubleHeadline(headline);
    const [anchor] = await heading.$x("ancestor::a");
    if (anchor) {
      const href = await anchor.evaluate((e) => e.getAttribute("href"));
      let hrefClean = href.split("?")[0];
      if (hrefClean?.startsWith("/")) {
        hrefClean = "https://www.nytimes.com" + hrefClean;
      }
      if (
        !hrefClean.startsWith(
          `https://www.nytimes.com/${new Date().getUTCFullYear()}/`
        )
      ) {
        continue;
      }
      const article = await upsertArticleByUrl(dbClient, hrefClean);
      if (article) {
        results.push({
          id: article.uri,
          uri: article.uri,
          headline,
          retrievedAt,
        });
      }
    }
  }
  return results;
};

const loadNYTHeadlines = async () => {
  const browser = await puppeteer.launch();
  const page = await loadNYTHomepage(browser);
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

const takeHeadlineSnapshot = async () => {
  logger.info("Script started");
  const dbClient = await newDBClient();
  const browser = await puppeteer.launch();

  try {
    const headlineInfo = await loadNYTHeadlinesDOM(dbClient, browser);
    for (const hi of headlineInfo) {
      await addHeadline(dbClient, hi);
    }
    logger.info(`Saved ${headlineInfo.length} headlines to DB`);
  } catch (e) {
    captureException(e);
    logger.error(e);
  } finally {
    dbClient.end();
    browser.close();
  }
};

takeHeadlineSnapshot();

// updateArticleData();

// (async () => {
//   const dbClient = await newDBClient();
//   const results = await loadNYTHeadlinesDOM(dbClient);
//   dbClient.end();
//   console.log(JSON.stringify(results, null, 3));
//   console.log(`${results.length} total results`);
// })();
