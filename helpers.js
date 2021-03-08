const ordinal = require("ordinal");
const dayjs = require("dayjs");

const COLORS = {
  FULL: [
    "#EF4444", // Red 500
    "#3B82F6", // Blue 500
    "#10B981", // Green 500
    "#EC4899", // Pink 500
    "#F59E0B", // Yellow 500
    "#8B5CF6", // Purple 500
  ],
  LIGHT: [
    "rgba(239, 68, 68, 0.2)", // Red 500
    "rgba(59, 130, 246, 0.2)", // Blue 500
    "rgba(16, 185, 129, 0.2)", // Green 500
    "rgba(236, 72, 153, 0.2)", // Pink 500
    "rgba(245, 158, 11, 0.2)", // Yellow 500
    "rgba(139, 92, 246, 0.2)", // Purple 500
  ],
};

const archiveUrl = (url) => {
  return `https://archive.today/?run=1&url=${encodeURIComponent(url)}`;
};

const stringToColor = (str) => {
  const index =
    str.split().reduce((sum, c) => c.charCodeAt(0) + sum, 0) %
    COLORS.FULL.length;
  return COLORS.FULL[index];
};

exports.getExpressLocals = () => {
  return {
    stringToColor,
    ordinal,
    dayjs,
    archiveUrl,
  };
};

exports.COLORS = COLORS;
