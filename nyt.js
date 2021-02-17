const fetch = require("node-fetch");
const { queryHeadlines } = require("./db");
const { POPTYPE } = require("./enum");
const logger = require("./logger");
const {
  fetchArticleDetails,
  fetchArticleDetailsByUrl,
  addArticleDetails,
} = require("./db");

const API_KEY = "2ACuPVaGRIMncruKTSHxtfBqmKZzDP0M";

const NYT_BASE = "https://api.nytimes.com/svc";
const SEARCH_URL = `${NYT_BASE}/search/v2/articlesearch.json`;
const SHARES_URL = `${NYT_BASE}/mostpopular/v2/viewed/1.json`;
const VIEWS_URL = `${NYT_BASE}/mostpopular/v2/shared/1.json`;
const EMAILS_URL = `${NYT_BASE}/mostpopular/v2/emailed/1.json`;

const MAX_RETRIES = 5;

const RATE_LIMIT_WAIT = 30000;

const apiHelper = async (url, params, numRetries) => {
  numRetries = numRetries || 0;
  if (numRetries > MAX_RETRIES) {
    throw new Error(`Hit rate limit ${MAX_RETRIES} times in a row`);
  }
  const queryParams = new URLSearchParams();
  for (const key in params) {
    queryParams.append(key, params[key]);
  }
  queryParams.append("api-key", API_KEY);

  const resp = await fetch(`${url}?${queryParams.toString()}`);
  if (resp.status === 429) {
    logger.info(`Hit rate limit; waiting ${RATE_LIMIT_WAIT / 1000} seconds`);
    await new Promise((resolve) => {
      setTimeout(resolve, RATE_LIMIT_WAIT);
    });
    return apiHelper(url, params, numRetries + 1);
  }
  if (resp.status != 200) {
    const body = await resp.text();
    throw new Error(`Unexpected status code ${resp.status}: ${body}`);
  }
  return await resp.json();
};

const fetchArticleByUri = async (uri) => {
  const filterQuery = `uri:("${uri}")`;
  const respJSON = await apiHelper(SEARCH_URL, { fq: filterQuery });
  return respJSON.response.docs[0];
};

exports.fetchArticleByUri = fetchArticleByUri;

const POPTYPE_TO_URL = {
  [POPTYPE.EMAILED]: EMAILS_URL,
  [POPTYPE.SHARED]: SHARES_URL,
  [POPTYPE.VIEWED]: VIEWS_URL,
};

exports.fetchPopularArticles = async (type) => {
  const respJSON = await apiHelper(POPTYPE_TO_URL[type]);
  return respJSON.results;
};

const fetchArticleByUrl = async (url) => {
  const filterQuery = `web_url:("${url}")`;
  const respJSON = await apiHelper(SEARCH_URL, { fq: filterQuery });
  return respJSON.response.docs[0];
};

exports.fetchArticleByUrl = fetchArticleByUrl;

exports.upsertArticleByUri = async (dbClient, uri) => {
  const existingArticle = await fetchArticleDetails(dbClient, uri);
  if (!existingArticle) {
    logger.info(`Fetching article metadata for ${uri}`);
    const fetchedArticle = await fetchArticleByUri(uri);
    if (!fetchedArticle) {
      throw new Error(`No article found for uri ${uri}`);
    }
    await addArticleDetails(dbClient, fetchedArticle);
  }
};

exports.upsertArticleByUrl = async (dbClient, url) => {
  let article = await fetchArticleDetailsByUrl(dbClient, url);
  if (!article) {
    logger.info(`Fetching article metadata for ${url}`);
    article = await fetchArticleByUrl(url);
    if (article) {
      try {
        await addArticleDetails(dbClient, article);
      } catch (err) {
        logger.error(err);
      }
    }
  }
  return article;
};
