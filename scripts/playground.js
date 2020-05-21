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

  const t = await client.issue.getTransitions({ issueKey: 'JAT-2' });

  console.log('transitions:', JSON.stringify(t, null, '  '));
  const s = await client.status.getStatus({ statusId: '11976' });
  console.log('status', s);
  const result = await client.issue.editIssue({
    issueKey: 'JAT-2',
    issue: {
      transition: { id: '51' },
      update: {},
      // update: {
      //   add: { comment: 'foo' },
      // },
    },
  });

  console.log(JSON.stringify(result, null, '  '));

  const tr = await client.issue.transitionIssue({
    issueKey: 'JAT-2',
    transition: { id: '51' },
  });
  const newIssue = await client.issue.getIssue({ issueKey: 'JAT-2' });
  console.log('new issue status:', newIssue.status.name);
};

run()
  .then((w) => {
    console.log(w);
  })
  .catch((e) => console.error(JSON.stringify(e, null, '  ')));
