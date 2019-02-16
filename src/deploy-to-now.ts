import { execSync } from 'child_process';
import debug from 'debug';

const log = debug('build-helper:deploy-to-now');

const runCmd = (c, dryRun, opts: any = {}): string | undefined => {
  log(c);
  if (dryRun) {
    return;
  }
  const result = execSync(c, opts);
  log(c, 'result:', result);
  if (result) {
    return result.toString();
  } else {
    return result;
  }
};

export const deployToNow = (
  dir,
  token,
  alias?: string,
  nowPath: string = 'now',
  dryRun: boolean = false
) => {
  const deployCmd = `${nowPath}  ${dir} ${
    token ? `--token=${token}` : ''
  } --public`;

  const url = runCmd(deployCmd, dryRun);

  log('url: ', url);

  if (!url) {
    log('url is missing - continuing for info purposes');
  }

  if (alias) {
    const aliasCmd = `${nowPath} alias ${url} ${alias} ${
      token ? `--token=${token}` : ''
    }`;

    const result = runCmd(aliasCmd, dryRun || !url, { stdio: 'inherit' });
    return result;
  }
};
