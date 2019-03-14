import * as _ from 'lodash';

type PromiseFn<T> = () => Promise<T>;

export const series = <T>(functions: PromiseFn<T>[]): Promise<T[]> => {
  return functions.reduce((acc: Promise<T[]>, fn: PromiseFn<T>) => {
    return acc
      .then(result => {
        return fn().then(t => [...result, t]);
      })
      .catch(e => {
        console.log('error in series occured:', e.message);
        throw e;
      });
  }, Promise.resolve([]));
};
