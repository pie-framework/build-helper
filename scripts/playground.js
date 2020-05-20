const { Jira } = require('../lib/jira');
// projectPrefixes: ["JAT"],
const host = 'illuminate.atlassian.net';
const apiToken = process.env.JIRA_AUTH_TOKEN;
const email = process.env.JIRA_EMAIL;
const projectId = 'JAT';
const c = new Jira(host, email, apiToken);

const jc = require('jira-connector');

const client = new jc({
  basic_auth: { email, api_token: apiToken },
  host,
});

const run = async () => {
  // await c.findStatus('In PRogress');
  const result = await client.issue.editIssue({
    issueKey: 'JAT-2',
    transition: { id: '11976' },
  });

  console.log(JSON.stringify(result, null, '  '));
};

run()
  .then((w) => {
    console.log(w);
  })
  .catch((e) => console.error(JSON.stringify(e, null, '  ')));
