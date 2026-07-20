# Migration Guide: NPM to PyPI (Pip)

This guide walks you through migrating your package publishing workflow from JavaScript/NPM over to Python/PyPI (`pip`).

---

## The NPM Workflow Reference

This is your current configuration layout and deployment sequence using Node.js.

### Project Configuration
Settings are managed entirely inside the `package.json` file:
* **Metadata:** Defined using keys like `"name": "ppussh"` and `"version": "0.2.0"`.
* **Entrypoint:** Pointed to your primary code file using `"main": "index.js"`.
* **Dependencies:** Declared inside the `"dependencies"` object block.
* **CLI Executables:** Linked via the `"bin"` mapping object.

### Project File Structure
```text
├── package.json
├── README.md
└── lib/
    ├── index.js
    └── auth.js
```

### CLI Commands
* **Login Check:** `npm whoami`
* **Version Bumping:** `npm version patch`
* **Compilation:** Managed automatically by npm during the publish process.
* **Registry Upload:** `npm publish`

---

## The PyPI (Pip) Workflow Target

This is how you must structure and publish your migrated package for Python users.

### Project Configuration
Settings are managed inside a modern `pyproject.toml` file in your root folder:
* **Metadata:** Defined using standard keys like `name = "ppussh"` and `version = "0.2.0"`.
* **Entrypoint:** Handled implicitly by directory imports or explicit build-backend hooks.
* **Dependencies:** Declared as a flat array list under `dependencies = [ "requests>=2.0.0" ]`.
* **CLI Executables:** Linked using a dedicated `[project.scripts]` array block.

### Project File Structure
```text
├── pyproject.toml
├── README.md
└── src/
    └── ppussh/
        ├── __init__.py
        ├── main.py
        └── auth.py
```

### CLI Commands
* **Login Check:** Verified instantly at upload time via your generated secure API token.
* **Version Bumping:** Manually increment the `version` string inside your `pyproject.toml` file.
* **Compilation:** Clear legacy files with `rm -rf build/ dist/` and package with `python3 -m build`.
* **Registry Upload:** Push your artifacts live using the tool command `python3 -m twine upload dist/*`.
