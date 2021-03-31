require("dotenv").config();
const { Octokit } = require("@octokit/core");
const axios = require("axios").default;
const CronJob = require("cron").CronJob;

const TOKEN = process.env.TOKEN;
const COLUMN_NODE_ID_TO_DO = process.env.COLUMN_NODE_ID_TO_DO;
const COLUMN_NODE_ID_PR = process.env.COLUMN_NODE_ID_PR;
const NOTIFIER_URL = process.env.NOTIFIER_URL;
const MENTION = process.env.MENTION;
const MEETING_MENTION = process.env.MEETING_MENTION;
/**
 * The default cron expression described as:
 * At minute 0 past hour 9 and 18 on every day-of-week from Monday through Friday.
 */
const TO_DO_TIME = process.env.PR_TIME || "0 9,20 * * 1-5";
/**
 * The default cron expression described as:
 * At minute 0 past hour 9 and 18 on every day-of-week from Monday through Friday.
 */
const PR_TIME = process.env.PR_TIME || "0 9,20 * * 1-5";
/**
 * The default cron expression described as:
 * At 21:00 on every day-of-week from Monday through Friday.
 */
const MEETING_TIME = process.env.MEETING_TIME || "0 21 * * 1-5";
const octokit = new Octokit({ auth: TOKEN });

const MEMBERS_QUERY = require("./queries/members");
const CARDS_QUERY = require("./queries/cards");
const ISSUE_QUERY = require("./queries/issue");
const PR_QUERY = require("./queries/pr");

/**
 * Sends POST request to telegram bot
 *
 * @param {string} message - telegram message
 * @returns {Promise} - returns a promise to catch error.
 */
async function notify(message) {
  return axios({
    method: "POST",
    url: NOTIFIER_URL,
    data: "message=" + encodeURIComponent(message) + "&parse_mode=Markdown",
  });
}
function checkForParsableGithubLink(note) {
  let result = note.match(
    /https?:\/\/github\.com\/(?:[^\/\s]+\/)+(?:issues\/\d+|pull\/\d+)/gm
  );
  let link = result ? result[0] : null;
  if (result) {
    const [, , , owner, name, type, id] = result[0].split("/");
    return [true, owner, name, type, id];
  }
  return [false];
}
function replaceGithubLink(note, newLink) {
  return note.replace(
    /https?:\/\/github\.com\/(?:[^\/\s]+\/)+(?:issues\/\d+|pull\/\d+)/gm,
    newLink
  );
}

function pullRequestParser(content) {
  let parsedTask = `[${content.title}](${content.url}) @${content.author.login}`;
  content.reviewRequests.nodes.forEach((node) => {
    if (node.requestedReviewer.login) {
      parsedTask += `@${node.requestedReviewer.login}`;
    }
  });
  content.assignees.nodes.forEach((node) => {
    if (node.login) {
      parsedTask += `@${node.login}`;
    }
  });
  return parsedTask;
}

function issuesParser(content) {
  let parsedTask = `[${content.title}](${content.url})`;
  content.assignees.nodes.forEach((node) => {
    parsedTask += `@${node.login} `;
  });
  return parsedTask;
}
async function parseGithubLink(note, parsable) {
  const [, owner, name, type, id] = parsable;
  if (type === "pull") {
    const response = await graphqlQuery(PR_QUERY, {
      name: name,
      owner: owner,
      number: parseInt(id),
    });
    return replaceGithubLink(
      note,
      pullRequestParser(response.repository.pullRequest)
    );
  }
  if (type === "issues") {
    const response = await graphqlQuery(ISSUE_QUERY, {
      name: name,
      owner: owner,
      number: parseInt(id),
    });
    return replaceGithubLink(note, issuesParser(response.repository.issue));
  }
}
/**
 * Parse the response of sprints backlog query.
 *
 * @param {Array} members - array of object contains members list
 * @param {Array} response - response of query as array of object
 * @returns {Array} - array of object which contains members with task
 */
async function parseQuery(members, response) {
  console.log(JSON.stringify(response, null, 2));
  const data = await Promise.all(
    await response.map(async (items) => {
      if (items.state === "NOTE_ONLY") {
        for (let i = 0; i < members.length; i++) {
          if (items.note.includes(`@${members[i].name}`)) {
            const parsable = checkForParsableGithubLink(items.note);
            return parsable[0]
              ? await parseGithubLink(items.note, parsable)
              : items.note;
          }
        }
        const parsable = checkForParsableGithubLink(items.note);
        return parsable[0]
          ? await parseGithubLink(items.note, parsable)
          : `${items.note} ${items.creator.loging}`;
      } else if (items.state === "CONTENT_ONLY") {
        if (items.content.__typename === "PullRequest") {
          return pullRequestParser(items.content);
        }
        if (items.content.__typename === "Issue") {
          return issuesParser(items.content);
        }
      }
      return "";
    })
  );

  let processed = [...data];

  for (let i = 0; i < members.length; i++) {
    processed = processed.map((x) =>
      x.replace(new RegExp(`@${members[i].name}`, "g"), "")
    );
  }

  processed = processed.map((x) => x.replace(/^\s+|\s+$/g, ""));
  data.forEach((items, index) => {
    for (let i = 0; i < members.length; i++) {
      if (items.includes(`@${members[i].name}`)) {
        members[i].tasks.push(processed[index]);
      }
    }
  });

  return members;
}

