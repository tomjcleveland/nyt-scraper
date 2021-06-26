const Sentry = require("@sentry/node");
const logger = require("./logger");

exports.sentryInit = () => {
  if (process.env.NODE_ENV === "production") {
    Sentry.init({
      dsn:
        "https://9985c14cd53b4a05a667923881e8fe89@o291791.ingest.sentry.io/5638469",

      // We recommend adjusting this value in production, or using tracesSampler
      // for finer control
      tracesSampleRate: 1.0,
    });
  } else {
    logger.warn(
      `Current environment is "${process.env.NODE_ENV}"; not sending exceptions to Sentry`
    );
  }
};

exports.captureException = (e) => {
  if (process.env.NODE_ENV === "production") {
    Sentry.captureException(e);
  }
};
