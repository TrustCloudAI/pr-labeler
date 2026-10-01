const { getCommentPatterns, countNonCommentChanges } = require('../src/comment-utils');

describe('getCommentPatterns', () => {
  it('returns slash/block patterns for JS files', () => {
    const patterns = getCommentPatterns('src/index.js');
    expect(patterns.line).toBe('//');
    expect(patterns.blockStart).toBe('/*');
    expect(patterns.blockEnd).toBe('*/');
  });

  it('returns slash/block patterns for TS files', () => {
    expect(getCommentPatterns('foo.ts').line).toBe('//');
    expect(getCommentPatterns('foo.tsx').line).toBe('//');
  });

  it('returns hash patterns for Python files', () => {
    const patterns = getCommentPatterns('script.py');
    expect(patterns.line).toBe('#');
    expect(patterns.blockStart).toBeNull();
  });

  it('returns hash patterns for shell files', () => {
    expect(getCommentPatterns('deploy.sh').line).toBe('#');
  });

  it('returns HTML patterns for HTML files', () => {
    const patterns = getCommentPatterns('index.html');
    expect(patterns.line).toBeNull();
    expect(patterns.blockStart).toBe('<!--');
    expect(patterns.blockEnd).toBe('-->');
  });

  it('returns CSS patterns for CSS files', () => {
    const patterns = getCommentPatterns('style.css');
    expect(patterns.blockStart).toBe('/*');
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
    // Non-comment lines: init() {, console.log("init");, /* configure */ const x = 1; starts with block comment -> comment
    // Wait: "  /* configure */ const x = 1; // trailing" - starts with /*, so it's a comment line
    // Actually let me recount:
    // +function init() {  -> code (1)
    // +  // setup logging  -> comment
    // +  console.log("init");  -> code (2)
    // +  /* configure */ const x = 1; // trailing  -> starts with /* so comment
    // +}  -> code (3)
    // -// old comment  -> comment
    // -const old = true;  -> code (4)
    expect(countNonCommentChanges(patch, 'index.js')).toBe(4);
  });
});
