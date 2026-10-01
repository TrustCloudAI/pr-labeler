const path = require('path');

const COMMENT_PATTERNS = {
  slashBlock: { line: '//', blockStart: '/*', blockEnd: '*/' },
  hash: { line: '#', blockStart: null, blockEnd: null },
  html: { line: null, blockStart: '<!--', blockEnd: '-->' },
  cssBlock: { line: null, blockStart: '/*', blockEnd: '*/' },
};

const EXTENSION_MAP = {
  '.js': COMMENT_PATTERNS.slashBlock,
  '.jsx': COMMENT_PATTERNS.slashBlock,
  '.ts': COMMENT_PATTERNS.slashBlock,
  '.tsx': COMMENT_PATTERNS.slashBlock,
  '.java': COMMENT_PATTERNS.slashBlock,
  '.go': COMMENT_PATTERNS.slashBlock,
  '.c': COMMENT_PATTERNS.slashBlock,
  '.cpp': COMMENT_PATTERNS.slashBlock,
  '.h': COMMENT_PATTERNS.slashBlock,
  '.cs': COMMENT_PATTERNS.slashBlock,
  '.swift': COMMENT_PATTERNS.slashBlock,
  '.kt': COMMENT_PATTERNS.slashBlock,
  '.scala': COMMENT_PATTERNS.slashBlock,
  '.rs': COMMENT_PATTERNS.slashBlock,
  '.py': COMMENT_PATTERNS.hash,
  '.sh': COMMENT_PATTERNS.hash,
  '.bash': COMMENT_PATTERNS.hash,
  '.yml': COMMENT_PATTERNS.hash,
  '.yaml': COMMENT_PATTERNS.hash,
  '.rb': COMMENT_PATTERNS.hash,
  '.pl': COMMENT_PATTERNS.hash,
  '.html': COMMENT_PATTERNS.html,
  '.xml': COMMENT_PATTERNS.html,
  '.svg': COMMENT_PATTERNS.html,
  '.vue': COMMENT_PATTERNS.html,
  '.css': COMMENT_PATTERNS.cssBlock,
  '.scss': COMMENT_PATTERNS.cssBlock,
  '.less': COMMENT_PATTERNS.cssBlock,
};

const getCommentPatterns = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return EXTENSION_MAP[ext] || null;
};

const isCommentLine = (content, patterns, insideBlockComment) => {
  const trimmed = content.trimStart();

  if (insideBlockComment) {
    return true;
  }

  if (patterns.line && trimmed.startsWith(patterns.line)) {
    return true;
  }

  if (patterns.blockStart && trimmed.startsWith(patterns.blockStart)) {
    return true;
  }

  return false;
};

const updateBlockCommentState = (content, patterns, insideBlockComment) => {
  if (!patterns.blockStart) {
    return insideBlockComment;
  }

  const trimmed = content.trimStart();

  if (insideBlockComment) {
    if (trimmed.includes(patterns.blockEnd)) {
      return false;
    }
    return true;
  }

  if (trimmed.includes(patterns.blockStart)) {
    if (trimmed.includes(patterns.blockEnd, trimmed.indexOf(patterns.blockStart) + patterns.blockStart.length)) {
      return false;
    }
    return true;
  }

  return false;
};

const countNonCommentChanges = (patch, filename) => {
  if (!patch) {
    return 0;
  }

  const patterns = getCommentPatterns(filename);
  const lines = patch.split('\n');
  let count = 0;
  let insideBlockComment = false;

  for (const line of lines) {
    if (line.startsWith('@@') || line.startsWith('diff ') || line.startsWith('---') ||
        line.startsWith('+++') || line.startsWith('\\ No newline')) {
      continue;
    }

    const isChange = line.startsWith('+') || line.startsWith('-');
    const content = line.substring(1);

    if (!patterns) {
      if (isChange) {
        count += 1;
      }
      continue;
    }

    const prevState = insideBlockComment;
    insideBlockComment = updateBlockCommentState(content, patterns, insideBlockComment);

    if (isChange) {
      if (!isCommentLine(content, patterns, prevState)) {
        count += 1;
      }
    }
  }

  return count;
};

module.exports = {
  getCommentPatterns,
  countNonCommentChanges,
};
