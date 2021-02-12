const puppeteer = require("puppeteer");

(async () => {
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
  const retrievedAt = Date.now();
  const headlineInfo = articleIds.map((id) => {
    const articleDetails = initialState[id];
    return {
      id: id,
      sourceId: articleDetails.sourceId,
      headline: articleDetails.promotionalHeadline,
      summary: articleDetails.promotionalSummary,
      uri: articleDetails.uri,
      lastMajorModification: Date.parse(articleDetails.lastMajorModification),
      lastModified: Date.parse(articleDetails.lastModified),
      tone: articleDetails.tone,
      retrievedAt,
    };
  });
  console.log(headlineInfo);
  await browser.close();
})();
