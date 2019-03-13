import { join } from 'path';
import debug from 'debug';
import {
  readJson,
  readdirSync,
  readJsonSync,
  writeFileSync,
  remove
} from 'fs-extra';
import { execSync } from 'child_process';
import { Writable } from 'stream';
import * as _ from 'lodash';
import { sync as syncParser } from 'conventional-commits-parser';
import * as gitRawCommits from 'git-raw-commits';
import * as mergeConfig from 'conventional-changelog-core/lib/merge-config';

const log = debug('build-helper:changelog');

const NEXT_CHANGELOG = 'NEXT.CHANGELOG.json';
const CHANGELOG = 'CHANGELOG.json';

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

class ArrayBufferWritable extends Writable {
  private parts: Buffer[];
  constructor(readonly done: (e?: Error, data?: Buffer[]) => void) {
    super();
    this.parts = [];
  }

  _write(chunk, enc, next) {
    this.parts.push(chunk);
    next();
  }

  end() {
    this.done(null, this.parts);
  }
}

export const writeChangelogJson = async (
  packagesDir: string,
  filename: string,
  type: string
) => {
  const packages: { dir: string; pkg: any }[] = getPackages(packagesDir);

  const promises = packages.map(async p => {
    log('changelog for : ', p.dir);
    const changelog = await changelogJson(p, { type });
    return { ...p, changelog };
  });

  const results = await Promise.all(promises);
  results.forEach(r => {
    const changelogPath = join(r.dir, filename);
    log(type, 'path:', changelogPath);
    writeFileSync(
      changelogPath,
      JSON.stringify(r.changelog, null, '  '),
      'utf8'
    );
  });
  return results;
};

export const writeNextChangelogJson = async packagesDir =>
  writeChangelogJson(packagesDir, NEXT_CHANGELOG, 'unreleased');

export const writeReleasedChangelogJson = async packagesDir =>
  writeChangelogJson(packagesDir, CHANGELOG, 'released');

export const rmChangelogJson = async packagesDir => {
  const packages = getPackages(packagesDir);
  return Promise.all(packages.map(p => remove(join(p.dir, CHANGELOG))));
};

export const rmNextChangelogJson = async packagesDir => {
  const packages = getPackages(packagesDir);
  return Promise.all(packages.map(p => remove(join(p.dir, NEXT_CHANGELOG))));
};

const readExistingChangelog = (dir: string): Promise<any | undefined> =>
  readJson(join(dir, CHANGELOG)).catch(e => undefined);

const getLatestHashFromExistingChangelog = (
  existingChangelog: any[]
): string => {
  if (Array.isArray(existingChangelog) && existingChangelog.length > 0) {
    return existingChangelog[0].hash || '';
  } else {
    return '';
  }
};

const getTagList = (hash: string): string[] => {
  let tags = execSync(`git tag --contains ${hash}`)
    .toString()
    .trim();

  tags = tags.startsWith(`"`) ? tags.substring(1) : tags;
  tags = tags.endsWith(`"`) ? tags.substring(0, tags.length - 1) : tags;
  return tags.split('\n').filter(s => s && s !== '');
};

export const changelogJson = async (
  pk: {
    dir: string;
    pkg: any;
  },
  opts: any
): Promise<any[]> => {
  const options = {
    preset: 'angular',
    pkg: {
      path: pk.dir
    },
    lernaPackage: pk.pkg.name,
    releaseCount: 0,
    ...opts
  };

  const existingChangelog = await readExistingChangelog(pk.dir);
  log('found existing changelog:', existingChangelog !== undefined, pk.dir);

  const from = getLatestHashFromExistingChangelog(existingChangelog);

  const gitRawCommitsOpts = {
    path: pk.dir,
    merges: true,
    from
  };

  const context = undefined;

  const merged = await mergeConfig(options, context, gitRawCommitsOpts);

  //TODO: use the existing changelog.json if present
  const chunks = await new Promise<Buffer[]>((resolve, reject) => {
    const ws = new ArrayBufferWritable((err, s) => {
      if (err) {
        reject(err);
      } else {
        resolve(s);
      }
    });

    gitRawCommits(merged.gitRawCommitsOpts).pipe(ws);
  });

  const out = chunks
    .map(b => syncParser(b.toString(), merged.parserOpts))
    .filter(d => d.type)
    .map(data => {
      try {
        const tagList = getTagList(data.hash);
        const list = tagList.filter(s => s.startsWith(`${pk.pkg.name}@`));
        // log(data.hash, 'list: ', list.length, list);
        data.isTagged = list.length > 0;
        // data.tagList = list;
        data.earliestTag = list.length >= 1 ? list[0] : undefined;
        delete data.mentions;
        // delete data.notes;
        delete data.references;
        delete data.revert;
        return data;
      } catch (e) {
        // do nothing
        return data;
      }
    });

  if (options.type === 'released') {
    const tagged = out.filter(d => d.isTagged);
    return tagged.concat(existingChangelog || []);
  } else if (options.type === 'unreleased') {
    return out.filter(d => !d.isTagged);
  } else {
    return out.concat(existingChangelog || []);
  }
};
