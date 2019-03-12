import { join } from 'path';
import { readdirSync, readJsonSync, writeFileSync, remove } from 'fs-extra';
import { Writable } from 'stream';
// import * as conventionalChangelog from 'conventional-changelog';
import * as conventionalChangelogCore from 'conventional-changelog-core';

const NEXT_CHANGELOG = 'NEXT.CHANGELOG.md';

export const getPackages = (root: string): { dir: string; pkg: any }[] => {
  const pkgs = readdirSync(root);
  return pkgs.map(p => {
    const dir = join(root, p);
    return {
      dir,
      pkg: readJsonSync(join(dir, 'package.json'))
    };
  });
};

class StringWritable extends Writable {
  private parts: string[];
  constructor(readonly done) {
    super();
    this.parts = [];
  }

  _write(chunk, enc, next) {
    this.parts.push(chunk);
    next();
  }
  end() {
    this.done(null, this.parts.join(''));
  }
}

// debug: console.log.bind(console),
export const buildNextChangelogs = async packagesDir => {
  const packages = getPackages(packagesDir);

  const promises = packages.map(async p => {
    console.log('next changelog for : ', p.dir);
    const changelog = await getUnreleasedChangelog(p);
    return { ...p, changelog };
  });

  const results = await Promise.all(promises);
  results.forEach(r => {
    writeFileSync(join(r.dir, NEXT_CHANGELOG), r.changelog, 'utf8');
  });
  return results;
};

export const rmNextChangelogs = async packagesDir => {
  const packages = getPackages(packagesDir);
  return Promise.all(packages.map(p => remove(join(p.dir, NEXT_CHANGELOG))));
};

export const getUnreleasedChangelog = (pk: {
  dir: string;
  pkg: any;
}): Promise<string> => {
  return new Promise((resolve, reject) => {
    const ws = new StringWritable((err, s) => {
      if (err) {
        reject(err);
      } else {
        resolve(s);
      }
    });

    const options = {
      preset: 'angular',
      pkg: {
        path: pk.dir
      },
      outputUnreleased: true,
      lernaPackage: pk.pkg.name,
      releaseCount: 1
    };
    const gitRawCommitsOpts = {
      path: pk.dir
    };
    const context = undefined;
    const stream = conventionalChangelogCore(
      options,
      context,
      gitRawCommitsOpts
    );
    stream.pipe(ws); // or any writable stream
  });
};
