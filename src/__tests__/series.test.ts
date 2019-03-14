import { series } from '../series';
describe('series', () => {
  const p = (s: string, wait: number = 0) =>
    new Promise(resolve => {
      setTimeout(() => resolve(s), wait);
    });
  it('works', async () => {
    const result = await series([
      () => p('one', 10),
      () => p('two', 200),
      () => p('three', 10)
    ]);
    expect(result).toEqual(['one', 'two', 'three']);
  });
});
