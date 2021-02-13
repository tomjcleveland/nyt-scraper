const puppeteer = require("puppeteer");
const { newDBClient } = require("./db");
const USER_AGENTS = require("./userAgents");
const uuidv4 = require("uuid").v4;
const pino = require("pino");

const logger = pino({ level: "info" });

const getRandomUserAgent = () => {
  const idx = Math.floor(Math.random() * USER_AGENTS.length);
  return USER_AGENTS[idx];
};

const saveToDB = async (client, headlineInfo) => {
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

  try {
    await client.query(query, values);
  } catch (err) {
    logger.error(err.stack);
  }
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

const takeHeadlineSnapshot = async () => {
  logger.info("Script started");
  const dbClient = await newDBClient();
  const headlineInfo = await loadNYTHeadlines();
  for (const hi of headlineInfo) {
    await saveToDB(dbClient, hi);
  }
  dbClient.end();
  logger.info(`Saved ${headlineInfo.length} headlines to DB`);
};

takeHeadlineSnapshot();
