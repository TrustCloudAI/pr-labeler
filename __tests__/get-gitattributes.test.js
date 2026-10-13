const getGitattributes = require('../src/github/get-gitattributes');

const makeTools = (getContent) => ({
  github: { repos: { getContent } },
  context: {
    repo: { owner: 'acme', repo: 'widgets' },
    payload: { pull_request: { head: { sha: 'abc123' } } },
  },
  log: { info: jest.fn() },
});

describe('getGitattributes', () => {
  it('fetches .gitattributes at the PR head commit and decodes it', async () => {
    const getContent = jest.fn().mockResolvedValue({
      data: {
        type: 'file',
        encoding: 'base64',
        content: Buffer.from('*.pb.go linguist-generated\n').toString('base64'),
      },
    });
    const tools = makeTools(getContent);

    await expect(getGitattributes(tools)).resolves.toBe('*.pb.go linguist-generated\n');
    expect(getContent).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'widgets',
      path: '.gitattributes',
      ref: 'abc123',
    });
  });

  it('returns an empty string when the file does not exist', async () => {
    const error = Object.assign(new Error('Not Found'), { status: 404 });
    const tools = makeTools(jest.fn().mockRejectedValue(error));

    await expect(getGitattributes(tools)).resolves.toBe('');
  });

  it('returns an empty string and logs on any other error', async () => {
    const tools = makeTools(jest.fn().mockRejectedValue(new Error('boom')));

    await expect(getGitattributes(tools)).resolves.toBe('');
    expect(tools.log.info).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('returns an empty string when the path is not a file', async () => {
    const tools = makeTools(jest.fn().mockResolvedValue({ data: [] }));

    await expect(getGitattributes(tools)).resolves.toBe('');
  });
});
