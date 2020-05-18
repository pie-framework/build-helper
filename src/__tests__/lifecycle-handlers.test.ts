import { parseKey } from '../lifecycle-handlers';

describe('parseKey', () => {
  const prefixes = ['FOO', 'BAR'];
  it.each`
    msg                      | expected
    ${'FOO-1 '}              | ${['FOO-1']}
    ${'fix: a b c FOO-1 '}   | ${['FOO-1']}
    ${'fix: a b c [FOO-1] '} | ${['FOO-1']}
    ${' FOO-1 '}             | ${['FOO-1']}
    ${'BAR-1 FOO-1 '}        | ${['BAR-1', 'FOO-1']}
    ${'FOO-1 FOO-2 BAR-9'}   | ${['BAR-9', 'FOO-1', 'FOO-2']}
    ${'FOO-1 FOO-2BAR-9'}    | ${['FOO-1']}
  `('$msg => $expected', ({ msg, expected }) => {
    const keys = parseKey(prefixes, msg);
    expect(keys).toEqual(expected);
  });
});
