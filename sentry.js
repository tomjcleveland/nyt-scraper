const Sentry = require("@sentry/node");

module.exports = () => {
  Sentry.init({
    dsn:
      "https://9985c14cd53b4a05a667923881e8fe89@o291791.ingest.sentry.io/5638469",

    // We recommend adjusting this value in production, or using tracesSampler
    // for finer control
    tracesSampleRate: 1.0,
  });
};
