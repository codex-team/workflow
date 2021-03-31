/**
 * Query to select the content of project column whose id passed in query.
 * The content of project column contains first 30 card which is of three
 * types: card text content, issues and pull requests.
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
