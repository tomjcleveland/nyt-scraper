const fetch = require("node-fetch");
const { queryHeadlines, addDeletedArticle } = require("./db");
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
  return fetchArticleHelper("uri", uri);
};

const fetchArticleByUrl = async (url) => {
  return fetchArticleHelper("web_url", url);
};

const fetchArticleHelper = async (field, value) => {
  const filterQuery = `${field}:("${value}")`;
  const respJSON = await apiHelper(SEARCH_URL, { fq: filterQuery });
  return respJSON.response.docs[0];
};

exports.fetchArticleByUri = fetchArticleByUri;

exports.fetchArticleByUrl = fetchArticleByUrl;

const POPTYPE_TO_URL = {
  [POPTYPE.EMAILED]: EMAILS_URL,
  [POPTYPE.SHARED]: SHARES_URL,
  [POPTYPE.VIEWED]: VIEWS_URL,
};

exports.fetchPopularArticles = async (type) => {
  const respJSON = await apiHelper(POPTYPE_TO_URL[type]);
  return respJSON.results;
};

exports.upsertArticleByUri = async (dbClient, uri) => {
  return upsertArticleHelper(dbClient, uri, false);
};

exports.upsertArticleByUrl = async (dbClient, url) => {
  return upsertArticleHelper(dbClient, url, true);
};

const upsertArticleHelper = async (dbClient, id, isUrl) => {
  let article;
  let field;
  if (isUrl) {
    field = "web_url";
    article = await fetchArticleDetailsByUrl(dbClient, id);
  } else {
    field = "uri";
    article = await fetchArticleDetails(dbClient, id);
  }
  if (!article) {
    logger.info(`Fetching article metadata for ${id}`);
    article = await fetchArticleHelper(field, id);
    if (!article) {
      logger.info();
      throw new Error(`No article found for ${isUrl ? "URL" : "URI"} ${id}`);
    }
    article = await addArticleDetails(dbClient, article);
  }
  return article;
};
