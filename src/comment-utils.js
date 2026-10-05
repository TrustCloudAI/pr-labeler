const path = require('path');

// Each language describes its comment and string syntax. Strings are tracked so that
// comment markers inside them (e.g. "src/**/*.js" or "a#b") are not mistaken for comments.
//  - lineComments: markers that comment out the rest of the line
//  - blockComments: { start, end, leadingOnly } — leadingOnly means the marker only opens a
//    comment when nothing but whitespace precedes it on the line (used for Python docstrings)
//  - strings: { delim, multiline } — multiline strings may span lines (``, """, ''')
//  - heredoc: regex matching a heredoc opener; the `id` group is the terminating identifier
const C_STYLE = {
  lineComments: ['//'],
  blockComments: [{ start: '/*', end: '*/' }],
  strings: [{ delim: '"' }, { delim: "'" }],
};

// Also used for Go, whose raw strings are backtick-delimited like JS template literals.
const JS_STYLE = {
  ...C_STYLE,
  strings: [...C_STYLE.strings, { delim: '`', multiline: true }],
};

// Rust uses ' for lifetimes ('a), so only " is treated as a string delimiter.
const RUST_STYLE = {
  ...C_STYLE,
  strings: [{ delim: '"' }],
};

const PYTHON_STYLE = {
  lineComments: ['#'],
  // A triple-quoted string that starts a statement is a docstring / block comment.
  blockComments: [
    { start: '"""', end: '"""', leadingOnly: true },
    { start: "'''", end: "'''", leadingOnly: true },
  ],
  strings: [
    { delim: '"""', multiline: true },
    { delim: "'''", multiline: true },
    { delim: '"' },
    { delim: "'" },
  ],
};

const HASH_STYLE = {
  lineComments: ['#'],
  blockComments: [],
  strings: [{ delim: '"' }, { delim: "'" }],
};

