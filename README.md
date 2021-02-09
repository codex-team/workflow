# CodeX workflow For Telegram Bot Messages

## Clone   

Clone the repository via command line:

```bash
$ git clone https://github.com/codex-team/workflow
```

## Install dependencies

Get required dependencies by the following command.
```bash
$ yarn install
```

## Set Environment Variables & run 

Rename `.env.example` to `.env.sample` and set require env for application.
Then run with following command.
```bash
$ yarn start
```


<!--

Personal Token access: 
- repo - public_repo
- admin:org - read:org


GitHub GraphQL request for getting list of projects and columns:

```graphql
query {
  organization(login: "codex-team") {
    project(number: 10) {
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
}
```
