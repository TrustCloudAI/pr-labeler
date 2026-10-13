<br />
<p align="center">
  <a href="https://www.coverwallet.com/">
    <img src="images/logo.png" alt="Logo" width="400" height="100">
  </a>

  <h3 align="center">pr-labeler</h3>

  <p align="center">
    Add label to the pull request depending on the number of changes and the files excluded from the counting
  </p>
</p>

## Table of Contents

* [Usage](#usage)
* [Inputs](#inputs)
* [Assumptions](#assumptions)
* [License](#license)

## Usage

You can create a `.github/workflows/pr-labeler.yml` file:

```yaml
name: pr-labeler

on: [pull_request]

jobs:
  pr-labeler:
    runs-on: ubuntu-latest
    name: Label the PR size
    steps:
      - uses: coverwallet/pr-labeler@v1.2.1
        with:
          xs_max_size: '10'
          s_max_size: '100'
          m_max_size: '500'
          l_max_size: '1000'
          exclude_files: '.txt'
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

```

## Inputs


| Name | Description | Required |
|------|-------------|----------|
| xs_max_size | The maximum number of lines changed for the label named xs | true |
| s_max_size | The maximum number of lines changed for the label named s | true |
| m_max_size | The maximum number of lines changed for the label named m | true |
| l_max_size | The maximum number of lines changed for the label named l | true |
| exclude_files | The regular expression of the type of file or files that we want to exclude from the counting of changes | true |

## Assumptions

- PR size labeler consider as a change any kind of line addition, deletion, or modification
- A PR will be labeled as `xl` if it exceeds the amount of changes defined as `l_max_size`
- Files marked as generated in the root `.gitattributes` of the PR's base branch (`linguist-generated` or `linguist-generated=true`) are excluded from the counting, in addition to `exclude_files`. Changes a PR makes to `.gitattributes` take effect for later PRs once merged. For example:

  ```gitattributes
  package-lock.json linguist-generated
  src/generated/** linguist-generated
  ```

## License

[MIT](LICENSE)
