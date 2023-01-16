const yaml = require('js-yaml');
const fs = require('fs');

const config = yaml.load(fs.readFileSync('config.yml', 'utf-8'));

const Utils = require('./utils');
const HawkCatcher = require('@hawk.so/nodejs').default;

const { Octokit } = require('@octokit/core');

const axios = require('axios').default;
const CronJob = require('cron').CronJob;

const TOKEN = config.token;
const HAWK_TOKEN = config.hawk_token;

const COLUMN_NODE_ID_TO_DO = config.column_node_id_to_do;
const COLUMN_NODE_ID_PR = config.column_node_id_pr;
const NOTIFIER_URL = config.notifier_url;
const MEETING_MENTION = config.meeting_mention.join(' ');
const PARSE_MODE = 'HTML';

const mentionParsed = Utils.parseMention(config.mention);
const MENTION = mentionParsed.mentionStr;
const MENTION_MAP = mentionParsed.mentionMap;

const TRIM_PR_NAME_LENGHT = 35;

/**
 * The default cron expression described as:
 * At minute 0 past hour 9 and 18 on every day-of-week from Monday through Friday.
 */
const TO_DO_TIME = config.to_do_time;
/**
 * The default cron expression described as:
 * At minute 0 past hour 9 and 18 on every day-of-week from Monday through Friday.
 */
const PR_TIME = config.pr_time;
/**
 * The default cron expression described as:
 * At 21:00 on every day-of-week from Monday through Friday.
 */
const MEETING_TIME = config.meeting_time;
const octokit = new Octokit({ auth: TOKEN });

const MEMBERS_QUERY = require('./queries/members');
const CARDS_QUERY = require('./queries/cards');
const ISSUE_QUERY = require('./queries/issue');
const PR_QUERY = require('./queries/pr');

if (HAWK_TOKEN) {
  /**
   * Initialize HawkCatcher.
   */
  HawkCatcher.init({
    token: HAWK_TOKEN,
  });
}

/**
 * Request the GraphQL API of Github with passed query and param.
 *
 * @param {string} query - query to be executed.
 * @param {object} param - param to be passed to query.
 * @returns {object} - response of GraphQL API of Github.
 */
function graphqlQuery(query, param) {
  return octokit.graphql(query, param).then((response) => {
    return response;
  });
}

/**
 * Sends POST request to telegram bot
 *
 * @param {string} message - telegram message
 * @returns {Promise} - returns a promise to catch error.
 */
async function notify(message) {
  const messageData = `parse_mode=${PARSE_MODE}&disable_web_page_preview=True&message=${encodeURIComponent(
    message
  )}`;

  return axios({
    method: 'POST',
    url: NOTIFIER_URL,
    data: messageData,
  });
}

/**
 * parse the response of GraphQL query for pull request.
 *
 * @param {object} content - response of GraphQL API.
 * @returns {string} - parsed message.
 */
function pullRequestParser(content) {
  const {
    title,
    latestOpinionatedReviews,
    latestReviews,
    reviewRequests,
    author,
    url,
  } = content;

  const taskTitle = Utils.trimString(Utils.escapeChars(title), TRIM_PR_NAME_LENGHT);
  const reviewState = Utils.createReviewStatus(
    latestOpinionatedReviews,
    latestReviews,
    reviewRequests
  );

  const parsedTask = `${Utils.createTaskBadge(url)}: <a href="${url}">${taskTitle}</a> ${reviewState} @${author.login}`;

  /**
   * @todo discuss if it is necessary to duplicate links to pr
   */
  // content.reviewRequests.nodes.forEach((node) => {
  //   if (node.requestedReviewer.login) {
  //     parsedTask += `@${node.requestedReviewer.login}`;
  //   }
  // });
  //
  // content.assignees.nodes.forEach((node) => {
  //   if (node.login) {
  //     parsedTask += `@${node.login}`;
  //   }
  // });

  return parsedTask;
}

/**
 * parse the response of GraphQL query for issues.
 *
 * @param {object} content - response of GraphQL API.
 * @returns {string} - parsed message.
 */
function issuesParser(content) {
  const {
    title,
    assignees,
    url,
  } = content;
  const taskTitle = Utils.trimString(Utils.escapeChars(title), TRIM_PR_NAME_LENGHT);

  let parsedTask = `${Utils.createTaskBadge(url)}: <a href="${url}">${Utils.escapeChars(taskTitle)}</a>`;

  if (Utils.isPropertyExist(assignees, 'nodes')) {
    assignees.nodes.forEach(({ login }) => {
      parsedTask += `@${login} `;
    });
  }

  return parsedTask;
}

