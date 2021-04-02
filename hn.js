const logger = require("./logger");
const { sentryInit, captureException } = require("./sentry");
const {
  addHackerNewsTopStories,
  newDBClient,
  addNewPageDuration,
} = require("./db");
const { fetchNewStories, fetchItem, fetchTopStories } = require("./hackerNews");

sentryInit();

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
    captureException(e);
    logger.error(e);
  } finally {
    dbClient.end();
  }
})();
