const {
  fetchArticleDetails,
  newDBClient,
  addArticleDetails,
  markArticleDeleted,
  fetchArticlesToRefresh,
  upsertRevision,
  dedupeRevisions,
  upsertTimesTag,
  upsertCreator,
  upsertArticleCreatorMapping,
} = require("./db");
const { fetchAllArticlesByMonth } = require("./nyt");
const { fetchArticleByUri } = require("./nytGraphql");
const logger = require("./logger");
const { sentryInit, captureException } = require("./sentry");
const { sleep } = require("./helpers");

// How long to sleep between GraphQL requests
const SLEEP_INTERVAL = 3 * 1000;

// How many articles to refresh when this script is run
const ARTICLES_PER_RUN = 60;

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
    for (let creator of refreshedArticle.creators) {
      await upsertCreator(dbClient, creator);
      await upsertArticleCreatorMapping(dbClient, uri, creator.uri);
    }
    for (let tag of refreshedArticle.tags) {
      await upsertTimesTag(dbClient, uri, tag);
    }
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
  await dedupeRevisions(dbClient, uri);
};

(async () => {
  const dbClient = await newDBClient();
  try {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const articles = await fetchAllArticlesByMonth(year, month);
    const uris = articles
      .filter((a) => a.document_type === "article")
      .map((a) => a.uri);
    logger.info(`Refreshing ${uris.length} articles for current month`);
    for (let uri of uris) {
      await refreshArticle(dbClient, uri);
      logger.info(`Refreshed article ${uri}`);
      await sleep(SLEEP_INTERVAL);
    }
  } catch (e) {
    captureException(e);
    logger.error(e);
    logger.error(e.stack);
  } finally {
    dbClient.end();
  }
})();