/**
 * Request the GraphQL API of Github with CARDS_QUERY query
 *
 * @param {string} columnID - column ID pass to CARDS_QUERY
 * @returns {Array} - returns the parsed output of query.
 */
function graphqlQuery(query, param) {
  return octokit.graphql(query, param).then((query) => {
    return query;
  });
}

/**
 * Provides list of members with there task
 *
 * @param {string} memberList - contains memberList with space as separator
 * @returns {Array} - returns Array of object contains user name and it's task
 */
function getMembersName(memberList) {
  const members = [];

  if (memberList) {
    memberList.split(" ").forEach((items) => {
      members.push({
        name: items,
        tasks: [],
      });
    });

    return members;
  }

  return octokit.graphql(MEMBERS_QUERY).then((query) => {
    query.organization.membersWithRole.nodes.forEach((items) => {
      members.push({
        name: items.login,
        tasks: [],
      });
    });

    return members;
  });
}

/**
 * Use to create message for telegram bot.
 * It parse the Array of object with members and it's task into message.
 *
 * @param {string} title - Title of parsed message.
 * @param {string} columnID - column ID for Card Query.
 * @returns {string} - Parsed message for telegram bot
 */
async function notifyMessage(title, columnID) {
  let dataToSend = title + " \n\n";
  const queryResponse = await graphqlQuery(CARDS_QUERY, { id: columnID });
  const parsedData = await parseQuery(
    getMembersName(MENTION),
    queryResponse.node.cards.nodes
  );
  parsedData.forEach((items) => {
    dataToSend += `@${items.name}`;
    dataToSend += "\n";

    items.tasks.forEach((data) => {
      dataToSend += `${data} \n`;
    });
    dataToSend += "\n\n";
  });

  return dataToSend;
}

/**
 *
 * @param {string} mentionList - contains mentionList with space as separator
 * @returns {string} -parsed messages
 */
function parseMeetingMessage(mentionList) {
  let message = `☝️
  Join the meeting in Discord!\n`;

  mentionList.split(" ").forEach((items) => {
    message += `@${items} `;
  });

  return message;
}

/**
 * Call the Github GraphQL API, parse its response to message and add that message as cron job.
 */
async function main() {
  // const toDoJob = new CronJob(
  //   TO_DO_TIME,
  //   async () => {
  //     notify(await notifyMessage("📌 Sprint's backlog", COLUMN_NODE_ID_TO_DO))
  //       .then(() => console.log("PR Job Completed."))
  //       .catch(console.error);
  //   },
  //   null,
  //   true,
  //   "Europe/Moscow"
  // );

  // const prJob = new CronJob(
  //   PR_TIME,
  //   async () => {
  //     notify(
  //       await notifyMessage("🚜 Pull requests for review", COLUMN_NODE_ID_PR)
  //     )
  //       .then(() => console.log("PR Job Completed."))
  //       .catch(console.error);
  //   },
  //   null,
  //   true,
  //   "Europe/Moscow"
  // );

  // const meetingJob = new CronJob(
  //   MEETING_TIME,
  //   () => {
  //     notify(parseMeetingMessage(MEETING_MENTION))
  //       .then(() => console.log("Meeting Job Completed."))
  //       .catch(console.error);
  //   },
  //   null,
  //   true,
  //   "Europe/Moscow"
  // );

  // toDoJob.start();
  // console.log("To do list Notifier started");
  // console.log("Will notify at:" + TO_DO_TIME);

  // prJob.start();
  // console.log("PR review list Notifier started");
  // console.log("Will notify at:" + PR_TIME);

  // meetingJob.start();
  // console.log("Meeting notifier started");
  // console.log("Will notify at:" + MEETING_TIME);
  notify(await notifyMessage("📌 Sprint's backlog", COLUMN_NODE_ID_TO_DO))
    .then(() => console.log("PR Job Completed."))
    .catch(console.error);
  notify(await notifyMessage("🚜 Pull requests for review", COLUMN_NODE_ID_PR))
    .then(() => console.log("PR Job Completed."))
    .catch(console.error);
}

main();
