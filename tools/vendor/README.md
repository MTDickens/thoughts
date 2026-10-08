# Vendored build dependencies

Pure-Python packages used only by `tools/build.py` (build time, not shipped in the Worker).
Vendored so the build needs no network. Licenses are in `licenses/`.

| Package | Version | Import | License | Source |
|---|---|---|---|---|
| markdown-it-py | 4.2.0 | `markdown_it` | MIT | https://pypi.org/project/markdown-it-py/4.2.0/ |
| mdit-py-plugins | 0.6.1 | `mdit_py_plugins` | MIT | https://pypi.org/project/mdit-py-plugins/0.6.1/ |
| mdurl | 0.1.2 | `mdurl` | MIT | https://pypi.org/project/mdurl/0.1.2/ |
| PyYAML | 6.0.3 | `yaml` (pure-Python part of `lib/yaml`, no libyaml) | MIT | https://pypi.org/project/PyYAML/6.0.3/ |

Update: download the new wheel/sdist, replace the package folder and its license file, run `python3 tools/build.py`.
