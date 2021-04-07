require('dotenv').config();
const { Octokit } = require('@octokit/core');
const parseGithubUrl = require('parse-github-url');
const axios = require('axios').default;
const CronJob = require('cron').CronJob;

const TOKEN = process.env.TOKEN;
const COLUMN_NODE_ID_TO_DO = process.env.COLUMN_NODE_ID_TO_DO;
const COLUMN_NODE_ID_PR = process.env.COLUMN_NODE_ID_PR;
const NOTIFIER_URL = process.env.NOTIFIER_URL;
const MENTION = process.env.MENTION;
const MEETING_MENTION = process.env.MEETING_MENTION;
const PARSE_MODE = 'HTML';

/**
 * The default cron expression described as:
 * At minute 0 past hour 9 and 18 on every day-of-week from Monday through Friday.
 */
const TO_DO_TIME = process.env.PR_TIME || '0 9,20 * * 1-5';
/**
 * The default cron expression described as:
 * At minute 0 past hour 9 and 18 on every day-of-week from Monday through Friday.
 */
const PR_TIME = process.env.PR_TIME || '0 9,20 * * 1-5';
/**
 * The default cron expression described as:
 * At 21:00 on every day-of-week from Monday through Friday.
 */
const MEETING_TIME = process.env.MEETING_TIME || '0 21 * * 1-5';
const octokit = new Octokit({ auth: TOKEN });

const MEMBERS_QUERY = require('./queries/members');
const CARDS_QUERY = require('./queries/cards');
const ISSUE_QUERY = require('./queries/issue');
const PR_QUERY = require('./queries/pr');

/**
 * Sends POST request to telegram bot
 *
 * @param {string} message - telegram message
 * @param {boolean} markdown - telegram message include markdown or not.
 * @returns {Promise} - returns a promise to catch error.
 */
async function notify(message) {
  let messageData = `parse_mode=${PARSE_MODE}&disable_web_page_preview=True&message=${encodeURIComponent(message)}`;

  return axios({
    method: 'POST',
    url: NOTIFIER_URL,
    data: messageData,
  });
}

/**
 * Check and Parse the Github link which either issue or pull request.
 *
 * @param {string} message - message with or without Github link.
 * @returns {Array} - First element for checking is message have any
 *  parsable Github link or not and reset are parsed form of link.
 */
function checkForParsableGithubLink(message) {
  const result = message.match(
    /https?:\/\/github\.com\/(?:[^/\s]+\/)+(?:issues\/\d+|pull\/\d+)/gm
  );

  if (result) {
    const [, , , owner, name, type, id] = result[0].split('/');

    return [true, owner, name, type, id];
  }

  return [ false ];
}

/**
 * Replace the Github Link with corresponding markdown link.
 *
 * @param {string} message - contains the Github Link
 * @param {string} markdownLink - markdown link with title included.
 * @returns {string} - message with markdown title.
 */
function replaceGithubLink(message, markdownLink) {
  return message.replace(
    /https?:\/\/github\.com\/(?:[^/\s]+\/)+(?:issues\/\d+|pull\/\d+)/gm,
    markdownLink
  );
}

/**
 * Escape chars in raw string which should not be processed as marked text
 *
 * List of chars to be transcoded
 * https://core.telegram.org/bots/api#html-style
 *
 * @param {string} message - string to be processed
 * @returns {string}
 */
function escapeChars(message) {
  message = message.replaceAll('<', '&lt;');
  message = message.replaceAll('>', '&gt;');
  message = message.replaceAll('&', '&amp;');

  return message;
}

/**
 * Parse github link via jonschlinkert/parse-github-url module
 *
 * https://github.com/jonschlinkert/parse-github-url
 *
 * @param {string} url - any github link (to pr or issue for example)
 * @returns {string} - HTML marked link to repo
 */
function createTaskBadge(url) {
  const repoInfo = parseGithubUrl(url);

  return `<a href="https://github.com/${repoInfo.repo}"><b>${repoInfo.name}</b></a>`;
}

/**
 * parse the response of GraphQL query for pull request.
 *
 * @param {object} content - response of GraphQL API.
 * @returns {string} - parsed message.
 */
