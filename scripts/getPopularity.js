const { newDBClient, insertPopularityData } = require("../lib/db");
const logger = require("../lib/logger");
const { fetchPopularArticles, upsertArticleByUri } = require("../lib/nyt");
const { POPTYPE } = require("../lib/enum");
const { sentryInit, captureException } = require("../lib/sentry");

const updatePopularityData = async () => {
  const dbClient = await newDBClient();
  for (const key in POPTYPE) {
    const type = POPTYPE[key];
    logger.info(`Fetching popularity data: ${type}...`);
    try {
      const articles = await fetchPopularArticles(type);
      for (let article of articles) {
        await upsertArticleByUri(dbClient, article.uri);
      }
      const data = articles.map((a, i) => ({ uri: a.uri, rank: i + 1 }));
      await insertPopularityData(dbClient, type, data);
      logger.info(`Saved popularity data: ${type}`);
    } catch (e) {
      captureException(e);
      logger.error(e);
    }
  }
  dbClient.end();
};

sentryInit();
updatePopularityData();
