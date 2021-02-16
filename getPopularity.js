const { newDBClient, insertPopularityData } = require("./db");
const Sentry = require("@sentry/node");
const logger = require("./logger");
const { fetchPopularArticles } = require("./nyt");
const { POPTYPE } = require("./enum");
const sentryInit = require("./sentry");

const updatePopularityData = async () => {
  const dbClient = await newDBClient();
  for (const key in POPTYPE) {
    const type = POPTYPE[key];
    logger.info(`Fetching popularity data: ${type}...`);
    try {
      const articles = await fetchPopularArticles(type);
      const data = articles.map((a, i) => ({ uri: a.uri, rank: i + 1 }));
      await insertPopularityData(dbClient, type, data);
      logger.info(`Saved popularity data: ${type}`);
    } catch (e) {
      Sentry.captureException(e);
      logger.error(e);
    }
  }
  dbClient.end();
};

sentryInit();
updatePopularityData();
