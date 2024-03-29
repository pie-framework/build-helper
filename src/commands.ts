import { deployToNow } from './deploy-to-now';
import { execPromise } from './exec';
import { execSync } from 'child_process';
import { join, basename } from 'path';
import { writeChangelogJsonForPackage } from './changelog';
import { series } from './series';
import { parseGitStatus } from './git-helper';
import { PkgAndDir, getPackages as defaultGetPackages } from './pkg';
const { resolve, relative } = require('path');
const debug = require('debug');
const log = debug('build-helper:commands');
const err = debug('build-helper:commands:error');
const cmdLog = debug('build-helper:commands:cmd');
const invariant = require('invariant');
const bin = (root, n) => resolve(root, 'node_modules/.bin', n);
const root = (root, n) => resolve(root, n);

type CiVars = {
  branch: string;
  repo: string;
  username: string;
  email: string;
};

const getCiVars = (): CiVars | undefined => {
  if (process.env.TRAVIS) {
    return {
      branch: process.env.TRAVIS_BRANCH,
      email: 'travis@travis-ci.org',
      repo: process.env.TRAVIS_REPO_SLUG,
      username: 'travis',
    };
  }
  if (process.env.CI) {
    return {
      branch: process.env.CIRCLE_BRANCH,
      email: 'circleci@circleci.com',
      repo: `${process.env.CIRCLE_PROJECT_USERNAME}/${process.env.CIRCLE_PROJECT_REPONAME}`,
      username: 'circleci',
    };
  }
};

const getCurrentBranch = () =>
  execSync(`git rev-parse --abbrev-ref HEAD`).toString().trim();

/**
 * A utility class to help building pie monorepos. 
 */
export class Commands {
  private p: any;
  readonly dryRun: boolean;
  constructor(
    private projectRoot: string,
    private args: any,
    readonly getPackages: (dir: string) => PkgAndDir[] = defaultGetPackages
  ) {
    this.dryRun = !!args.dryRun || process.env.DRY_RUN === 'true';
    this.p = {
      lerna: bin(this.projectRoot, 'lerna'),
      eslint: bin(this.projectRoot, 'eslint'),
      jest: bin(this.projectRoot, 'jest'),
      babel: bin(this.projectRoot, 'babel'),
      now: bin(this.projectRoot, 'now'),
      eslintignore: root(this.projectRoot, '.eslintignore'),
    };
  }

  bin(n) {
    return bin(this.projectRoot, n);
  }

  staticToNow(dir: string, alias?: string): Promise<any> {
    const token = process.env.NOW_TOKEN;
    return deployToNow(dir, token, alias, this.p.now, this.dryRun);
  }

  runCmd(cmd, opts: any = {}): Promise<Buffer | string | undefined> {
    log('[cmd]: ', cmd, ` - in [${opts.cwd ? opts.cwd : process.cwd()}]`);

    if (this.dryRun) {
      return Promise.resolve(undefined);
    }
    return execPromise(cmd, { stdio: 'inherit', ...opts });
  }

  async commit(files: string[], msg: string): Promise<(Buffer | string)[]> {
    const result = await this.runCmd(`git status -s`, {
      cwd: this.projectRoot,
    });

    if (result === undefined || result.toString() === '') {
      return;
    }

    const st = parseGitStatus(result.toString());

    log('[commit] st: ', st);
    const paths = files
      .map((f) => `${relative(this.projectRoot, f)}`)
      .filter((p) => st.some((s) => s.path === p));

    if (paths.length === 0) {
      return;
    }

    const pathString = paths.join(' ');
    log('[commit] path string:', pathString);
    return this.runCmds(
      [`git add ${pathString}`, `git commit ${pathString} -m "${msg}"`],
      {
        cwd: this.projectRoot,
      }
    );
  }

  runCmds(
    cmds: string[],
    opts: any = {}
  ): Promise<(Buffer | string | undefined)[]> {
    return this.series(cmds, (cmd) => this.runCmd(cmd, opts));
  }

  series(cmds: string[], fn: (cmd: string) => Promise<any>) {
    return cmds.reduce((p, cmd) => {
      return p
        .then(() => fn(cmd))
        .catch((e) => {
          log('error in series occured:', e.message);
          throw e;
        });
    }, Promise.resolve());
  }

  async isGitTreeClean(): Promise<boolean> {
    log('[isGitTreeClean]');

    const d = await this.runCmd('git diff');
    if (this.dryRun || !d) {
      return true;
    }

    return d && d.toString && d.toString() === '';
  }

  /** Before lerna publish */
  beforePublish(): Promise<any> {
    return Promise.resolve();
  }

