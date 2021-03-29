const fetch = require("node-fetch");

const GRAPHQL_ENDPOINT = "https://samizdat-graphql.nytimes.com/graphql/v2";

const getArticleQuery = (uri) => {
  return `{
  article(id: "${uri}") {
    uri
    url
    headline {
      default
    }
    printInformation {
      headline
    }
    firstPublished
    summary
    wordCount
    desk
    section {
      name
      displayName
      url
    }
    subsection {
      name
      displayName
      url
    }
    tone
    timesTags {
      vernacular
      displayName
    }
    promotionalImage {
      image {
        url
        crops(renditionNames: ["blog480"]) {
          renditions {
            url
            name
          }
        }
      }
    }
    bylines {
      renderedRepresentation
      creators {
        ... on Person {
          uri
          bioUrl
          displayName
          description
          promotionalMedia {
            ... on Image {
              crops(renditionNames: ["blog480"]) {
                renditions {
                  url
                  name
                }
              }
            }
          }
        }
        ... on Organization {
          uri
          url
          displayName
          description
          promotionalMedia {
            ... on Image {
              crops(renditionNames: ["blog480"]) {
                renditions {
                  url
                  name
                }
              }
            }
          }
        }
      }
    }
    body {
      content {
        ... on Heading1Block {
          content {
            ... on TextInline {
              text
            }
          }
        }
        ... on Heading2Block {
          content {
            ... on TextInline {
              text
            }
          }
        }
        ... on Heading3Block {
          content {
            ... on TextInline {
              text
            }
          }
        }
        ... on ParagraphBlock {
          content {
            ... on TextInline {
              text
            }
          }
        }
      }
    }
  }
}`;
};

