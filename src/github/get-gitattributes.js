/**
 * Get the content of the root .gitattributes at the pull request head commit
 * @param {import('actions-toolkit').Toolkit} tools
 * @returns {Promise<string>} the file content, or an empty string if unavailable
 */
module.exports = async (tools) => {
  try {
    const { data } = await tools.github.repos.getContent({
      ...tools.context.repo,
      path: '.gitattributes',
      ref: tools.context.payload.pull_request.head.sha,
    });
    if (!data || data.type !== 'file' || typeof data.content !== 'string') {
      return '';
    }
    return Buffer.from(data.content, data.encoding || 'base64').toString('utf8');
  } catch (error) {
    if (error.status !== 404) {
      tools.log.info(`Error happens when we was reading the .gitattributes file: ${error}`);
    }
    return '';
  }
};
