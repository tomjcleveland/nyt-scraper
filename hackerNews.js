const fetch = require("node-fetch");
const { BigQuery } = require("@google-cloud/bigquery");
const dayjs = require("dayjs");
const relativeTime = require("dayjs/plugin/relativeTime");
const duration = require("dayjs/plugin/duration");
dayjs.extend(relativeTime);
dayjs.extend(duration);

const BASE_URL = "https://hacker-news.firebaseio.com/v0";

const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

exports.fetchTopStories = async () => {
  const resp = await fetch(`${BASE_URL}/topstories.json`);
  return await resp.json();
};

exports.fetchNewStories = async () => {
  const resp = await fetch(`${BASE_URL}/newstories.json`);
  return await resp.json();
};

exports.fetchItem = async (id) => {
  const resp = await fetch(`${BASE_URL}/item/${id}.json`);
  return await resp.json();
};

exports.fetchPostingDifficultyData = async () => {
  const bqClient = new BigQuery();
  const query = `
    WITH top AS (
      SELECT DISTINCT(itemid) AS itemid FROM \`anthem-labs.hackernews.topstories\`
    ),
    stories AS (
      SELECT
        f.timestamp,
        f.id,
        CASE WHEN t.itemid IS NULL THEN FALSE ELSE TRUE END AS frontpage
      FROM \`bigquery-public-data.hacker_news.full\` AS f
      LEFT JOIN top AS t ON CAST (f.id AS STRING)=t.itemid
      WHERE f.timestamp > '2021-03-26'
      AND f.type='story'
    ),
    newpagedurations AS (
      SELECT
        EXTRACT(DAYOFWEEK FROM observed) AS day,
        EXTRACT(HOUR FROM observed) AS hour,
        ROUND(AVG(seconds)) AS seconds
      FROM \`anthem-labs.hackernews.newpageduration\`
      GROUP BY 1, 2
    ),
    topbyhour AS (
      SELECT
        EXTRACT(DAYOFWEEK FROM timestamp) AS day,
        EXTRACT(HOUR FROM timestamp) AS hour,
        SUM(CASE WHEN frontpage=TRUE THEN 1 ELSE 0 END) AS numfrontpage,
        COUNT(*) AS numtotal
      FROM stories
      GROUP BY 1, 2
    )
    SELECT
      t.day,
      t.hour,
      t.numfrontpage,
      t.numtotal,
      n.seconds
    FROM topbyhour AS t JOIN newpagedurations AS n
      ON (t.day = n.day AND t.hour = n.hour)
    ORDER BY 1, 2`;

  const options = {
    query: query,
    location: "US",
  };

  const [job] = await bqClient.createQueryJob(options);

  const [rows] = await job.getQueryResults();

  const currData = rows.filter((r) => {
    return (
      new Date().getUTCDay() === r.day - 1 &&
      new Date().getUTCHours() === r.hour
    );
  })?.[0];

  const bestData = rows.slice(1).reduce((prev, curr) => {
    const prevOdds = prev.numfrontpage / prev.numtotal;
    const currOdds = curr.numfrontpage / curr.numtotal;
    if (currOdds > prevOdds) {
      return {
        ...curr,
        formattedDay: DAYS_OF_WEEK[curr.day - 1],
        formattedHour: `${curr.hour}-${curr.hour + 1} UTC`,
      };
    }
    return prev;
  }, rows[0]);

  const dataTable = [
    ["Time", "Front page odds", { role: "annotation" }, "'new' page duration"],
    ...rows.map((r) => {
      return [
        `${DAYS_OF_WEEK[r.day - 1]}, ${r.hour}-${r.hour + 1} UTC`,
        Math.round(100 * (r.numfrontpage / r.numtotal)),
        new Date().getUTCDay() === r.day - 1 &&
        new Date().getUTCHours() === r.hour
          ? "Now"
          : null,
        { v: r.seconds, f: dayjs.duration(r.seconds * 1000).humanize() },
      ];
    }),
  ];

  return { currData, bestData, dataTable };
};
