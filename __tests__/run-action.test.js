jest.mock('../src/github/create-label-if-not-exists', () => jest.fn());
jest.mock('../src/github/add-label', () => jest.fn());
jest.mock('../src/github/remove-label', () => jest.fn());
jest.mock('../src/github/is-added-label', () => jest.fn().mockResolvedValue(false));

const addLabel = require('../src/github/add-label');
const runAction = require('../src/run-action');

const encode = (text) => Buffer.from(text).toString('base64');

const makeTools = ({ files, gitattributes, excludeFiles = '^$' }) => ({
  inputs: {
    xs_max_size: '10',
    s_max_size: '100',
    m_max_size: '500',
    l_max_size: '1000',
    exclude_files: excludeFiles,
  },
  github: {
    pulls: { listFiles: jest.fn().mockResolvedValue({ data: files }) },
    repos: {
      getContent: gitattributes === undefined
        ? jest.fn().mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }))
        : jest.fn().mockResolvedValue({
          data: { type: 'file', encoding: 'base64', content: encode(gitattributes) },
        }),
    },
  },
  context: {
    repo: { owner: 'acme', repo: 'widgets' },
    issue: { number: 7 },
    payload: { pull_request: { head: { sha: 'abc123' } } },
  },
  log: { info: jest.fn() },
});

const file = (filename, changes) => ({ filename, changes });

describe('run-action', () => {
  beforeEach(() => addLabel.mockClear());

  it('excludes files marked linguist-generated in .gitattributes', async () => {
    const tools = makeTools({
      files: [file('src/index.js', 5), file('dist/bundle.js', 900), file('api.pb.go', 300)],
      gitattributes: 'dist/** linguist-generated\n*.pb.go linguist-generated=true\n',
    });

    await runAction(tools);

    expect(addLabel).toHaveBeenCalledWith(tools, 'size_xs');
    expect(tools.log.info).toHaveBeenCalledWith(
      'Excluding generated file from the counting dist/bundle.js',
    );
  });

  it('counts every file when .gitattributes is missing', async () => {
    const tools = makeTools({
      files: [file('src/index.js', 5), file('dist/bundle.js', 900)],
    });

    await runAction(tools);

    expect(addLabel).toHaveBeenCalledWith(tools, 'size_l');
  });

  it('still applies the exclude_files input', async () => {
    const tools = makeTools({
      files: [file('src/index.js', 5), file('package-lock.json', 900), file('gen/a.ts', 200)],
      gitattributes: 'gen/** linguist-generated\n',
      excludeFiles: 'lock\\.json$',
    });

    await runAction(tools);

    expect(addLabel).toHaveBeenCalledWith(tools, 'size_xs');
  });
});
