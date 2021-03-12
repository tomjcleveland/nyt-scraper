const {
  fetchArticleDetails,
  newDBClient,
  addArticleDetails,
  markArticleDeleted,
  fetchArticlesToRefresh,
  upsertRevision,
} = require("./db");
const { fetchArticleByUri } = require("./nytGraphql");
const logger = require("./logger");
const sentryInit = require("./sentry");
const Sentry = require("@sentry/node");

// How long to sleep between GraphQL requests
const SLEEP_INTERVAL = 6 * 1000;

// How many articles to refresh when this script is run
const ARTICLES_PER_RUN = 30;

sentryInit();

const refreshArticle = async (dbClient, uri) => {
  const refreshedArticle = await fetchArticleByUri(uri);
  if (refreshedArticle) {
    const existingArticle = await fetchArticleDetails(dbClient, uri);
    await addArticleDetails(dbClient, {
      ...existingArticle,
      ...refreshedArticle,
      refreshedat: new Date(),
    });
    const newRevision = await upsertRevision(
      dbClient,
      uri,
      refreshedArticle.body
    );
    if (newRevision) {
      logger.info(`New revisions for article ${uri}`);
    }
  } else {
    logger.info(`Deleted article detected: ${uri}`);
    await markArticleDeleted(dbClient, uri);
  }
};

const sleep = (timeout) => {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
};

(async () => {
  const dbClient = await newDBClient();
  try {
    const uris = await fetchArticlesToRefresh(dbClient, ARTICLES_PER_RUN);
    for (let uri of uris) {
      await refreshArticle(dbClient, uri);
      logger.info(`Refreshed article ${uri}`);
      await sleep(SLEEP_INTERVAL);
    }
  } catch (e) {
    Sentry.captureException(e);
    logger.error(e);
  } finally {
    dbClient.end();
  }
})();
