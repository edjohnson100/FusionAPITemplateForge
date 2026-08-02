import os

from . import configUtils

# Add-in-wide runtime settings (as opposed to config.py's static constants, or
# the tracked commandConfig/presets/ named configs), e.g. palette window
# geometry and the active theme. Lives at the repo root, alongside config.py.
# Generic filename (not add-in-name-prefixed) -- matches the rest of the fleet.
APP_CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'config.json')


def load() -> dict:
    data = configUtils.readJsonConfig(APP_CONFIG_PATH)
    return data if data else {}


def save(data: dict):
    configUtils.dumpJsonConfig(APP_CONFIG_PATH, data)


def update(patch: dict) -> dict:
    """Read-modify-write a shallow merge into the add-in-wide config file."""
    data = load()
    data.update(patch)
    save(data)
    return data


# Every theme the user has ever imported (Theme Designer Pro .theme.json or a
# style.css bundle), keyed by theme id, so switching back to a
# previously-imported-but-not-currently-active theme still works after an
# add-in restart -- kept separate from config.json (which only remembers the
# single currently-active theme) since this can grow to hold many entries.
IMPORTED_THEMES_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'imported_themes.json')


def load_imported_themes() -> dict:
    data = configUtils.readJsonConfig(IMPORTED_THEMES_PATH)
    return data if data else {}


def save_imported_theme(theme_id: str, theme_vars: dict):
    themes = load_imported_themes()
    themes[theme_id] = theme_vars
    configUtils.dumpJsonConfig(IMPORTED_THEMES_PATH, themes)


def delete_imported_theme(theme_id: str):
    themes = load_imported_themes()
    if theme_id in themes:
        del themes[theme_id]
        configUtils.dumpJsonConfig(IMPORTED_THEMES_PATH, themes)


def reset_imported_themes():
    configUtils.dumpJsonConfig(IMPORTED_THEMES_PATH, {})
