const parseGithubUrl = require('parse-github-url');

/**
 * Useful methods
 */
class Utils {
  /**
   * Trim long strings and add '…'
   *
   * @param {string} inputString - string to be trimmed
   * @param {number} maxLenght - max string length
   * @returns {string|*}
   */
  static trimString(inputString, maxLenght) {
    return maxLenght && (inputString.length > maxLenght)
      ? inputString.substring(0, maxLenght - 1) + '…'
      : inputString;
  }

  /**
   *
   * @param {object} obj - object to be checked.
   * @param {string} property - property that need to be checked.
   * @param  {...any} rest - higher level property that need to be checked.
   * @returns {boolean}
   */
  static isPropertyExist(obj, property, ...rest) {
    if (obj === undefined || obj === null) {
      return false;
    }
    if (rest.length == 0 && Object.prototype.hasOwnProperty.call(obj, property)) {
      return true;
    }

    return Utils.isPropertyExist(obj[property], ...rest);
  }

  /**
   * Parse mention list to string
   * and build mention map that links github to telegram usernames.
   *
   * @param {Array} mentions - list of mentioned people in string/JSON
   * @returns {object} { mentionStr: string, mentionMap: object } - mention list in string, and github-telegram mention map
   */
  static parseMention(mentions) {
    const mentionGit = [];
    const mentionMap = {};

    mentions.forEach((person) => {
      if (typeof person != 'string') {
        mentionGit.push(person.gh);
        mentionMap[person.gh] = person.tg;

        return;
      }
      mentionGit.push(person);
      mentionMap[person] = person;
    });

    mentionMap['unassigned'] = 'Unassigned';

    const mentionStr = mentionGit.join(' ');

    return {
      mentionStr: mentionStr,
      mentionMap: mentionMap,
    };
  }

  /**
   * Check and Parse the Github link which either issue or pull request.
   *
   * @param {string} message - message with or without Github link.
   * @returns {Array} - First element for checking is message have any
   *  parsable Github link or not and reset are parsed form of link.
   */
  static checkForParsableGithubLink(message) {
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
  static replaceGithubLink(message, markdownLink) {
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
  static escapeChars(message) {
    message = message.replace(/</g, '&lt;');
    message = message.replace(/>/g, '&gt;');
    message = message.replace(/&/g, '&amp;');

    return message;
  }

  /**
   * Return emoji for review state
   *
   * ✅ approved
   * ❌ changes requested
   * 💬 commented
   * 🔸 review is pending
   *
   * @param {string} state - review state
   * @returns {string}
   */
  static getReviewStateEmoji(state = '') {
    switch (state) {
      case 'APPROVED': return '✅';
      case 'CHANGES_REQUESTED': return '❌';
      case 'COMMENTED': return '💬';
      default: return '🔸';
    }
  }

  /**
   * Parse reviews of PR into symbolic form
   *
   * @param {Array} latestOpinionatedReviews - list of latest opinionated reviews on PR
   * @param {Array} latestReviews - list of lastest reviews on PR
   * @param {Array} reviewRequests -  list of review requests on PR
   * @returns {string} - Symbolic string Contains parsed form of reviews
   */
  static createReviewStatus(latestOpinionatedReviews, latestReviews, reviewRequests) {
    const reviewReport = {};

    /**
     * 💬 LatestReviews for adding commented status
     */
    if (Utils.isPropertyExist(latestReviews, 'nodes')) {
      latestReviews.nodes.reverse().forEach(({ state, author }) => {
        const person = author.login;

        reviewReport[person] = Utils.getReviewStateEmoji(state);
      });
    }

    /**
     * ✅❌ LatestOpinionatedReviews for the approved and changes requested
     */
    if (Utils.isPropertyExist(latestOpinionatedReviews, 'nodes')) {
      latestOpinionatedReviews.nodes.forEach(({ state, author }) => {
        const person = author.login;

        reviewReport[person] = Utils.getReviewStateEmoji(state);
      });
    }
    /**
     * 🔸 Requested review
     */
    if (Utils.isPropertyExist(reviewRequests, 'nodes')) {
      reviewRequests.nodes.forEach(({ requestedReviewer: { login } }) => {
        reviewReport[login] = Utils.getReviewStateEmoji();
      });
    }
    let reviewStatus = '';

    Object.entries(reviewReport).forEach(([login, state]) => {
      reviewStatus += `${state}`;
    });

    return reviewStatus;
  }

  /**
   * Parse github link via jonschlinkert/parse-github-url module
   *
   * https://github.com/jonschlinkert/parse-github-url
   *
   * @param {string} url - any github link (to pr or issue for example)
   * @returns {string} - HTML marked link to repo
   */
  static createTaskBadge(url) {
    const repoInfo = parseGithubUrl(url);

    return `<a href="https://github.com/${repoInfo.repo}"><b>${repoInfo.name}</b></a>`;
  }
}

module.exports = Utils;
