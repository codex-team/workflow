/**
 * Query to select the content of project column whose id passed in query.
 * The content of project column contains first 30 card which is of three
 * types: card text content, issues and pull requests.
 */
const CARDS_QUERY = `
query($id: ID!){
  node(id: $id) {
    ... on ProjectColumn {
      name
      cards(first: 30) {
        __typename
        totalCount
        nodes {
          id
          note
          state
          creator {
            login
          }
          content {
            ... on PullRequest {
              id
              __typename
              url
              author {
                login
              }
            }
            ... on Issue{
              id
              url
              __typename
              assignees(first:10){
                nodes{
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
