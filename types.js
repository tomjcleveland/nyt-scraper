/**
 * A NYT article
 * @typedef {Object} Article
 * @property {string} id Unique identifier, the last part of the URI
 * @property {string} uri The NYT URI for this article
 * @property {number} viewRank The current ranking on the "top viewed" list
 * @property {number} shareRank The current ranking on the "top shared" list
 * @property {number} emailRank The current ranking on the "top emailed" list
 * @property {string} abstract A summary of the article, provided by the API
 * @property {string} canonicalheadline The canonical headline for this article, provided by the API
 * @property {string} printheadline The print headline for this article, provided by the API
 * @property {string} imageUrl The full URL to an NYT-hosted image
 * @property {number} frontPagePeriods The number of periods (usually 30 minutes long) that an article has been seen on the NYT front page
 * @property {Headline[]} headlines All headlines observed for this article
 * @property {HeadlinePoint[]} timeSeries Rank/headline data over time
 */

/**
 * A headline used for an article
 * @typedef {Object} Headline
 * @property {string} headline The displayed headline
 * @property {number} count The total number of times this headline has been seen on the front page
 * @property {number} pct The % prevalence of this headline among other headlines used for this article
 */

/**
 * A single headline observation
 * @typedef {Object} HeadlinePoint
 * @property {string} headline
 * @property {Date} minute The time at which this headline was observed, rounded to a particular precision
 * @property {number} rank This article's average rank on the "top viewed" during this period
 * @property {number} count The number of observations of this headline during the period
 * @property {number} total The total number of headline observations during this period
 */