function pullRequestParser(content) {
  let parsedTask = `${createTaskBadge(content.url)}: <a href="${content.url}">${escapeChars(content.title)}</a> @${content.author.login}`;

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
  let parsedTask = `${createTaskBadge(content.url)}: <a href="${content.url}">${escapeChars(content.title, '')}</a>`;

  content.assignees.nodes.forEach((node) => {
    parsedTask += `@${node.login} `;
  });

  return parsedTask;
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

    return replaceGithubLink(
      message,
      pullRequestParser(response.repository.pullRequest)
    );
  }
  if (type === 'issues') {
    const response = await graphqlQuery(ISSUE_QUERY, {
      name: name,
      owner: owner,
      number: parseInt(id),
    });

    return replaceGithubLink(message, issuesParser(response.repository.issue));
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
    await response.map(async (items) => {
      if (items.state === 'NOTE_ONLY') {
        for (let i = 0; i < members.length; i++) {
          if (items.note.includes(`@${members[i].name}`)) {
            const parsable = checkForParsableGithubLink(items.note);

            return parsable[0]
              ? await parseGithubLink(items.note, parsable)
              : escapeChars(items.note);
          }
        }
        const parsable = checkForParsableGithubLink(items.note);

        return parsable[0]
          ? await parseGithubLink(items.note, parsable)
          : `${items.note} ${items.creator.loging}`;
      } else if (items.state === 'CONTENT_ONLY') {
        if (items.content.__typename === 'PullRequest') {
          return pullRequestParser(items.content);
        }
        if (items.content.__typename === 'Issue') {
          return issuesParser(items.content);
        }
      }

      return '';
    })
  );

  let cardDataWithoutMembers = [ ...parsedCardData ];

  for (let i = 0; i < members.length; i++) {
    cardDataWithoutMembers = cardDataWithoutMembers.map((x) =>
      x.replace(new RegExp(`@${members[i].name}`, 'g'), '')
    );
  }
  cardDataWithoutMembers = cardDataWithoutMembers.map((x) => x.replace(/^\s+|\s+$/g, ''));

  parsedCardData.forEach((items, index) => {
    for (let i = 0; i < members.length; i++) {
      if (items.includes(`@${members[i].name}`)) {
        members[i].tasks.push(cardDataWithoutMembers[index]);
      }
    }
  });

  return members;
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
    memberList.split(' ').forEach((items) => {
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
  let dataToSend = title + ' \n\n';
  const queryResponse = await graphqlQuery(CARDS_QUERY, { id: columnID });
  const parsedData = await parseQuery(
    getMembersName(MENTION),
    queryResponse.node.cards.nodes
  );

  parsedData.forEach((items) => {
    /** Skip person with no tasks */
    if (!items.tasks.length) {
      return;
    }

    dataToSend += `<b>${items.name}</b>\n`;

    items.tasks.forEach((data) => {
      dataToSend += `• ${data}\n`;
    });

    dataToSend += '\n';
  });

  return dataToSend;
}

/**
 *
 * @param {string} mentionList - contains mentionList with space as separator
 * @returns {string} -parsed messages
 */
function parseMeetingMessage(mentionList) {
  let message = `☝️ Join the meeting in Discord!\n\n`;

  mentionList.split(' ').forEach((items) => {
    message += `@${items} `;
  });

  return message;
}

/**
 * Call the Github GraphQL API, parse its response to message and add that message as cron job.
 */
async function main() {
  const toDoJob = new CronJob(
    TO_DO_TIME,
    async () => {
      notify(await notifyMessage("📌 Sprint's backlog", COLUMN_NODE_ID_TO_DO))
        .then(() => console.log('Tasks Job Completed.'))
        .catch(console.error);
    },
    null,
    true,
    'Europe/Moscow'
  );

  const prJob = new CronJob(
    PR_TIME,
    async () => {
      notify(await notifyMessage('👀 Pull requests for review', COLUMN_NODE_ID_PR))
        .then(() => console.log('PR Job Completed.'))
        .catch(console.error);
    },
    null,
    true,
    'Europe/Moscow'
  );
  const meetingJob = new CronJob(
    MEETING_TIME,
    () => {
      notify(parseMeetingMessage(MEETING_MENTION))
        .then(() => console.log('Meeting Job Completed.'))
        .catch(console.error);
    },
    null,
    true,
    'Europe/Moscow'
  );

  toDoJob.start();
  console.log('To do list Notifier started');
  console.log('Will notify at:' + TO_DO_TIME);

  prJob.start();
  console.log('PR review list Notifier started');
  console.log('Will notify at:' + PR_TIME);

  meetingJob.start();
  console.log('Meeting notifier started');
  console.log('Will notify at:' + MEETING_TIME);
}

main();
