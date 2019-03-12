import { execPromise } from '../exec';

describe('exec', () => {
  it('returns an error', () => {
    expect(execPromise('exit 1', {})).rejects.toBeTruthy();
  });
  it('returns  ok', () => {
    expect(execPromise('exit 0', {})).resolves.toBeUndefined();
  });
  it('returns  stdout', () => {
    expect(execPromise('echo hi', {}).then(r => r.trim())).resolves.toEqual(
      'hi'
    );
  });
});
