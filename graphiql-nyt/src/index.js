import * as React from "react";
import { render } from "react-dom";

import GraphiQL from "graphiql";

import "graphiql/graphiql.min.css";

import "./index.css";

const URL = "https://graphql.nyt.tjcx.me/graphql/v2";

function graphQLFetcher(graphQLParams) {
  return fetch(URL, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "nyt-app-type": "project-vi",
      "nyt-app-version": "0.0.5",
      "nyt-token":
        "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs+/oUCTBmD/cLdmcecrnBMHiU/pxQCn2DDyaPKUOXxi4p0uUSZQzsuq1pJ1m5z1i0YGPd1U1OeGHAChWtqoxC7bFMCXcwnE1oyui9G1uobgpm1GdhtwkR7ta7akVTcsF8zxiXx7DNXIPd2nIJFH83rmkZueKrC4JVaNzjvD+Z03piLn5bHWU6+w+rA+kyJtGgZNTXKyPh6EC6o5N+rknNMG5+CdTq35p8f99WjFawSvYgP9V64kgckbTbtdJ6YhVP58TnuYgr12urtwnIqWP9KSJ1e5vmgf3tunMqWNm6+AnsqNj8mCLdCuc5cEB74CwUeQcP2HQQmbCddBy2y0mEwIDAQAB",
      cookie:
        "nyt-a=IvuwKRll7q_CZssa6io4Me; nyt-gdpr=0; nyt-purr=cfshcfhssck; nyt-geo=US; nyt-m=109BA1564A8075E1252D4E8624C580D2&iir=i.0&e=i.1614589200&fv=i.0&igf=i.0&ira=i.0&uuid=s.8d48a69a-2cc2-4245-a719-1eca5b31cd12&ft=i.0&ifv=i.0&iga=i.0&er=i.1613770060&vr=l.4.0.0.0.0&pr=l.4.0.0.0.0&t=i.1&rc=i.0&imv=i.0&ird=i.0&iru=i.1&v=i.0&n=i.2&vp=i.0&imu=i.1&s=s.core&g=i.0&cav=i.0&prt=i.0&igd=i.0&iub=i.0&igu=i.1&ica=i.0&iue=i.0&ier=i.0; purr-cache=<K0<r<C_<G_<S0; b2b_cig_opt=%7B%22isCorpUser%22%3Afalse%7D; edu_cig_opt=%7B%22isEduUser%22%3Afalse%7D; nyt-jkidd=uid=0&lastRequest=1613770060824&activeDays=%5B0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C0%2C1%5D&adv=1&a7dv=1&a14dv=1&a21dv=1&lastKnownType=anon; _gcl_au=1.1.640147955.1613770062; datadome=ULkh2DoeRZiFqtxEHKuh054rmkXamf20gv2qnDXsEzn_dckpg1_G5FOpwpcHT~bBK4R9.Hg8z_6ES4v5Mf0iBXFdAPsp5Bb9F-5ppyVr1D; walley=GA1.2.840783926.1613770062; walley_gid=GA1.2.2064183874.1613770063; __gads=ID=b8ceb07ba0b31c36-22d92a1cabc60098:T=1613770062:S=ALNI_MZQoe7p5tT8dgLTWtiQaBD51lkJVA; iter_id=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhaWQiOiI2MDMwMmQ1MTYwNzA5MzAwMDE1ZmNiNjUiLCJjb21wYW55X2lkIjoiNWMwOThiM2QxNjU0YzEwMDAxMmM2OGY5IiwiaWF0IjoxNjEzNzcwMDY1fQ.Kap39xC3MfKzE8umr098tr85QM8S4zMVkcs0HGVqRC0; _gat_UA-58630905-2=1",
    },
    body: JSON.stringify(graphQLParams),
  }).then((response) => response.json());
}

const container = document.getElementById("root");

const defaultQuery = `
{
  allFilms {
    edges {
      node {
        id
        title
        producers
        episodeID
        created
      }
    }
  }
}
`;

render(
  <GraphiQL fetcher={graphQLFetcher} defaultQuery={defaultQuery} />,
  container
);
