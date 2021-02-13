const { Client } = require("pg");

exports.newDBClient = async () => {
  const dbClient = new Client({
    user: "nyt_app",
    host: "nyt-headlines.cbyvknksdshk.us-east-1.rds.amazonaws.com",
    database: "nyt",
    password: "ivzqi6WyLRkMk9tnrsrsj8qtsDJuZUnBXF9B",
    port: 5432,
  });
  await dbClient.connect();
  return dbClient;
};

exports.fetchLatestArticles = async (client) => {
  const query = `SELECT id,headline,COUNT(*),MAX(retrieved) AS lastRetrieved FROM nyt.headlines GROUP BY 1, 2 ORDER BY 4 DESC`;
  const res = await client.query(query);
  const articlesById = res.rows.reduce((acc, curr) => {
    acc[curr.id] = acc[curr.id] || [];
    acc[curr.id].push({
      headline: curr.headline,
      count: parseInt(curr.count, 10),
      retrieved: curr.lastRetrieved,
    });
    return acc;
  }, {});
  return Object.keys(articlesById).map((id) => {
    const currHeadlines = articlesById[id];
    const withPct = currHeadlines.map((currHeadline) => {
      const total = currHeadlines.reduce((acc, curr) => acc + curr.count, 0);
      return {
        ...currHeadline,
        pct: Math.round((100 * currHeadline.count) / total),
      };
    });
    return {
      id,
      headlines: withPct,
    };
  });
};
