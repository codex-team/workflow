require("dotenv").config();
const { Octokit } = require("@octokit/core");
const axios = require("axios").default;
const CronJob = require("cron").CronJob;

const TOKEN = process.env.TOKEN;
const COLUMN_NODE_ID = process.env.COLUMN_NODE_ID;
const NOTIFIER_URL = process.env.NOTIFIER_URL;
const MENTION = process.env.MENTION;
const PR_TIME = process.env.PR_TIME || "0 9,18 * * 1-5";
const SOZVON_TIME = process.env.SOZVON_TIME || "0 21 * * 1-5";

const octokit = new Octokit({ auth: TOKEN });

const CARDS_QUERY = `
query ($id: ID!) {
  node (id: $id) {
    ... on ProjectColumn {
      name
      cards(first: 20) {
        totalCount
        nodes {
          content {
            ... on PullRequest {
              __typename
              url
            }
            ... on Issue {
              __typename
              url
              timelineItems(first: 20) {
                nodes {
                  __typename
                  ... on CrossReferencedEvent {
                     source {
                      __typename
                      ... on PullRequest {
                        url
                      }
                    }
                    target {
                      __typename
                      ... on PullRequest {
                        url
                      }
                    }
                  }
                  ... on ConnectedEvent {
                    source {
                      __typename
                      ... on PullRequest {
                        url
                      }
                    }
                    subject {
                      __typename
                      ... on PullRequest {
                        url
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
`;

function extractPullRequests(cards) {
  const prs = new Set();
  for (let card of cards) {
    card = card.content;
    if (!card) continue;
    if (card.__typename === "Issue") {
      for (const event of card.timelineItems.nodes) {
        if (event.source) {
          switch (event.__typename) {
            case "ConnectedEvent":
              prs.add(event.subject.url);
              break;
            case "CrossReferencedEvent":
              prs.add(event.source.url);
              break;
          }
        }
      }
    } else if (card.__typename === "PullRequest") {
      prs.add(card.url);
    }
  }
  return [...prs];
}

function prsToText(prs) {
  return (
    "Requests to review 😊\n" +
    MENTION.split(",")
      .map((x) => x.trim())
      .map((x) => "@" + x)
      .join(" ") +
    "\n\n" +
    prs.join("\n")
  );
}

async function notify(data) {
  return axios({
    method: "POST",
    url: NOTIFIER_URL,
    data: "message=" + encodeURIComponent(data)
  })
}

async function sendOpenPrs() {
  const query = await octokit.graphql(CARDS_QUERY, { id: COLUMN_NODE_ID });
  console.log(query);
  console.log(query.node.cards.nodes);
  const prs = extractPullRequests(query.node.cards.nodes);
  console.log(prs);

  const resp = await axios({
    method: "POST",
    url: NOTIFIER_URL,
    data: "message=" + encodeURIComponent(prsToText(prs)),
  });
  console.log(resp.status);
  console.log(resp.data);
}

function check() {
  return octokit
    .graphql(CARDS_QUERY, { id: COLUMN_NODE_ID })
    .then((query) => {
      console.log(query);
      console.log(query.node.cards.nodes);
      console.info(
        "Preview:\n" + prsToText(extractPullRequests(query.node.cards.nodes))
      );
    })
    .catch((err) => {
      console.error("Can't make test request\n", err);
      process.exit(1);
    });
}

const SOZVON_MSG = `☝️
Join the meeting in Discord!
@specc @guryn @khaydarovm @nikmel2803 @gohabereg @ilyamore88 @GeekaN @augustovich @n0str @f0m41h4u7 @polina_shneider @oybekmuslimov @xemk4`

async function main() {
  await check();
  console.log("Successful check, continuing");
  const job = new CronJob(
    PR_TIME,
    () => {
      console.log("Firing pr job");
      sendOpenPrs()
        .then(() => console.log("Job completed"))
        .catch(console.error);
    },
    null,
    true,
    "Europe/Moscow"
  );
  job.start();
  console.log("Notifier started");
  console.log("Will notify at " + PR_TIME);

  const sozvonJob = new CronJob(SOZVON_TIME, () => {
    console.log("Firing sozvon job");
    notify(SOZVON_MSG)
      .then(() => console.log("OK"))
      .catch(console.error)   
  }, null, true, "Europe/Moscow")
  sozvonJob.start();
  console.log("Sozvon started");
  console.log("Will notify at " + SOZVON_TIME);
  notify("👨‍🌾PR + Sozvon bot started").then(() => "Notify to chat OK").catch(console.error);
}

main();
