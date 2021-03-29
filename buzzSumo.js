const puppeteer = require("puppeteer");
const { sleep } = require("./helpers");
const { Client } = require("./tor");

const fetchPageInfo = async (url) => {
  const browser = await puppeteer.launch({
    headless: false,
    args: [`--proxy-server=socks5://localhost:9050`],
  });
  let page = await browser.newPage();
  await page.goto(
    `https://app.buzzsumo.com/content/web?q=${encodeURIComponent(url)}`
  );
  const cookies = await page.cookies();
  console.log(cookies);
  await sleep(3000);
  await browser.close();
};

(async () => {
  const torClient = new Client({
    controlPort: 9051,
    password: "fYHUgmu9f6Ugfmzp2Yv8JjuKeN",
  });
  await fetchPageInfo(
    "https://www.nytimes.com/2021/03/13/science/lions-south-africa-wildlife-parks.html"
  );
  // console.log("Changing IP");
  // await torClient.changeIp();
})();
