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
  fetchArticleById,
  fetchAllUrisByMonth,
} = require("../lib/db");
const { fetchAllArticlesByMonth } = require("../lib/nyt");
const { fetchArticleByUri } = require("../lib/nytGraphql");
const logger = require("../lib/logger");
const { sentryInit, captureException } = require("../lib/sentry");
const { sleep, setDifference } = require("../lib/helpers");

// How long to sleep between GraphQL requests
const SLEEP_INTERVAL = 3 * 1000;

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

const getURIs = async (dbClient) => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const articles = await fetchAllArticlesByMonth(year, month);
  const monthlyUris = articles
    .filter((a) => a.document_type === "article")
    .map((a) => a.uri);
  const dbURIs = await fetchAllUrisByMonth(dbClient, year, month);
  const newURIs = setDifference(monthlyUris, dbURIs);
  const refreshURIs = await fetchArticlesToRefresh(dbClient, 50);
  logger.info(
    `URIs to refresh: ${newURIs.length} new, ${refreshURIs.length} existing`
  );
  return [...new Set([...refreshURIs, ...newURIs])];
};

(async () => {
  const dbClient = await newDBClient();
  try {
    logger.info("Fetching URIs to refresh...");
    const uris = await getURIs(dbClient);
    logger.info(`Refreshing ${uris.length} articles`);
    for (let uri of uris) {
      try {
        await refreshArticle(dbClient, uri);
        logger.info(`Refreshed article ${uri}`);
      } catch (e) {
        captureException(e);
        logger.error(e);
        logger.error(e.stack);
      }
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
