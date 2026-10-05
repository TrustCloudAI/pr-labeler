const { getCommentPatterns, countNonCommentChanges } = require('../src/comment-utils');

describe('getCommentPatterns', () => {
  it('returns slash/block patterns for JS files', () => {
    const patterns = getCommentPatterns('src/index.js');
    expect(patterns.lineComments).toEqual(['//']);
    expect(patterns.blockComments).toEqual([{ start: '/*', end: '*/' }]);
  });

  it('returns slash/block patterns for TS files', () => {
    expect(getCommentPatterns('foo.ts').lineComments).toEqual(['//']);
    expect(getCommentPatterns('foo.tsx').lineComments).toEqual(['//']);
  });

  it('returns hash patterns and docstring blocks for Python files', () => {
    const patterns = getCommentPatterns('script.py');
    expect(patterns.lineComments).toEqual(['#']);
    expect(patterns.blockComments.map((b) => b.start)).toEqual(['"""', "'''"]);
  });

  it('returns hash patterns for shell files', () => {
    expect(getCommentPatterns('deploy.sh').lineComments).toEqual(['#']);
  });

  it('returns HTML patterns for HTML files', () => {
    const patterns = getCommentPatterns('index.html');
    expect(patterns.lineComments).toEqual([]);
    expect(patterns.blockComments).toEqual([{ start: '<!--', end: '-->' }]);
  });

  it('returns CSS patterns for CSS files', () => {
    expect(getCommentPatterns('style.css').blockComments[0].start).toBe('/*');
  });

  it('returns HCL patterns for Terraform files', () => {
    ['main.tf', 'prod.tfvars', 'terragrunt.hcl'].forEach((file) => {
      const patterns = getCommentPatterns(file);
      expect(patterns.lineComments).toEqual(['#', '//']);
      expect(patterns.blockComments[0].start).toBe('/*');
    });
  });

  it('returns null for unknown extensions', () => {
    expect(getCommentPatterns('file.bin')).toBeNull();
    expect(getCommentPatterns('data.dat')).toBeNull();
  });
});

describe('countNonCommentChanges', () => {
  it('returns 0 for falsy patch', () => {
    expect(countNonCommentChanges(null, 'foo.js')).toBe(0);
    expect(countNonCommentChanges(undefined, 'foo.js')).toBe(0);
    expect(countNonCommentChanges('', 'foo.js')).toBe(0);
  });

  it('counts all added/removed lines in a basic patch with no comments', () => {
    const patch = [
      '@@ -1,3 +1,5 @@',
      ' const a = 1;',
      '+const b = 2;',
      '+const c = 3;',
      ' const d = 4;',
      '-const e = 5;',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'index.js')).toBe(3);
  });

  it('excludes single-line // comments', () => {
    const patch = [
      '@@ -1,3 +1,5 @@',
      ' const a = 1;',
      '+// this is a comment',
      '+const b = 2;',
      '+  // indented comment',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'index.js')).toBe(1);
  });

  it('excludes multi-line JSDoc block comments', () => {
    const patch = [
      '@@ -1,3 +1,10 @@',
      ' const foo = 1;',
      '+/**',
      '+ * This is a JSDoc comment',
      '+ * @param {string} bar',
      '+ */',
      '+function doStuff(bar) {',
      '+  return bar + foo;',
      '+}',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'index.js')).toBe(3);
  });

  it('excludes single-line block comments', () => {
    const patch = [
      '@@ -1,2 +1,3 @@',
      ' const a = 1;',
      '+/* single line block comment */',
      '+const b = 2;',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'index.js')).toBe(1);
  });

  it('counts code lines with trailing comments', () => {
    const patch = [
      '@@ -1,2 +1,3 @@',
      ' const a = 1;',
      '+const b = 2; // inline comment',
      '+const c = 3; /* another comment */',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'index.js')).toBe(2);
  });

  it('excludes # comments for Python files', () => {
    const patch = [
      '@@ -1,2 +1,4 @@',
      ' x = 1',
      '+# this is a comment',
      '+y = 2',
      '+  # indented comment',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'script.py')).toBe(1);
  });

  it('excludes HTML comments', () => {
    const patch = [
      '@@ -1,2 +1,5 @@',
      ' <div>',
      '+<!-- single line comment -->',
      '+<!-- multi',
      '+     line comment -->',
      '+<span>text</span>',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'index.html')).toBe(1);
  });

  it('counts all lines for unknown file types', () => {
    const patch = [
      '@@ -1,2 +1,4 @@',
      ' some data',
      '+// this looks like a comment but file type is unknown',
      '+more data',
      '-old data',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'file.bin')).toBe(3);
  });

  it('tracks block comment state across context lines', () => {
    const patch = [
      '@@ -1,5 +1,6 @@',
      ' /*',
      ' * existing block comment',
      '+ * added comment line inside block',
      ' */',
      ' const a = 1;',
      '+const b = 2;',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'index.js')).toBe(1);
  });

  it('handles deleted comment lines', () => {
    const patch = [
      '@@ -1,5 +1,3 @@',
      ' const a = 1;',
      '-// old comment',
      '-/* block comment */',
      ' const b = 2;',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'index.js')).toBe(0);
  });

  it('ignores "No newline at end of file" markers', () => {
    const patch = [
      '@@ -1,2 +1,3 @@',
      ' const a = 1;',
      '+const b = 2;',
      '\\ No newline at end of file',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'index.js')).toBe(1);
  });

  it('handles mixed comments and code in a complex patch', () => {
    const patch = [
      '@@ -1,5 +1,15 @@',
      ' const config = {};',
      '+/**',
      '+ * Initialize the application',
      '+ * @returns {void}',
      '+ */',
      '+function init() {',
      '+  // setup logging',
      '+  console.log("init");',
      '+  /* configure */ const x = 1; // trailing',
      '+}',
      '-// old comment',
      '-const old = true;',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'index.js')).toBe(5);
  });
});

