exports.idFromUri = (uri) => {
  return uri.replace("nyt://article/", "");
};
