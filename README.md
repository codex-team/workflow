# CodeX workflow For Telegram Bot Messages

## Clone   

Clone the repository via command line:

```bash
$ git clone https://github.com/codex-team/workflow
```

## Set Environment Variables

Rename `config.yml.example` to `config.yml` and set required parameters for application.
Then run with following command.

## Run

### Docker

```bash
$ docker-compose up
```

### Node.js and Yarn

Get required dependencies by the following command.

```bash
$ yarn install
```

Run the app

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
}
```
