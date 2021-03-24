const fetch = require("node-fetch");
const Sentry = require("@sentry/node");
const logger = require("./logger");
const sentryInit = require("./sentry");
const { addHackerNewsTopStories, newDBClient } = require("./db");

sentryInit();

const BASE_URL = "https://hacker-news.firebaseio.com/v0";

const fetchTopStories = async () => {
  const resp = await fetch(`${BASE_URL}/topstories.json`);
  return await resp.json();
};

(async () => {
  const dbClient = await newDBClient();
  try {
    const topIds = await fetchTopStories();
    const frontPageIds = topIds.slice(0, 30);
    await addHackerNewsTopStories(dbClient, frontPageIds);
    logger.info(
      `Added ${
        frontPageIds.length
      } front page stories to DB: ${frontPageIds.join(", ")}`
    );
  } catch (e) {
    Sentry.captureException(e);
    logger.error(e);
  } finally {
    dbClient.end();
  }
})();
