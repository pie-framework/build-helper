import { execSync } from 'child_process';
import debug from 'debug';

const log = debug('build-helper:deploy-to-now');

export const deployToNow = (dir, token, nowPath: string = 'now') => {
  const cmd = `${nowPath} ${dir} ${token ? `--token=${token}` : ''}`;
  log('cmd: ', cmd);
  return execSync(cmd, { stdio: 'inherit' });
};
