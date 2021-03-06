import * as gitRawCommits from 'git-raw-commits';
import { ArrayBufferWritable } from './changelog';
import { execSync } from 'child_process';
import * as _ from 'lodash';
import * as semver from 'semver';
import { Jira } from './jira';

const log = console.log.bind(console, '[lifecycle-handlers]');

const getCommits = (
  packageDir: string,
  repoRoot: string,
  from: string,
  to: string
): Promise<string[]> => {
  console.log(
    '[getChanges] from:',
    from,
    'to: ',
    to,
    'packageDir:',
    packageDir
  );
  const o = gitRawCommits({ from, to, path: packageDir }, { cwd: repoRoot });

  return new Promise((resolve, reject) => {
    const ws = new ArrayBufferWritable((err, s) => {
      if (err) {
        reject(err);
      } else {
        resolve(s.map((b) => b.toString().trim()));
      }
    });

    o.pipe(ws);
  });
};

const getTagList = (root: string, filter: string) => {
  const list = execSync(`git tag --list`).toString().split('\n');
  const filtered = list.filter((n) => n.includes(filter));
  return filtered;
};

const REGEX = /(.+)@(.*)/;

/**
 * return the tag list - most recent first
 */
const getTagsForPackage = (root: string, pkg: string): semver.SemVer[] => {
  const rawList = getTagList(root, pkg);
  return _(rawList)
    .map((l) => {
      const m = l.match(REGEX);
      if (m.length === 3) {
        const v = m[2];
        return semver.parse(v);
      }
    })
    .sort((a, b) => b.compare(a))
    .compact()
    .value();
};

export type JiraOpts = {
  projectId: string;
  projectPrefixes: string[];
  email: string;
  apiToken: string;
  host: string;
};

const getChangelist = (
  packageDir: string,
  repoRoot: string,
  pkg: string,
  latestVersion?: string
) => {
  const tagList = getTagsForPackage(repoRoot, pkg);

  if (latestVersion) {
    const index = tagList.findIndex((s) => s.raw === latestVersion);
    if (index < 0) {
      throw new Error(`cant find tag ${latestVersion} in git tags `);
    }

    const previousVersion = tagList[index + 1].raw;
    return getCommits(
      packageDir,
      repoRoot,
      `${pkg}@${previousVersion}`,
      `${pkg}@${latestVersion}`
    );
  }

  // else get changes from last version released..HEAD
  const lastVersion = tagList[0].raw;
  return getCommits(packageDir, repoRoot, `${pkg}@${lastVersion}`, 'HEAD');
};

export const getFixVersion = (pkg: string, tag: string, version: string) => {
  // console.log('[getFixVersion] ', pkg, tag, version);
  const v = tag === 'next' ? `${version.split('-next')[0]}-next` : version;
  return `${pkg} v${v}`;
};

type Jc = {
  keys: string[];
  message: string;
};

export const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const parseKey = (prefixes: string[], c: string): string[] => {
  return _(prefixes)
    .map((p) => new RegExp(`\\b${escapeRegExp(p)}-(\\d+)\\b`, 'giu'))
    .map((t) => c.match(t))
    .compact()
    .flatten()
    .sort()
    .value();
};

const toJiraCommit = (prefixes: string[], c: string): Jc | undefined => {
  const hasPrefix = prefixes.some((pr) => c.includes(pr));

  if (hasPrefix) {
    const keys = parseKey(prefixes, c);
    return { keys, message: c };
  }
  return undefined;
};

export const deleteAllVersions = async (jiraOpts: JiraOpts) => {
  const jira = new Jira(jiraOpts.host, jiraOpts.email, jiraOpts.apiToken);
  const project = await jira.getProject(jiraOpts.projectId);
  await jira.deleteVersions(project.id);
};

/**
 * Publishes a 'fix version' to jira issues.
 * The version will be based on the version provided in opts.
 * It finds jira tickets in the commit log, then for those tickets sets the fix version.
 *
 * It only supports 'next' and 'latest' tags at the moment.
 *
 * This script would typically be called on 'postpublish'.
 *
 * The opts are expected to be generated by an npm-script.
 * @see https://docs.npmjs.com/misc/scripts#environment
 *
 *
 * @param packageDir
 * @param repoRoot
 * @param jiraOpts
 * @param opts
 */
export const publishFixToJira = async (
  packageDir: string,
  repoRoot: string,
  jiraOpts: JiraOpts,
  opts: {
    npm_package_name: string;
    npm_package_version: string;
    npm_config_tag: string;
    fixVersion: (
      /** the suggested fix version generated by this lib */
      fixVersion: string,
      pkg: string,
      tag: string,
      version: string
    ) => string;
    tagToStatus: { [tag: string]: string };
    dryRun?: boolean;
  }
) => {
  const pkg = opts.npm_package_name;
  const version = opts.npm_package_version;
  const tag = opts.npm_config_tag;

  if (tag !== 'latest' && tag !== 'next') {
    console.log('only publishing for next and latest tags, got tag: ', tag);
    return;
  }

  const changes = await getChangelist(
    packageDir,
    repoRoot,
    pkg,
    tag === 'latest' && version
  );

  const defaultFixVersion = getFixVersion(pkg, tag, version);
  const fixVersion = opts.fixVersion
    ? opts.fixVersion(defaultFixVersion, pkg, tag, version)
    : defaultFixVersion;

  const jiraCommits: Jc[] = _.compact(
    changes.map((c) => toJiraCommit(jiraOpts.projectPrefixes, c))
  );

  const allKeys: string[] = _(jiraCommits)
    .map((jc) => jc.keys)
    .flatten()
    .uniq()
    .value();

  if (!allKeys || allKeys.length === 0) {
    return [];
  }

  const jira = new Jira(jiraOpts.host, jiraOpts.email, jiraOpts.apiToken);

  const project = await jira.getProject(jiraOpts.projectId);

  if (!project || !project.id) {
    console.log('opts', jiraOpts);
    console.log('project', project);
    throw new Error('project is missing id');
  }

  log('projectId: ', project.id);

  const releaseVersion = await jira.findOrCreateVersion(
    project.id,
    fixVersion,
    opts.dryRun
  );

  log('fix version: ', fixVersion, 'all keys: ', allKeys);

  return Promise.all(
    allKeys.map(async (k) => {
      // const v = `${pkg} ${version}`;
      await jira.editIssueFixVersions(
        fixVersion,
        releaseVersion.id,
        k,
        opts.dryRun
      );

      const transitionName = opts.tagToStatus[tag];
      const changed = await jira.changeIssueStatus(k, transitionName);
      if (changed) {
        console.log(k, 'status has been transitioned to: ', transitionName);
      }
    })
  );
};