exports.fetchArticleByUri = async (uri) => {
  const bodyJSON = JSON.stringify({
    query: getArticleQuery(uri),
    variables: null,
  });
  const resp = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    body: bodyJSON,
    credentials: "include",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
      "Content-Type": "application/json",
      "nyt-app-type": "project-vi",
      "nyt-app-version": "0.0.5",
      "nyt-token":
        "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs+/oUCTBmD/cLdmcecrnBMHiU/pxQCn2DDyaPKUOXxi4p0uUSZQzsuq1pJ1m5z1i0YGPd1U1OeGHAChWtqoxC7bFMCXcwnE1oyui9G1uobgpm1GdhtwkR7ta7akVTcsF8zxiXx7DNXIPd2nIJFH83rmkZueKrC4JVaNzjvD+Z03piLn5bHWU6+w+rA+kyJtGgZNTXKyPh6EC6o5N+rknNMG5+CdTq35p8f99WjFawSvYgP9V64kgckbTbtdJ6YhVP58TnuYgr12urtwnIqWP9KSJ1e5vmgf3tunMqWNm6+AnsqNj8mCLdCuc5cEB74CwUeQcP2HQQmbCddBy2y0mEwIDAQAB",
      cookie:
        "nyt-a=z-EnbI3t2vLbxA7rCfDDLF; optimizelyEndUserId=oeu1564580208057r0.2423118182095445; walley=GA1.2.247846762.1564580210; _ga=GA1.2.1492934712.1570675170; LPVID=RkYjc2YTBlODVlMzFiYmNk; _derived_epik=dj0yJnU9THk5Uy1zdUVYR0hMdHJkdXFDQXBWam10UVlyRFRYRWombj1mQUI1NTA4aWZQS3lMU21mNEVTc3N3Jm09MSZ0PUFBQUFBRjY3VjdnJnJtPTEmcnQ9QUFBQUFGNjdWN2c; FPC=id=bcbd8d97-0377-4a10-a229-a99b6dcc1200; iter_id=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb21wYW55X2lkIjoiNWMwOThiM2QxNjU0YzEwMDAxMmM2OGY5IiwidXNlcl9pZCI6IjVkNjA5OWJjNDcwNDAxMDAwMTRlNjE1OSIsImlhdCI6MTU5Mjk2NjU0NH0.Bsf1-rfPdUKaCYQreeG233Ke3VSr0dWW76b_EpxUeUc; nyt-auth-method=username; __utma=69104142.1492934712.1570675170.1589335989.1610833440.3; __utmz=69104142.1610833440.3.1.utmcsr=google|utmccn=(organic)|utmcmd=organic|utmctr=(not%20provided); nyt-purr=cfshcfhssck; _fbp=fb.1.1611761418047.63835924; _gcl_au=1.1.1347484644.1612973578; _parsely_visitor={%22id%22:%22pid=6d4b1aa8493fe03b50982442caf401e8%22%2C%22session_count%22:3%2C%22last_session_ts%22:1613242414044}; __gads=ID=85173b4ee2c0355e:T=1601477910:R:S=ALNI_Mb9EPFS6yrA1tWsJ7_zsFP3w6XaMQ; walley_gid=GA1.2.1332535127.1613744279; b2b_cig_opt=%7B%22isCorpUser%22%3Afalse%7D; edu_cig_opt=%7B%22isEduUser%22%3Afalse%7D; purr-cache=<K0<r<C_<G_<S0; NYT-S=1wP6DIi1d7I9u91YEbMjJHnV.n6y1.BOkVlsgeT6fY9SD0Lw7mSZb8eWbrDtREQUSLjOoea6bgYnRn0cf/aw.0nDvqdyGWVlZd3DeCo6rhhfUuWtf59mXCFjxDTQO38FS1; _scid=435e64d8-b674-4c39-800c-96a8cd259089; _sctr=1|1613808000000; LPSID-17743901=flTfIFnFTwi3a0UnsPfOIQ; nyt-gdpr=0; nyt-geo=US; nyt-m=DECC7925867E46BC93C9FA76126AB8F7&igu=i.1&iir=i.0&e=i.1614589200&iue=i.0&n=i.2&igd=i.0&igf=i.0&ird=i.0&uuid=s.86debd7e-d8a6-4c18-8246-58950327cfc3&v=i.3&fv=i.0&iru=i.1&rc=i.0&pr=l.4.0.0.0.0&cav=i.0&iub=i.0&ifv=i.0&t=i.4&g=i.0&vr=l.4.0.0.0.0&vp=i.0&imu=i.1&ica=i.0&er=i.1613832052&ft=i.0&prt=i.0&imv=i.0&ier=i.0&iga=i.0&ira=i.0&s=s.core; nyt-jkidd=uid=161029898&lastRequest=1613832052724&activeDays=%5B1%2C1%2C1%2C1%2C1%2C1%2C1%2C1%2C0%2C1%2C1%2C1%2C1%2C0%2C1%2C0%2C0%2C1%2C0%2C1%2C1%2C1%2C1%2C1%2C1%2C0%2C1%2C0%2C1%2C1%5D&adv=23&a7dv=5&a14dv=10&a21dv=15&lastKnownType=regi; datadome=_W691~9bnH7OX4CTOqiNrxq649O1BVKQuZOxXAZRHORIxtBjRB4ZPI0OEk8F5OqYgyzAvlB.pKkom3OfJmDgrerb4klsOB7r_93QXdHM6V; _gat_UA-58630905-2=1",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      accept: "*/*",
      "accept-encoding": "gzip, deflate, br",
      "accept-language": "en-US,en;q=0.9,es;q=0.8,la;q=0.7",
      pragma: "no-cache",
      referer: "https://www.nytimes.com/",
    },
  });
  if (resp.status !== 200) {
    const body = await resp.text();
    throw new Error(`Unexpected status code ${resp.status}: ${body}`);
  }
  const doc = await resp.json();
  return articleFromResponse(doc);
};

const articleFromResponse = (respJson) => {
  const rawArticle = respJson.data.article;
  if (!rawArticle) {
    // Equivalent to 404
    return null;
  }
  return {
    ...rawArticle,
    uri: rawArticle.uri,
    wordCount: rawArticle.wordCount,
    published: new Date(rawArticle.firstPublished),
    desk: rawArticle.desk,
    section: rawArticle.section?.name,
    subsection: rawArticle.subsection?.name,
    tone: rawArticle.tone,
    tags: rawArticle.timesTags
      .map((tt) => tt?.displayName || tt?.vernacular)
      .filter((tt) => !!tt),
    creators: rawArticle.bylines
      .map((bl) => {
        return bl.creators.map((c) => {
          return {
            ...c,
            url: c?.bioUrl || c?.url,
            image: c?.promotionalMedia?.crops?.[0]?.renditions?.[0]?.url,
          };
        });
      })
      .flat(),
    body: rawArticle.body.content
      .map((c) =>
        c.content
          ? c.content
              .map((cc) => cc?.text)
              .filter((c) => !!c)
              .join("")
          : null
      )
      .filter((p) => !!p)
      .join("\n\n")
      .trim(),
  };
};