const SHELL_STYLE = {
  ...HASH_STYLE,
  heredoc: /^<<-?\s*(['"]?)(?<id>[A-Za-z_][A-Za-z0-9_]*)\1/,
};

const RUBY_STYLE = {
  ...HASH_STYLE,
  heredoc: /^<<[-~]?(['"]?)(?<id>[A-Za-z_][A-Za-z0-9_]*)\1/,
};

// Terraform / HCL: #, // and /* */ comments, "..." strings, and <<EOF / <<-EOF heredocs
// (commonly used for user_data scripts and JSON policies, whose contents are not comments).
const HCL_STYLE = {
  lineComments: ['#', '//'],
  blockComments: [{ start: '/*', end: '*/' }],
  strings: [{ delim: '"' }],
  heredoc: /^<<-?(?<id>[A-Za-z_][A-Za-z0-9_]*)/,
};

const HTML_STYLE = {
  lineComments: [],
  blockComments: [{ start: '<!--', end: '-->' }],
  // Text content routinely contains apostrophes, so strings are not tracked.
  strings: [],
};

const CSS_STYLE = {
  lineComments: [],
  blockComments: [{ start: '/*', end: '*/' }],
  strings: [{ delim: '"' }, { delim: "'" }],
};

const SCSS_STYLE = {
  ...CSS_STYLE,
  lineComments: ['//'],
};

const EXTENSION_MAP = {
  '.js': JS_STYLE,
  '.jsx': JS_STYLE,
  '.mjs': JS_STYLE,
  '.cjs': JS_STYLE,
  '.ts': JS_STYLE,
  '.tsx': JS_STYLE,
  '.java': C_STYLE,
  '.go': JS_STYLE,
  '.c': C_STYLE,
  '.cpp': C_STYLE,
  '.h': C_STYLE,
  '.cs': C_STYLE,
  '.swift': C_STYLE,
  '.kt': C_STYLE,
  '.scala': C_STYLE,
  '.rs': RUST_STYLE,
  '.py': PYTHON_STYLE,
  '.pyi': PYTHON_STYLE,
  '.sh': SHELL_STYLE,
  '.bash': SHELL_STYLE,
  '.yml': HASH_STYLE,
  '.yaml': HASH_STYLE,
  '.rb': RUBY_STYLE,
  '.pl': HASH_STYLE,
  '.tf': HCL_STYLE,
  '.tfvars': HCL_STYLE,
  '.hcl': HCL_STYLE,
  '.html': HTML_STYLE,
  '.xml': HTML_STYLE,
  '.svg': HTML_STYLE,
  '.vue': HTML_STYLE,
  '.css': CSS_STYLE,
  '.scss': SCSS_STYLE,
  '.less': SCSS_STYLE,
};

const getCommentPatterns = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return EXTENSION_MAP[ext] || null;
};

const isWhitespace = (char) => char === ' ' || char === '\t' || char === '\r';

// Returns the index just past the closing delimiter, or -1 if the string is not closed on
// this line. Backslash escapes are skipped.
const findStringEnd = (content, delim, from) => {
  let i = from;
  while (i < content.length) {
    if (content[i] === '\\') {
      i += 2;
    } else if (content.startsWith(delim, i)) {
      return i + delim.length;
    } else {
      i += 1;
    }
  }
  return -1;
};

// Scans a single line of source, starting in `state` (null, or an open block comment,
// multi-line string, or heredoc carried over from the previous line).
// Returns whether the line contains code, whether it contains comment text, and the
// state to carry into the next line.
const scanLine = (content, lang, startState) => {
  let state = startState;
  let hasCode = false;
  let hasComment = false;
  let pendingHeredoc = null;
  let i = 0;

  if (state && state.type === 'heredoc') {
    return {
      hasCode: true,
      hasComment: false,
      state: content.trim() === state.end ? null : state,
    };
  }

  while (i < content.length) {
    if (state && state.type === 'comment') {
      hasComment = true;
      const endIdx = content.indexOf(state.end, i);
      if (endIdx === -1) {
        return { hasCode, hasComment, state };
      }
      i = endIdx + state.end.length;
      state = null;
    } else if (state && state.type === 'string') {
      hasCode = true;
      const endIdx = findStringEnd(content, state.end, i);
      if (endIdx === -1) {
        return { hasCode, hasComment, state };
      }
      i = endIdx;
      state = null;
    } else if (isWhitespace(content[i])) {
      i += 1;
    } else if (lang.lineComments.some((marker) => content.startsWith(marker, i))) {
      hasComment = true;
      break;
    } else {
      const block = lang.blockComments.find(
        (b) => content.startsWith(b.start, i) && (!b.leadingOnly || !hasCode),
      );
      const heredocMatch = !block && lang.heredoc && lang.heredoc.exec(content.slice(i));
      const str = !block && !heredocMatch
        && lang.strings.find((s) => content.startsWith(s.delim, i));

      if (block) {
        hasComment = true;
        state = { type: 'comment', end: block.end };
        i += block.start.length;
      } else if (heredocMatch) {
        hasCode = true;
        pendingHeredoc = heredocMatch.groups.id;
        i += heredocMatch[0].length;
      } else if (str) {
        hasCode = true;
        const endIdx = findStringEnd(content, str.delim, i + str.delim.length);
        if (endIdx === -1) {
          if (str.multiline) {
            state = { type: 'string', end: str.delim };
          }
          i = content.length;
        } else {
          i = endIdx;
        }
      } else {
        hasCode = true;
        i += 1;
      }
    }
  }

  if (pendingHeredoc && !state) {
    state = { type: 'heredoc', end: pendingHeredoc };
  }

  return { hasCode, hasComment, state };
};

// A changed line is a comment line when it contains comment text but no code. Blank lines
// are only treated as comments when they fall inside a block comment.
const isCommentOnly = (result, startState) => !result.hasCode
  && (result.hasComment || (startState !== null && startState.type === 'comment'));

const countNonCommentChanges = (patch, filename) => {
  if (!patch) {
    return 0;
  }

  const lang = getCommentPatterns(filename);
  const lines = patch.split('\n');
  let count = 0;
  let inHunk = false;
  // Removed lines belong to the old file and added lines to the new one, so each side
  // tracks its own block comment / string state. Context lines advance both.
  let oldState = null;
  let newState = null;

  lines.forEach((line) => {
    if (line.startsWith('@@')) {
      // Hunks are not contiguous, so state from a previous hunk cannot be trusted.
      inHunk = true;
      oldState = null;
      newState = null;
      return;
    }
    // File headers (diff/---/+++) only appear before the first hunk; inside a hunk a line
    // like "---x" is a removed line whose content is "--x".
    if (!inHunk || line.startsWith('\\')) {
      return;
    }

    const marker = line[0];
    const content = line.substring(1);

    if (!lang) {
      if (marker === '+' || marker === '-') {
        count += 1;
      }
      return;
    }

    if (marker === '+') {
      const result = scanLine(content, lang, newState);
      if (!isCommentOnly(result, newState)) {
        count += 1;
      }
      newState = result.state;
    } else if (marker === '-') {
      const result = scanLine(content, lang, oldState);
      if (!isCommentOnly(result, oldState)) {
        count += 1;
      }
      oldState = result.state;
    } else {
      oldState = scanLine(content, lang, oldState).state;
      newState = scanLine(content, lang, newState).state;
    }
  });

  return count;
};

module.exports = {
  getCommentPatterns,
  countNonCommentChanges,
};
