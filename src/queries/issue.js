/**
 * Query to get details of issue by using name of repo,owner of repo and
 * issue number or id.
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
