/**
 * Query to get details of pull request by using name of repo,owner of repo and
 * issue number or id.
 */
const PR_QUERY = `
 query ($name: String!, $owner: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        url
        title
        __typename
        author {
          login
        }
        reviewRequests(first: 10) {
          nodes {
            requestedReviewer {
              ... on User {
                login
              }
            }
          }
        }
        assignees(first: 10) {
          nodes {
            login
          }
        }
      }
    }
  }
  `;

module.exports = PR_QUERY;
