import { execSync } from 'child_process';
import debug from 'debug';

const log = debug('build-helper:deploy-to-now');

export const deployToNow = (
  dir,
  token,
  alias?: string,
  nowPath: string = 'now'
) => {
  const deployCmd = `${nowPath}  ${dir} ${
    token ? `--token=${token}` : ''
  } --public`;
  log('cmd: ', deployCmd);
  const url = execSync(deployCmd).toString();

  log('url: ', url);

  if (!url) {
    return;
  }

  if (alias) {
    const aliasCmd = `${nowPath} alias ${url} ${alias} ${
      token ? `--token=${token}` : ''
    }`;

    log('aliasCmd', aliasCmd);
    const result = execSync(aliasCmd, { stdio: 'inherit' });
  }
};
