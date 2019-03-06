import { exec } from 'child_process';
export const execPromise = (cmd, opts): Promise<string> => {
  let s: [string];
  let x: string[];

  return new Promise((resolve, reject) => {
    const child = exec(cmd, opts);
    let out: Buffer = undefined;
    child.stdout.on('data', chunk => {
      const b = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
      out = out ? Buffer.concat([out, b]) : b;
    });
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    child.on('error', reject);
    child.on('exit', () => resolve(out ? out.toString('utf8') : undefined));
  });
};
