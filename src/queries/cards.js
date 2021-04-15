/**
 * Query to select the content of project column whose id passed in query.
 * The content of project column contains first 30 card which is of three
 * types: card text content, issues and pull requests.
 */
const CARDS_QUERY = `
query($id: ID!) {
  node(id: $id) {
    ... on ProjectColumn {
      name
      cards(first: 50) {
        __typename
        totalCount
        nodes {
          note
          state
          creator {
            login
          }
          content {
            ... on PullRequest {
              title
              __typename
              url
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
              latestOpinionatedReviews(last: 10) {
                totalCount
                nodes {
                  author {
                    login
                  }
                  state
                }
              }
              latestReviews(last: 100) {
                totalCount
                nodes {
                  author {
                    login
                  }
                  state
                }
              }
            }
            ... on Issue {
              title
              url
              __typename
              assignees(first: 10) {
                nodes {
                  login
                }
              }
            }
          }
        }
      }
    }
  }
}`;

module.exports = CARDS_QUERY;
