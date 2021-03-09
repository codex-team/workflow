/**
 * Query to select first 30 members of organization `codex-team` with
 * actual numbers of members as totalCount and login names of members.
 */
const MEMBERS_QUERY = `query {
  organization(login: "codex-team") {
    membersWithRole(first:30){
      totalCount
        nodes{
          login
        }
    }
  }
}`;

module.exports = MEMBERS_QUERY;
