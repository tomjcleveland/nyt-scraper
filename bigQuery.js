const logger = require("./logger");
const { sentryInit, captureException } = require("./sentry");
const { BigQuery } = require("@google-cloud/bigquery");
const { fetchTopStories, fetchNewStories, fetchItem } = require("./hackerNews");

sentryInit();

const fetchNewPageDuration = async () => {
  const newStoryIds = await fetchNewStories();
  const item = await fetchItem(newStoryIds[29]);
  return Math.round((Date.now() - item.time * 1000) / 1000);
};

(async () => {
  const bqClient = new BigQuery();
  const topIds = await fetchTopStories();
  const frontPageIds = topIds.slice(0, 30);
  const observed = new Date();
  const rows = frontPageIds.map((id, i) => ({ itemid: id, rank: i, observed }));
  await bqClient.dataset("hackernews").table("topstories").insert(rows);
  logger.info(`Inserted ${rows.length} rows to topstories table`);

  const currDuration = await fetchNewPageDuration();
  await bqClient
    .dataset("hackernews")
    .table("newpageduration")
    .insert([{ seconds: currDuration, observed: new Date() }]);
  logger.info(
    `Inserted current 'new' page duration: ${currDuration.toLocaleString()} seconds`
  );
})();
