import { exec } from 'child_process';
export const execPromise = (
  cmd,
  opts,
  pipeStdout: boolean = true,
  pipeStderr: boolean = true
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const child = exec(cmd, opts);
    let out: Buffer = undefined;
    child.stdout.on('data', chunk => {
      const b = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
      if (pipeStdout) {
        process.stdout.write(chunk);
      }
      out = out ? Buffer.concat([out, b]) : b;
    });

    if (pipeStderr) {
      child.stderr.on('data', chunk => {
        process.stderr.write(chunk);
      });
    }
    child.on('error', reject);
    child.on('exit', () => resolve(out ? out.toString('utf8') : undefined));
  });
};
