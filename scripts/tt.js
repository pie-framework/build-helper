const { execPromise } = require('../lib/exec.js');

execPromise('echo hi there')
  .then(r => {
    console.log('result: ', r);
  })
  .catch(e => {
    console.error(e);
  });
