import debug from 'debug';
import { execPromise } from './exec';
const log = debug('build-helper:deploy-to-now');

const runCmd = async (c, dryRun, opts: any = {}): Promise<any> => {
  log(c);
  if (dryRun) {
    return;
  }
  const result = await execPromise(c, opts);
  log(c, 'result:', result);
  if (result) {
    return result.toString();
  } else {
    return result;
  }
};

export const deployToNow = async (
  dir,
  token,
  alias?: string,
  nowPath: string = 'now',
  dryRun: boolean = false
): Promise<string> => {
  const deployCmd = `${nowPath}  ${dir} ${
    token ? `--token=${token}` : ''
  } --public`;

  const url = await runCmd(deployCmd, dryRun);

  log('url: ', url);

  if (!url) {
    log('url is missing - continuing for info purposes');
  }

  if (alias) {
    const aliasCmd = `${nowPath} alias ${url} ${alias} ${
      token ? `--token=${token}` : ''
    }`;

    const result = await runCmd(aliasCmd, dryRun || !url, { stdio: 'inherit' });
    return result;
  }
};