describe('countNonCommentChanges block comment edge cases', () => {
  it('counts code that follows a block comment on the same line', () => {
    const patch = [
      '@@ -1,1 +1,3 @@',
      '+/* configure */ const x = 1;',
      '+/* a */ /* b */',
      '+const y = 2; /* trailing',
      '+   still a comment */',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'index.js')).toBe(2);
  });

  it('tracks removed and added lines independently', () => {
    // Uncommenting a block: the removed "/*" must not swallow the added code line.
    const patch = [
      '@@ -1,3 +1,2 @@',
      '-/*',
      '+const w = 0;',
      ' const x = 1;',
      '-*/',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'index.js')).toBe(1);
  });

  it('keeps an open block comment on the added side across removed lines', () => {
    const patch = [
      '@@ -1,2 +1,3 @@',
      '+/*',
      '-const removed = 1;',
      '+ * new comment',
      '+ */',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'index.js')).toBe(1);
  });

  it('ignores comment markers inside strings', () => {
    const patch = [
      '@@ -1,1 +1,3 @@',
      '+const glob = "src/**/*.js";',
      "+const url = 'http://example.com';",
      '+const z = 3;',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'index.js')).toBe(3);
  });

  it('treats lines inside multi-line template literals as code', () => {
    const patch = [
      '@@ -1,1 +1,4 @@',
      '+const sql = `',
      '+  // not a comment',
      '+  SELECT 1',
      '+`;',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'index.js')).toBe(4);
  });

  it('counts blank added lines outside comments, but not inside block comments', () => {
    const patch = [
      '@@ -1,1 +1,5 @@',
      '+',
      '+/*',
      '+',
      '+*/',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'index.js')).toBe(1);
  });

  it('counts changed lines that look like file headers inside a hunk', () => {
    const patch = [
      '@@ -1,2 +1,2 @@',
      '---counter;',
      '+++counter;',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'index.js')).toBe(2);
  });

  it('skips file headers before the first hunk', () => {
    const patch = [
      'diff --git a/index.js b/index.js',
      '--- a/index.js',
      '+++ b/index.js',
      '@@ -1,1 +1,2 @@',
      '+const a = 1;',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'index.js')).toBe(1);
  });

  it('resets block comment state at each hunk', () => {
    const patch = [
      '@@ -1,1 +1,2 @@',
      '+/* unterminated in this hunk',
      '@@ -20,1 +21,2 @@',
      '+const a = 1;',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'index.js')).toBe(1);
  });
});

describe('countNonCommentChanges for Python', () => {
  it('excludes multi-line docstrings', () => {
    const patch = [
      '@@ -1,1 +1,7 @@',
      '+def greet(name):',
      '+    """',
      '+    Greet someone.',
      '+',
      '+    # not code, still docstring',
      '+    """',
      '+    return f"hi {name}"',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'app.py')).toBe(2);
  });

  it("excludes single-line and ''' docstrings", () => {
    const patch = [
      '@@ -1,1 +1,4 @@',
      '+    """Return the answer."""',
      "+    '''Another docstring.'''",
      "+    '''start",
      "+    end'''",
    ].join('\n');
    expect(countNonCommentChanges(patch, 'app.py')).toBe(0);
  });

  it('counts triple-quoted strings assigned to variables as code', () => {
    const patch = [
      '@@ -1,1 +1,5 @@',
      '+QUERY = """',
      '+    # this is SQL text, not a comment',
      '+    SELECT * FROM users',
      '+"""',
      '+print(QUERY)',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'app.py')).toBe(5);
  });

  it('does not treat # inside strings as a comment', () => {
    const patch = [
      '@@ -1,1 +1,4 @@',
      '+color = "#ff0000"',
      "+tag = '#release'",
      '+x = 1  # trailing comment',
      '+    # indented comment',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'app.py')).toBe(3);
  });

  it('handles escaped quotes inside strings', () => {
    const patch = [
      '@@ -1,1 +1,2 @@',
      '+msg = "say \\"hi\\" # not a comment"',
      '+# real comment',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'app.py')).toBe(1);
  });
});

describe('countNonCommentChanges for Terraform', () => {
  it('excludes #, // and /* */ comments', () => {
    const patch = [
      '@@ -1,1 +1,9 @@',
      '+# Primary bucket',
      '+// legacy-style comment',
      '+/*',
      '+  multi-line note',
      '+*/',
      '+resource "aws_s3_bucket" "main" {',
      '+  bucket = "my-bucket" # inline comment',
      '+  /* tags */ tags = {}',
      '+}',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'main.tf')).toBe(4);
  });

  it('does not treat # or // inside strings as comments', () => {
    const patch = [
      '@@ -1,1 +1,3 @@',
      '+  name        = "team#1"',
      '+  source      = "git::https://example.com/mod.git"',
      '+  description = "/* not a block */"',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'variables.tf')).toBe(3);
  });

  it('counts heredoc contents as code, including # lines', () => {
    const patch = [
      '@@ -1,1 +1,8 @@',
      '+  user_data = <<-EOF',
      '+    #!/bin/bash',
      '+    # install nginx',
      '+    yum install -y nginx',
      '+  EOF',
      '+  # back to a real comment',
      '+  policy = <<POLICY',
      '+POLICY',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'main.tf')).toBe(7);
  });

  it('handles .tfvars files', () => {
    const patch = [
      '@@ -1,1 +1,3 @@',
      '+# Production settings',
      '+region = "us-east-1"',
      '+instance_count = 3',
    ].join('\n');
    expect(countNonCommentChanges(patch, 'prod.tfvars')).toBe(2);
  });
});
