require('dotenv').config()
const { Octokit } = require('@octokit/core')
const axios = require('axios').default
const CronJob = require('cron').CronJob

const TOKEN = process.env.TOKEN
const COLUMN_NODE_ID = process.env.COLUMN_NODE_ID
const NOTIFIER_URL = process.env.NOTIFIER_URL
const MENTION = process.env.MENTION
const PR_TIME = process.env.PR_TIME || '0 9,18 * * 1-5'

const octokit = new Octokit({ auth: TOKEN })

const MEMBERS_QUERY = `
query {
  organization(login: "codex-team") {
   membersWithRole(first:30){
    totalCount
    nodes{
      login
      }
    }
  }
}
`
const SPRING_BACKLOG_CARDS_QUERY = `
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
              assignees{
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
}
`

async function notify(data) {
  return axios({
    method: 'POST',
    url: NOTIFIER_URL,
    data: 'message=' + encodeURIComponent(data)
  })
}

function parseBacklogCard(members) {
  return octokit
    .graphql(SPRING_BACKLOG_CARDS_QUERY, { id: COLUMN_NODE_ID })
    .then((query) => {
      const data = query.node.cards.nodes.map((items) => {
        if (items.state === 'NOTE_ONLY') {
          return (items.note)
        }
        if (items.state === 'CONTENT_ONLY') {
          if (items.content.__typename === 'PullRequest') { return ('@' + items.content.author.login + ' ' + items.content.url) }
          if (items.content.__typename === 'Issue') {
            const people = items.content.assignees.nodes.map((item) => {
              return '@' + item.login + ' '
            })
            return (people + ' ' + items.content.url)
          }
        }
      })
      let processed = [...data]
      for (let i = 0; i < members.length; i++) {
        processed = processed.map((x) => x.replace(new RegExp('@' + members[i].name, 'g'), ''))
      }
      processed = processed.map((x) => x.replace(/(\r\n|\n|\r)/gm, ''))
      data.map((items, index) => {
        for (let i = 0; i < members.length; i++) {
          if (items.includes('@' + members[i].name)) {
            members[i].tasks.push(processed[index])
          }
        }
      })
      return members
    })
    .catch((err) => {
      console.error("Can't make test request for cards\n", err)
      process.exit(1)
    })
}
const getMembersName = (memberList) => {
  const members = []
  if (memberList) {
    memberList.split(' ').map((items) => {
      members.push({
        name: items,
        tasks: []
      })
    })
    return members
  }
  return octokit
    .graphql(MEMBERS_QUERY)
    .then((query) => {
      query.organization.membersWithRole.nodes.map((items) => {
        members.push({
          name: items.login,
          tasks: []
        })
      })
      return members
    })
    .catch((err) => {
      console.error("Can't make test request for Members\n", err)
      process.exit(1)
    })
}


async function main() {
  const job = new CronJob(
    PR_TIME,
    () => {
      console.log('Firing pr job');
      (async () => {
        let dataToSend = "📌 Sprint's backlog \n\n"
        const response = await parseBacklogCard(await getMembersName(MENTION))
        response.map((items) => {
          dataToSend += ('@' + items.name)
          dataToSend += '\n'
          items.tasks.map((data) => {
            dataToSend += ('⚡️ ' + data + '\n')
          })
          dataToSend += '\n\n'
        })
        notify(dataToSend)
      })()
        .then(() => console.log('Job completed'))
        .catch(console.error)
    },
    null,
    true,
    'Europe/Moscow'
  )
  job.start()
  console.log('Notifier started')
  console.log('Will notify at ' + PR_TIME)

}

main()