  /** After lerna publish */
  afterPublish(): Promise<any> {
    return Promise.resolve();
  }

  /** called by root package in prepack */
  async changelog() {
    const packagesDir = join(this.projectRoot, 'packages');
    const allPackages = this.getPackages(packagesDir);
    const packages = this.args.scope
      ? allPackages.filter((p) => basename(p.dir) === this.args.scope)
      : allPackages;

    const paths = await series(
      packages.map((pkg) => async () => {
        // This function is called from prepack - so we don't know if it's next or not
        const clPath = await writeChangelogJsonForPackage(pkg, false);
        await writeChangelogJsonForPackage(pkg, true);
        return clPath;
      })
    );

    await this.commit(paths, `[ci skip] update changelog.json`);
    return paths;
  }

  async release() {
    cmdLog('----> release', this.args);

    const { GITHUB_TOKEN } = process.env;

    const ciVars = getCiVars();

    if (ciVars) {
      invariant(GITHUB_TOKEN, 'GITHUB_TOKEN env var must be defined');

      log(
        '-----> running in TRAVIS - checkout the branch (detached head doesnt work with lerna)'
      );
      await this.runCmds([
        `git remote set-url origin https://${GITHUB_TOKEN}@github.com/${ciVars.repo}.git`,
        `git checkout ${ciVars.branch}`,
        'git rev-parse --short HEAD',
        `git config user.name "${ciVars.username}"`,
        `git config user.email "${ciVars.email}"`,
      ]);

      await this.runCmds([`git status`]);
    }

    await this.build();

    if (!this.args.skipPublishHooks) {
      await this.beforePublish();
      log('beforePublish - done...');
    }

    const getNextOpts = () => {
      const nextOpts = [
        '--canary',
        '--preid next',
        '--dist-tag next',
        '--include-merged-tags',
        /**
         * Lerna only checks the last commit to detect changes, so it misses any historicaly changes since
         * the last tag. Ideally we wouldn't force-publish but just get it to find these changes correctly?
         * See: https://github.com/lerna/lerna/blob/master/utils/collect-updates/collect-updates.js#L37
         * > from src:
         * // if it's a merge commit, it will return all the commits that were part of the merge
         * // ex: If `ab7533e` had 2 commits, ab7533e^..ab7533e would contain 2 commits + the merge commit
         * committish = `${sha}^..${sha}`;
         *
         * We would want `${sha}~${refCount}` instead.
         */
        '--force-publish',
      ];

      if (this.args.skipForcePublish) {
        nextOpts.pop();
      }

      return nextOpts.join(' ');
    };

    const releaseCmd = `${
      this.p.lerna
    } publish --conventional-commits --no-verify-access ${
      this.args.lernaLogLevel ? `--loglevel ${this.args.lernaLogLevel}` : ''
    } ${this.args.interactive ? '' : '--yes'} ${
      this.args.next ? getNextOpts() : ''
    }`;

    await this.runCmds([releaseCmd]);

    if (!this.args.skipPublishHooks) {
      await this.afterPublish();
    }
    const branchToPush = ciVars ? ciVars.branch : getCurrentBranch();
    await this.runCmd(`git push origin ${branchToPush}`);
  }

  async build() {
    await this.clean();
    await this.lint();
    await this.babel();
    await this.test();
  }

  clean() {
    return this.runCmds([`${this.p.lerna} exec -- rm -fr lib`]);
  }

  lint() {
    return this.runCmds([
      `${this.p.lerna} exec -- ${this.p.eslint} --ignore-path ${this.p.eslintignore} --ext .js --ext .jsx src`,
    ]);
  }

  babel() {
    console.log('>> babel override for babel 7');
    return this.runCmds([
      `${this.p.lerna} exec -- ${this.p.babel} --ignore '**/__test__/**','**/__tests__/**' src -d lib --source-maps --root-mode upward`,
    ]);
  }

  test() {
    const workerCount = this.args.testWorkers || 1;
    return this.runCmds([`${this.p.jest} -w ${workerCount}`]);
  }

  execute() {
    const knownActions = this.args._.filter((a) => this[a]);

    if (knownActions.length !== this.args._.length) {
      return Promise.reject(new Error(`unknown actions: ${this.args._}`));
    }

    const out = knownActions
      .reduce((acc, action) => {
        return acc.then(() => {
          log(`execute ${action}..`);
          const p = this[action]();
          log(`execute: `, p);
          return p;
        });
      }, Promise.resolve({}))
      .catch((e) => {
        err(e.message);
        throw e;
      })
      .then((r) => {
        log('done!');
        return r;
      });
    log('out: ', out);
    return out;
  }
}
