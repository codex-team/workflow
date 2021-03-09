/**
 * Get env vars
 */
require('dotenv').config();

/**
 * Require
 */
const { Octokit } = require('@octokit/core');
const octokit = new Octokit({ auth: process.env.TOKEN });

/**
 * Load query
 * @type {string}
 */
const PROJECT_QUERY = require('../src/queries/projects');

/**
 * Get and print data
 */
octokit
  .graphql(PROJECT_QUERY)
  .then((query) => {
    const project = query.organization.project;

    console.log(`Columns for project "${project.name}":`);

    project.columns.edges.forEach(node => {
      const column = node.node;

      console.log(`- ${column.name} (${column.id})`);
    });
  });
