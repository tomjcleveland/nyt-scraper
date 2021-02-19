import GraphiQL from "graphiql";

import "graphiql/graphiql.min.css";

function graphQLFetcher(graphQLParams: any) {
  return fetch(URL, {
    method: "post",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(graphQLParams),
  }).then((response) => response.json());
}

function App() {
  return <GraphiQL fetcher={graphQLFetcher} editorTheme={"dracula"} />;
}

export default App;
