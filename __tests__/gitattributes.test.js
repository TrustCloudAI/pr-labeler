const {
  globToRegExp,
  parseGeneratedRules,
  isGenerated,
} = require('../src/gitattributes');

describe('globToRegExp', () => {
  const matches = (pattern, path) => globToRegExp(pattern).test(path);

  it('matches a slash-less pattern against the basename at any depth', () => {
    expect(matches('*.pb.go', 'api.pb.go')).toBe(true);
    expect(matches('*.pb.go', 'proto/v1/api.pb.go')).toBe(true);
    expect(matches('package-lock.json', 'web/package-lock.json')).toBe(true);
    expect(matches('*.pb.go', 'api.go')).toBe(false);
  });

  it('anchors patterns containing a slash to the repo root', () => {
    expect(matches('gen/*.ts', 'gen/client.ts')).toBe(true);
    expect(matches('gen/*.ts', 'src/gen/client.ts')).toBe(false);
    expect(matches('/schema.graphql', 'schema.graphql')).toBe(true);
    expect(matches('/schema.graphql', 'api/schema.graphql')).toBe(false);
  });

  it('does not let * or ? cross a directory boundary', () => {
    expect(matches('gen/*.ts', 'gen/nested/client.ts')).toBe(false);
    expect(matches('a?c', 'a/c')).toBe(false);
    expect(matches('a?c', 'abc')).toBe(true);
  });

  it('supports leading, trailing and middle **', () => {
    expect(matches('**/dist/*.js', 'dist/a.js')).toBe(true);
    expect(matches('**/dist/*.js', 'pkg/x/dist/a.js')).toBe(true);
    expect(matches('generated/**', 'generated/a/b/c.ts')).toBe(true);
    expect(matches('generated/**', 'src/generated/a.ts')).toBe(false);
    expect(matches('src/**/gen.ts', 'src/gen.ts')).toBe(true);
    expect(matches('src/**/gen.ts', 'src/a/b/gen.ts')).toBe(true);
  });

  it('supports character classes, including negation', () => {
    expect(matches('file[0-9].txt', 'file3.txt')).toBe(true);
    expect(matches('file[0-9].txt', 'fileA.txt')).toBe(false);
    expect(matches('file[!0-9].txt', 'fileA.txt')).toBe(true);
  });

  it('treats regex metacharacters and escaped glob characters literally', () => {
    expect(matches('a+b(c).js', 'a+b(c).js')).toBe(true);
    expect(matches('a.js', 'abjs')).toBe(false);
    expect(matches('\\*.js', '*.js')).toBe(true);
    expect(matches('\\*.js', 'a.js')).toBe(false);
  });

  it('does not match files inside a directory named by the pattern', () => {
    expect(matches('vendor', 'vendor/lib.js')).toBe(false);
  });
});

describe('parseGeneratedRules', () => {
  it('reads set, true, false, unset and unspecified linguist-generated values', () => {
    const rules = parseGeneratedRules(
      [
        '*.pb.go linguist-generated',
        'dist/** linguist-generated=true',
        'dist/keep.js linguist-generated=false',
        'api/*.ts -linguist-generated',
        'other.ts !linguist-generated',
      ].join('\n'),
    );
    expect(rules.map(({ pattern, generated }) => [pattern, generated])).toEqual([
      ['*.pb.go', true],
      ['dist/**', true],
      ['dist/keep.js', false],
      ['api/*.ts', false],
      ['other.ts', false],
    ]);
  });

  it('ignores comments, blank lines, macros and unrelated attributes', () => {
    const rules = parseGeneratedRules(
      [
        '# generated code',
        '',
        '   ',
        '[attr]gen linguist-generated',
        '*.sh text eol=lf',
        '*.png binary',
        '*.min.js -diff linguist-generated',
      ].join('\r\n'),
    );
    expect(rules.map((rule) => rule.pattern)).toEqual(['*.min.js']);
  });

  it('accepts a quoted pattern', () => {
    const rules = parseGeneratedRules('"gen files/*.ts" linguist-generated');
    expect(rules[0].pattern).toBe('gen files/*.ts');
  });

  it('skips patterns that cannot be compiled instead of throwing', () => {
    const rules = parseGeneratedRules('file[z-a].ts linguist-generated\n*.pb.go linguist-generated');
    expect(rules.map((rule) => rule.pattern)).toEqual(['*.pb.go']);
  });

  it('returns no rules for empty input', () => {
    expect(parseGeneratedRules('')).toEqual([]);
    expect(parseGeneratedRules(undefined)).toEqual([]);
  });
});

describe('isGenerated', () => {
  const rules = parseGeneratedRules(
    [
      'dist/** linguist-generated',
      'dist/keep.js -linguist-generated',
      '*.snap linguist-generated',
    ].join('\n'),
  );

  it('returns true for paths matched by a generated rule', () => {
    expect(isGenerated(rules, 'dist/bundle.js')).toBe(true);
    expect(isGenerated(rules, 'src/__snapshots__/a.test.js.snap')).toBe(true);
  });

  it('lets a later rule un-mark a path', () => {
    expect(isGenerated(rules, 'dist/keep.js')).toBe(false);
  });

  it('returns false for unmatched paths and when there are no rules', () => {
    expect(isGenerated(rules, 'src/index.js')).toBe(false);
    expect(isGenerated([], 'dist/bundle.js')).toBe(false);
  });
});
