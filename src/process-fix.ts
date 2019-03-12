export const processFix = (log: (...any) => any, onSigInt: () => void) => {
  process.on('unhandledRejection', (reason: any) => {
    log(reason.message);
  });

  if (process.platform === 'win32') {
    var rl = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.on('SIGINT', () => process.emit('disconnect'));
  }

  process.on('SIGINT', onSigInt);

  process.on('exit', () => {
    log('done.');
  });
};
