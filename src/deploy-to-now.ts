import { execSync } from 'child_process';
import debug from 'debug';

const log = debug('build-helper:deploy-to-now');

export const deployToNow = (
  dir,
  token,
  alias?: string,
  nowPath: string = 'now'
) => {
  const deployCmd = `${nowPath} ${dir} ${token ? `--token=${token}` : ''}`;
  log('cmd: ', deployCmd);
  const url = execSync(deployCmd, { stdio: 'inherit' });

  log('url: ', url);
  if (alias) {
    const aliasCmd = `${nowPath} alias ${url} ${alias} ${
      token ? `--token=${token}` : ''
    }`;

    log('aliasCmd', aliasCmd);
    const result = execSync(aliasCmd, { stdio: 'inherit' });
  }
};
/*
#!/usr/bin/env bash

###
# builds the static site and deploys it to now.sh, then adds the alias
# scripts/wip $aliasname
###

set -e 

NOW_PATH=$(readlink -e  "node_modules/.bin/now")
rm -fr packages/demo/out

./node_modules/.bin/next build packages/demo 
./node_modules/.bin/next export packages/demo

cd packages/demo/out


echo "? $NOW_PATH"
cmd="$NOW_PATH --public -C"

if [ ! -z "$NOW_TOKEN" ]
  then 
    cmd+=" --token=$NOW_TOKEN"
fi

echo "cmd? $cmd"

URL="$($cmd)"
echo "new deployment at: $URL"

alias="$NOW_PATH alias $URL $1"

if [ ! -z "$NOW_TOKEN" ] 
  then 
    alias+=" --token=$NOW_TOKEN"
fi

echo "alias cmd: $alias"
eval $alias
*/
