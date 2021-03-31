/**
 * Query to select the content of project column whose id passed in query.
 * The content of project column contains first 30 card which is of three
 * types: card text content, issues and pull requests.
 */
const ISSUE_QUERY = `
query ($name: String!, $owner: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      issue(number: $number) {
        url
        title
        assignees(first: 10) {
          nodes {
            login
          }
        }
      }
    }
  }
`;

module.exports = ISSUE_QUERY;
