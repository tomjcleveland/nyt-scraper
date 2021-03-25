const fetch = require("node-fetch");
const Sentry = require("@sentry/node");
const logger = require("./logger");
const sentryInit = require("./sentry");
const {
  addHackerNewsTopStories,
  newDBClient,
  addNewPageDuration,
} = require("./db");

sentryInit();

const BASE_URL = "https://hacker-news.firebaseio.com/v0";

const fetchTopStories = async () => {
  const resp = await fetch(`${BASE_URL}/topstories.json`);
  return await resp.json();
};

const fetchNewStories = async () => {
  const resp = await fetch(`${BASE_URL}/newstories.json`);
  return await resp.json();
};

const fetchItem = async (id) => {
  const resp = await fetch(`${BASE_URL}/item/${id}.json`);
  return await resp.json();
};

// In milliseconds
const fetchNewPageDuration = async () => {
  const newStoryIds = await fetchNewStories();
  const item = await fetchItem(newStoryIds[29]);
  return Math.round((Date.now() - item.time * 1000) / 1000);
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
    const currDuration = await fetchNewPageDuration();
    await addNewPageDuration(dbClient, currDuration);
    logger.info(
      `Current new page duration: ${currDuration.toLocaleString()} seconds`
    );
  } catch (e) {
    Sentry.captureException(e);
    logger.error(e);
  } finally {
    dbClient.end();
  }
})();
