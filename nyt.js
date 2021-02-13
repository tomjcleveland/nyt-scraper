const fetch = require("node-fetch");
const logger = require("./logger");

const API_KEY = "2ACuPVaGRIMncruKTSHxtfBqmKZzDP0M";

const SEARCH_URL = "https://api.nytimes.com/svc/search/v2/articlesearch.json";

const MAX_RETRIES = 5;

const RATE_LIMIT_WAIT = 30000;

const fetchArticleHelper = async (uri, numRetries) => {
  if (numRetries > MAX_RETRIES) {
    throw new Error(`Hit rate limit ${MAX_RETRIES} times in a row`);
  }
  const filterQuery = `uri:("${uri}")`;
  const resp = await fetch(
    `${SEARCH_URL}?fq=${encodeURIComponent(filterQuery)}&api-key=${API_KEY}`
  );
  if (resp.status === 429) {
    logger.info(`Hit rate limit; waiting ${RATE_LIMIT_WAIT / 1000} seconds`);
    await new Promise((resolve) => {
      setTimeout(resolve, RATE_LIMIT_WAIT);
    });
    return fetchArticleHelper(uri, numRetries + 1);
  }
  if (resp.status != 200) {
    const body = await resp.text();
    throw new Error(`Unexpected status code ${resp.status}: ${body}`);
  }
  const doc = await resp.json();
  return doc.response.docs[0];
};

exports.fetchArticle = async (uri) => {
  return fetchArticleHelper(uri, 0);
};
