import { deployToNow } from './deploy-to-now';

const { execSync } = require('child_process');
const { resolve } = require('path');
const debug = require('debug');
const log = debug('build-helper:commands');
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

  staticToNow(dir: string, alias?: string) {
    const token = process.env.NOW_TOKEN;

    deployToNow(dir, token, alias, this.p.now, this.dryRun);
  }

  runCmds(cmds: string[], opts: any = {}) {
    cmds.forEach(c => {
      log('[cmd]: ', c, ` - in [${opts.cwd ? opts.cwd : process.cwd()}]`);

      if (this.dryRun) {
        return;
      }
      execSync(c, { stdio: 'inherit', ...opts });
    });
  }

  release() {
    cmdLog('----> release');

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
      this.runCmds([
        `git remote set-url origin https://${GITHUB_TOKEN}@github.com/${TRAVIS_REPO_SLUG}.git`,
        `git checkout ${TRAVIS_BRANCH}`,
        'git rev-parse --short HEAD',
        `git commit . -m "[travis skip] commit post install tree"`,
        `git status`
      ]);
    }

    this.build();

    const releaseCmd = `${this.p.lerna} publish --conventional-commits --yes ${
      this.args.next ? '--canary --preid next --dist-tag next' : ''
    }`;

    this.runCmds([releaseCmd]);
  }

  build() {
    this.clean();
    this.lint();
    this.babel();
    this.test();
  }

  clean() {
    this.runCmds([`${this.p.lerna} exec -- rm -fr lib`]);
  }

  lint() {
    this.runCmds([
      `${this.p.lerna} exec -- ${this.p.eslint} --ignore-path ${
        this.p.eslintignore
      } --ext .js --ext .jsx src`
    ]);
  }

  babel() {
    this.runCmds([
      `${this.p.lerna} exec -- ${
        this.p.babel
      } --ignore '/__test__/','/__tests__/' src -d lib --copy-files --source-maps --config-file ${resolve(
        this.projectRoot,
        '.babelrc'
      )}`
    ]);
  }

  test() {
    this.runCmds([`${this.p.jest}`]);
  }
}