/**
 * Parse the Github link present in message by using GraphQL API of Github.
 *
 * @param {string} message - message with parsable Github link.
 * @param {Array} parsable - Array with detail information about Github link.
 * @returns {string}
 */
async function parseGithubLink(message, parsable) {
  const [, owner, name, type, id] = parsable;

  if (type === 'pull') {
    const response = await graphqlQuery(PR_QUERY, {
      name: name,
      owner: owner,
      number: parseInt(id),
    });

    if (Utils.isPropertyExist(response, 'repository', 'pullRequest')) {
      return Utils.replaceGithubLink(
        message,
        pullRequestParser(response.repository.pullRequest)
      );
    }
  }
  if (type === 'issues') {
    const response = await graphqlQuery(ISSUE_QUERY, {
      name: name,
      owner: owner,
      number: parseInt(id),
    });

    if (Utils.isPropertyExist(response, 'repository', 'issue')) {
      return Utils.replaceGithubLink(message, issuesParser(response.repository.issue));
    }
  }
}

/**
 * Parse the response of CARDS_QUERY
 *
 * @param {Array} members - array of object contains members list
 * @param {Array} response - response of query as array of object
 * @returns {Array} - array of object which contains members with task
 */
async function parseQuery(members, response) {
  const parsedCardData = await Promise.all(
    await response.map(async (cardData) => {
      try {
        if (Utils.isPropertyExist(cardData, 'state')) {
          if (cardData.state === 'NOTE_ONLY') {
            if (Utils.isPropertyExist(cardData, 'note') && Utils.isPropertyExist(cardData, 'creator')) {
              for (let i = 0; i < members.length; i++) {
                if (cardData.note.includes(`@${members[i].name}`)) {
                  const parsable = Utils.checkForParsableGithubLink(cardData.note);

                  return parsable[0]
                    ? await parseGithubLink(cardData.note, parsable)
                    : Utils.escapeChars(cardData.note);
                }
              }
              const parsable = Utils.checkForParsableGithubLink(cardData.note);

              return parsable[0]
                ? await parseGithubLink(cardData.note, parsable)
                : `${cardData.note} @${cardData.creator.login}`;
            }
          } else if (cardData.state === 'CONTENT_ONLY') {
            if (Utils.isPropertyExist(cardData, 'content', '__typename')) {
              if (cardData.content.__typename === 'PullRequest') {
                return pullRequestParser(cardData.content);
              }

              if (cardData.content.__typename === 'Issue') {
                return issuesParser(cardData.content);
              }
            }
          }

          return '';
        }
      } catch (e) {
        HawkCatcher.send(e, {
          cardData: cardData,
        });
      }
    })
  ).catch(HawkCatcher.send);

  let cardDataWithoutMembers = [ ...parsedCardData ];

  for (let i = 0; i < members.length; i++) {
    cardDataWithoutMembers = cardDataWithoutMembers.map((x) =>
      x.replace(new RegExp(`@${members[i].name}`, 'g'), '')
    );
  }
  cardDataWithoutMembers = cardDataWithoutMembers.map((x) =>
    x.replace(/^\s+|\s+$/g, '')
  );

  parsedCardData.forEach((cardData, index) => {
    let assigned = false;

    for (let i = 0; i < members.length; i++) {
      if (cardData.includes(`@${members[i].name}`)) {
        members[i].tasks.push(cardDataWithoutMembers[index]);
        assigned = true;
      }
    }

    // Push unassigned card to 'Unassigned' section
    if (!assigned) {
      // Add 'unassigned' member if it doesn't exist yet
      if (members[members.length - 1].name != 'unassigned') {
        members.push({
          name: 'unassigned',
          tasks: [],
        });
      }

      // Add unassigned card to 'Unassigned' section's tasks list
      members[members.length - 1].tasks.push(cardDataWithoutMembers[index]);
    }
  });

  return members;
}

/**
 * Provides list of members with their task
 *
 * @param {string} memberList - contains memberList with space as separator
 * @returns {Array} - returns Array of object contains user name and it's task
 */
