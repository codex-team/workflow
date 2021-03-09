/**
 * Query to get list of columns for target project by number
 */
const PROJECT_QUERY = `
query {
  organization(login: "codex-team") {
    project(number: 11) {
      id,
      name,
      columns(first: 10) {
        edges {
          node {
            id,
            name
          } 
        }
      }
    }
  }
}`;

module.exports = PROJECT_QUERY;
