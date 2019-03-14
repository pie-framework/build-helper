import { parseGitStatus } from '../git-helper';

describe('git-helper', () => {
  it('parses a short status', () => {
    const s = `
    M  foo-oh.txt
    M foo.txt
    ??  not-added.txt
    ?? not-added.txt`;

    const result = parseGitStatus(s);
    expect(result).toEqual([
      {
        status: 'M',
        path: 'foo-oh.txt'
      },
      {
        status: 'M',
        path: 'foo.txt'
      },
      {
        status: 'UNSTAGED',
        path: 'not-added.txt'
      },
      {
        status: 'UNSTAGED',
        path: 'not-added.txt'
      }
    ]);
  });
});
