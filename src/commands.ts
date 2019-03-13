import { deployToNow } from './deploy-to-now';
import { execPromise } from './exec';
import {
  rmChangelogJson,
  rmNextChangelogJson,
  writeNextChangelogJson,
  writeReleasedChangelogJson
} from './changelog';
const { resolve } = require('path');
const debug = require('debug');
const log = debug('build-helper:commands');
const err = debug('build-helper:commands:error');
const cmdLog = debug('build-helper:commands:cmd');
const invariant = require('invariant');
const bin = (root, n) => resolve(root, 'node_modules/.bin', n);
const root = (root, n) => resolve(root, n);

/**
 * A utility class to help building pie monorepos.
 */
export class Commands {
  private p: any;
  readonly dryRun: boolean;
  constructor(private projectRoot: string, private args: any) {
    this.dryRun = !!args.dryRun || process.env.DRY_RUN === 'true';
    this.p = {
      lerna: bin(this.projectRoot, 'lerna'),
      eslint: bin(this.projectRoot, 'eslint'),
      jest: bin(this.projectRoot, 'jest'),
      babel: bin(this.projectRoot, 'babel'),
      now: bin(this.projectRoot, 'now'),
      eslintignore: root(this.projectRoot, '.eslintignore')
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

  runCmds(
    cmds: string[],
    opts: any = {}
  ): Promise<(Buffer | string | undefined)[]> {
    return this.series(cmds, cmd => this.runCmd(cmd, opts));
  }

  private series(cmds: string[], fn: (cmd: string) => Promise<any>) {
    return cmds.reduce((p, cmd) => {
      return p
        .then(() => fn(cmd))
        .catch(e => {
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

  async beforePublish(): Promise<any> {
    const dir = resolve(this.projectRoot, 'packages');
    if (this.args.next) {
      log('[beforePublish] dir:', dir);
      await writeNextChangelogJson(dir);
    } else {
      await rmNextChangelogJson(dir);
    }

    await writeReleasedChangelogJson(dir);
  }

  afterPublish(): Promise<any> {
    const dir = resolve(this.projectRoot, 'packages');
    return rmChangelogJson(dir);
  }

  async release() {
    cmdLog('----> release', this.args);

    const {
      TRAVIS,
      TRAVIS_BRANCH,
      GITHUB_TOKEN,
      TRAVIS_REPO_SLUG
    } = process.env;

    if (TRAVIS) {
      invariant(TRAVIS_BRANCH, 'TRAVIS_BRANCH env var must be defined');
      invariant(GITHUB_TOKEN, 'GITHUB_TOKEN env var must be defined');
      invariant(TRAVIS_REPO_SLUG, 'TRAVIS_REPO_SLUG env var must be defined');

      log(
        '-----> running in TRAVIS - checkout the branch (detached head doesnt work with lerna)'
      );
      await this.runCmds([
        `git remote set-url origin https://${GITHUB_TOKEN}@github.com/${TRAVIS_REPO_SLUG}.git`,
        `git checkout ${TRAVIS_BRANCH}`,
        'git rev-parse --short HEAD'
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
        '--force-publish'
      ];

      if (this.args.skipForcePublish) {
        nextOpts.pop();
      }

      return nextOpts.join(' ');
    };

    const releaseCmd = `${this.p.lerna} publish --conventional-commits ${
      this.args.lernaLogLevel ? `--loglevel ${this.args.lernaLogLevel}` : ''
    } ${this.args.interactive ? '' : '--yes'} ${
      this.args.next ? getNextOpts() : ''
    }`;

    await this.runCmds([releaseCmd]);

    if (!this.args.skipPublishHooks) {
      await this.afterPublish();
    }
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
      `${this.p.lerna} exec -- ${this.p.eslint} --ignore-path ${
        this.p.eslintignore
      } --ext .js --ext .jsx src`
    ]);
  }

  babel() {
    console.log('>> babel override for babel 7');
    return this.runCmds([
      `${this.p.lerna} exec -- ${
        this.p.babel
      } --ignore '**/__test__/**','**/__tests__/**' src -d lib --source-maps --root-mode upward`
    ]);
  }

  test() {
    return this.runCmds([`${this.p.jest}`]);
  }

  execute() {
    const knownActions = this.args._.filter(a => this[a]);

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
      .catch(e => {
        err(e.message);
        throw e;
      })
      .then(r => {
        log('done!');
        return r;
      });
    log('out: ', out);
    return out;
  }
}
