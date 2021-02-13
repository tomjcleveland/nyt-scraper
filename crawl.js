const puppeteer = require("puppeteer");
const uuidv4 = require("uuid").v4;

(async () => {
  const saveToDB = async (headlineInfo) => {
    const { Client } = require("pg");
    const client = new Client({
      user: "nyt_app",
      host: "nyt-headlines.cbyvknksdshk.us-east-1.rds.amazonaws.com",
      database: "nyt",
      password: "ivzqi6WyLRkMk9tnrsrsj8qtsDJuZUnBXF9B",
      port: 5432,
    });
    await client.connect();

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
      const res = await client.query(query, values);
      console.log(res.rows[0]);
    } catch (err) {
      console.log(err.stack);
    }

    await client.end();
  };

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto("https://www.nytimes.com/");
  const initialState = await page.evaluate((_) => {
    return window.__preloadedData.initialState;
  });
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
  const headlineInfo = articleIds.map((id) => {
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
  headlineInfo.forEach((hi) => {
    saveToDB(hi);
  });
  await browser.close();
})();