function getMembersName(memberList) {
  const members = [];

  if (memberList) {
    memberList.split(' ').forEach((memberName) => {
      members.push({
        name: memberName,
        tasks: [],
      });
    });

    return members;
  }

  return octokit.graphql(MEMBERS_QUERY).then((query) => {
    query.organization.membersWithRole.nodes.forEach(({ login }) => {
      members.push({
        name: login,
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
 * @param {boolean} includePersonWithNoTask - flag for including the person without task in message.
 * @returns {string} - Parsed message for telegram bot
 */
async function notifyMessage(title, columnID, includePersonWithNoTask = false) {
  let dataToSend = title + ' \n\n';
  const queryResponse = await graphqlQuery(CARDS_QUERY, { id: columnID });
  let parsedData = {};

  if (Utils.isPropertyExist(queryResponse, 'node', 'cards', 'nodes')) {
    parsedData = await parseQuery(
      getMembersName(MENTION),
      queryResponse.node.cards.nodes
    );
  }
  const personWithNoTask = [];

  parsedData.forEach(({ tasks, name }) => {
    /** Skip person with no tasks */
    if (!tasks.length) {
      if (includePersonWithNoTask && name != 'dependabot' && name != 'unassigned') {
        personWithNoTask.push(name);
      }

      return;
    }

    dataToSend += `<b>${MENTION_MAP[name]}</b>\n`;

    tasks.forEach((data) => {
      dataToSend += `• ${data}\n`;
    });

    dataToSend += '\n';
  });

  if (includePersonWithNoTask && personWithNoTask.length) {
    dataToSend += `🏖`;

    personWithNoTask.forEach((person) => {
      dataToSend += ` <b>${MENTION_MAP[person]}</b>`;
    });
  }

  dataToSend += '\n';

  return dataToSend;
}

/**
 *
 * @param {string} mentionList - contains mentionList with space as separator
 * @returns {string} -parsed messages
 */
function parseMeetingMessage(mentionList) {
  let message = `☝️ Join the meeting in Telegram!\n\n`;

  mentionList.split(' ').forEach((mentionName) => {
    message += `@${mentionName} `;
  });

  return message;
}

/**
 * Call the Github GraphQL API, parse its response to message and add that message as cron job.
 */
async function main() {
  if (MEETING_TIME) {
    const meetingJob = new CronJob(
      MEETING_TIME,
      () => {
        notify(parseMeetingMessage(MEETING_MENTION))
          .then(() => console.log('Meeting Job Completed.'))
          .catch(HawkCatcher.send);
      },
      null,
      true,
      'Europe/Moscow'
    );

    meetingJob.start();
    console.log('Meeting notifier started');
    console.log('Will notify at:' + MEETING_TIME);

    // notify(parseMeetingMessage(MEETING_MENTION))
    //   .then(() => console.log('Meeting Job Completed.'))
    //   .catch(HawkCatcher.send);
  }

  if (TO_DO_TIME) {
    const toDoJob = new CronJob(
      TO_DO_TIME,
      async () => {
        notify(
          await notifyMessage("📌 Sprint's backlog", COLUMN_NODE_ID_TO_DO, true)
        )
          .then(() => console.log('Tasks Job Completed.'))
          .catch(HawkCatcher.send);
      },
      null,
      true,
      'Europe/Moscow'
    );

    toDoJob.start();
    console.log('To do list Notifier started');
    console.log('Will notify at:' + TO_DO_TIME);

    // notify(
    //   await notifyMessage("📌 Sprint's backlog", COLUMN_NODE_ID_TO_DO, true)
    // )
    //   .then(() => console.log('Tasks Job Completed.'))
    //   .catch(HawkCatcher.send);
  }

  if (PR_TIME) {
    const prJob = new CronJob(
      PR_TIME,
      async () => {
        notify(
          await notifyMessage('👀 Pull requests for review', COLUMN_NODE_ID_PR)
        )
          .then(() => console.log('PR Job Completed.'))
          .catch(HawkCatcher.send);
      },
      null,
      true,
      'Europe/Moscow'
    );

    prJob.start();
    console.log('PR review list Notifier started');
    console.log('Will notify at:' + PR_TIME);

    // notify(
    //   await notifyMessage('👀 Pull requests for review', COLUMN_NODE_ID_PR)
    // )
    //   .then(() => console.log('PR Job Completed.'))
    //   .catch(HawkCatcher.send);
  }
}

main();
