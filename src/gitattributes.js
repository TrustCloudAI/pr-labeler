/**
 * Minimal .gitattributes support: find which paths are marked as generated
 * via the `linguist-generated` attribute, following git's pattern rules.
 */

const GENERATED_ATTRIBUTE = 'linguist-generated';

const escapeRegExp = (char) => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Convert a gitattributes pattern into a RegExp matched against a repo-relative path.
 * Patterns without a slash match the basename at any depth; patterns with a slash
 * are anchored to the repository root.
 * @param {string} pattern
 * @returns {RegExp}
 */
const globToRegExp = (pattern) => {
  const anchored = pattern.includes('/');
  const glob = pattern.startsWith('/') ? pattern.slice(1) : pattern;
  let source = '';
  let i = 0;

  while (i < glob.length) {
    const char = glob[i];
    const atSegmentStart = i === 0 || glob[i - 1] === '/';

    if (char === '*' && glob[i + 1] === '*' && atSegmentStart
      && (i + 2 === glob.length || glob[i + 2] === '/')) {
      if (i + 2 === glob.length) {
        // Trailing "/**" matches everything inside.
        source += '.*';
        i += 2;
      } else {
        // Leading "**/" or middle "/**/" matches zero or more directories.
        source += '(?:.*/)?';
        i += 3;
      }
    } else if (char === '*') {
      source += '[^/]*';
      while (glob[i] === '*') i += 1;
    } else if (char === '?') {
      source += '[^/]';
      i += 1;
    } else if (char === '[' && glob.indexOf(']', i + 2) !== -1) {
      const end = glob.indexOf(']', i + 2);
      let body = glob.slice(i + 1, end);
      if (body.startsWith('!')) body = `^${body.slice(1)}`;
      source += `[${body.replace(/\\/g, '\\\\')}]`;
      i = end + 1;
    } else if (char === '\\' && i + 1 < glob.length) {
      source += escapeRegExp(glob[i + 1]);
      i += 2;
    } else {
      source += escapeRegExp(char);
      i += 1;
    }
  }

  return new RegExp(`^${anchored ? '' : '(?:.*/)?'}${source}$`);
};

const parseLine = (line) => {
  const quoted = line.match(/^"((?:[^"\\]|\\.)*)"\s*(.*)$/);
  if (quoted) {
    return { pattern: quoted[1].replace(/\\(.)/g, '$1'), attributes: quoted[2].split(/\s+/) };
  }
  const [pattern, ...attributes] = line.split(/\s+/);
  return { pattern, attributes };
};

const generatedValue = (attribute) => {
  if (attribute === GENERATED_ATTRIBUTE || attribute === `${GENERATED_ATTRIBUTE}=true`) {
    return true;
  }
  if (
    attribute === `-${GENERATED_ATTRIBUTE}`
    || attribute === `!${GENERATED_ATTRIBUTE}`
    || attribute.startsWith(`${GENERATED_ATTRIBUTE}=`)
  ) {
    return false;
  }
  return undefined;
};

/**
 * Parse .gitattributes content into ordered rules that set or unset linguist-generated.
 * @param {string} content
 * @returns {{pattern: string, regExp: RegExp, generated: boolean}[]}
 */
const parseGeneratedRules = (content) => (content || '')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#') && !line.startsWith('[attr]'))
  .reduce((rules, line) => {
    const { pattern, attributes } = parseLine(line);
    const generated = attributes.map(generatedValue).filter((value) => value !== undefined).pop();
    if (!pattern || generated === undefined) return rules;
    try {
      rules.push({ pattern, regExp: globToRegExp(pattern), generated });
    } catch (error) {
      // Skip patterns that are not valid globs (e.g. "[z-a]"), as git does.
    }
    return rules;
  }, []);

/**
 * Whether a path is generated. Later rules override earlier ones, as in git.
 * @param {{regExp: RegExp, generated: boolean}[]} rules
 * @param {string} path
 */
const isGenerated = (rules, path) => rules.reduce(
  (generated, rule) => (rule.regExp.test(path) ? rule.generated : generated),
  false,
);

module.exports = { globToRegExp, parseGeneratedRules, isGenerated };
