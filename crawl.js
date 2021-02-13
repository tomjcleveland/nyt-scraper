const puppeteer = require("puppeteer");
const { Client } = require("pg");
const uuidv4 = require("uuid").v4;

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 5.0; sl-SI; rv:1.9.0.20) Gecko/20170323 Firefox/36.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 7_2_1 like Mac OS X; sl-SI) AppleWebKit/534.14.3 (KHTML, like Gecko) Version/3.0.5 Mobile/8B114 Safari/6534.14.3",
];

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
    console.log(err.stack);
  }
};

const loadNYTHeadlines = async () => {
  const browser = await puppeteer.launch();
  console.log("Launched browser");
  const page = await browser.newPage();
  page.setUserAgent(getRandomUserAgent());
  console.log("Opened new page");
  await page.goto("https://www.nytimes.com/");
  console.log("Navigated to NYT homepage");
  const initialState = await page.evaluate((_) => {
    return window.__preloadedData.initialState;
  });
  await browser.close();
  console.log("Loaded initialState");
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
  console.log("Script started");
  const dbClient = new Client({
    user: "nyt_app",
    host: "nyt-headlines.cbyvknksdshk.us-east-1.rds.amazonaws.com",
    database: "nyt",
    password: "ivzqi6WyLRkMk9tnrsrsj8qtsDJuZUnBXF9B",
    port: 5432,
  });
  await dbClient.connect();
  console.log("Connected to DB");
  const headlineInfo = await loadNYTHeadlines();
  for (const hi of headlineInfo) {
    await saveToDB(dbClient, hi);
  }
  dbClient.end();
  console.log(`Saved ${headlineInfo.length} headlines to DB`);
};

takeHeadlineSnapshot();
