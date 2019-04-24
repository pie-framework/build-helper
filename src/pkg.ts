import { join } from 'path';
import { readdirSync, readJsonSync } from 'fs-extra';

export const getPackages = (root: string): PkgAndDir[] => {
  const pkgs = readdirSync(root).filter(n => !n.startsWith('.'));
  return pkgs.map(p => getPackage(join(root, p)));
};

export type PkgAndDir = { dir: string; pkg: any };

export const getPackage = (dir: string): PkgAndDir => ({
  dir,
  pkg: readJsonSync(join(dir, 'package.json'))
});
