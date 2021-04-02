const fetch = require("node-fetch");

const BASE_URL = "https://hacker-news.firebaseio.com/v0";

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
