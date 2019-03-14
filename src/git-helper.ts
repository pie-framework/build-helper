export const parseGitStatus = (
  shortResult: string
): { status: string; path: string }[] => {
  const lines = shortResult.split('\n');

  return lines
    .map(l => {
      const regex = /(.*?)\s+(.*)$/;

      const arr = l.trim().match(regex);
      console.log('arr:', arr);

      if (Array.isArray(arr) && arr.length === 3) {
        return { status: arr[1], path: arr[2] };
      }
    })
    .filter(o => !!o)
    .map(o => {
      o.status = o.status === '??' ? 'UNSTAGED' : o.status;
      return o;
    })
    .filter(({ status, path }) => status !== '');
};
