"""
Palette lifecycle, Python<->HTML bridge, config manager, and theme
persistence for the add-in's single palette command.

See CLAUDE.md for the conventions this file follows (grouped undo, config
manager, theme system, palette layout). Replace the Main tab's example field
and commands/generation.py's stub with your add-in's real feature -- keep the
surrounding shape (config manager, theme handling, grouped undo) as-is.
"""
import adsk.core
import adsk.fusion
import traceback
import os
import json

from .. import config
from ..lib import fusionAddInUtils as futil
from ..lib import appConfig
from ..lib import configUtils
from . import generation

app = adsk.core.Application.get()
ui = app.userInterface

WORKSPACE_ID = config.DEFAULT_WORKSPACE_ID
PANEL_ID = config.DEFAULT_PANEL_ID
COMMAND_BESIDE_ID = config.COMMAND_BESIDE_ID

RESOURCES_FOLDER = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'resources')
ICON_FOLDER = os.path.join(RESOURCES_FOLDER, '')
THEMES_FOLDER = os.path.join(RESOURCES_FOLDER, 'themes')

CONFIG_FOLDER_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'commandConfig')
UI_DEFAULTS_CONFIG_PATH = os.path.join(CONFIG_FOLDER_PATH, 'ui_defaults.json')

PALETTE_VERSION = 1
SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Local list of event handlers for the command button.
local_handlers = []
# Module-level list of palette handlers, kept alive for the lifetime of the add-in.
_handlers = []

# ------------------------------------------------------------------------------
# Main tab defaults / validation
# ------------------------------------------------------------------------------
# TODO: replace with your add-in's real fields.
DEFAULT_MAIN = {
    'exampleValue': 1.0,
}

DEFAULTS_BY_TAB = {
    'main': DEFAULT_MAIN,
}


def validate_main(form: dict) -> dict:
    """TODO: real validation. Must return {'valid', 'fieldErrors', 'computed'}."""
    fieldErrors = {}
    exampleValue = form.get('exampleValue')
    if not isinstance(exampleValue, (int, float)):
        fieldErrors['exampleValue'] = 'Must be a number'
    return {'valid': not fieldErrors, 'fieldErrors': fieldErrors, 'computed': {}}


VALIDATE_BY_TAB = {
    'main': validate_main,
}


def getErrorMessage():
    stackTrace = traceback.format_exc()
    return f'An unknown error occurred, please validate your inputs and try again:\n{stackTrace}'


# ------------------------------------------------------------------------------
# Palette geometry persistence (config.json, via lib/appConfig.py). Fusion's
# Palette has no move/resize event to hook live, so this is captured at the
# two points a palette actually goes away: the user closing it, and the
# add-in stopping.
# ------------------------------------------------------------------------------
PALETTE_GEOMETRY_KEY = 'paletteGeometry'
DEFAULT_PALETTE_WIDTH = 420
DEFAULT_PALETTE_HEIGHT = 600
DEFAULT_PALETTE_DOCKING_STATE = int(adsk.core.PaletteDockingStates.PaletteDockStateRight)


def _load_palette_geometry() -> dict:
    geometry = appConfig.load().get(PALETTE_GEOMETRY_KEY, {})
    return {
        'width': geometry.get('width', DEFAULT_PALETTE_WIDTH),
        'height': geometry.get('height', DEFAULT_PALETTE_HEIGHT),
        'left': geometry.get('left'),
        'top': geometry.get('top'),
        'dockingState': geometry.get('dockingState', DEFAULT_PALETTE_DOCKING_STATE),
    }


def _save_palette_geometry(palette: adsk.core.Palette):
    try:
        appConfig.update({PALETTE_GEOMETRY_KEY: {
            'width': palette.width,
            'height': palette.height,
            'left': palette.left,
            'top': palette.top,
            'dockingState': int(palette.dockingState),
        }})
    except Exception:
        futil.log(f'{config.CMD_NAME} failed to save palette geometry:\n{traceback.format_exc()}')


# ------------------------------------------------------------------------------
# Theme persistence (config.json for the active choice, imported_themes.json
# for every theme ever imported -- see lib/appConfig.py and CLAUDE.md).
# ------------------------------------------------------------------------------
THEME_CONFIG_KEY = 'theme'
# Mirrors the --font-family/--font-size-base defaults in style.css's :root
# block -- kept in sync manually since the CSS is the source of truth for
# what "unmodified" looks like, this is just the fallback for a user who has
# never touched the Themes tab's font controls.
DEFAULT_THEME = {
    'name': 'System',
    'fontFamily': '-apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
    'fontSize': 12,
}


def _load_theme() -> dict:
    theme = appConfig.load().get(THEME_CONFIG_KEY, {})
    return {
        'name': theme.get('name', DEFAULT_THEME['name']),
        'fontFamily': theme.get('fontFamily', DEFAULT_THEME['fontFamily']),
        'fontSize': theme.get('fontSize', DEFAULT_THEME['fontSize']),
    }


def _save_theme(form: dict):
    appConfig.update({THEME_CONFIG_KEY: {
        'name': form.get('name', DEFAULT_THEME['name']),
        'fontFamily': form.get('fontFamily', DEFAULT_THEME['fontFamily']),
        'fontSize': form.get('fontSize', DEFAULT_THEME['fontSize']),
    }})


# ------------------------------------------------------------------------------
# Add-in lifecycle
# ------------------------------------------------------------------------------
def start():
    futil.log(f'{config.CMD_NAME} Command Start Event')
    addinConfig = configUtils.readConfig(CONFIG_FOLDER_PATH)

    cmd_def = ui.commandDefinitions.addButtonDefinition(config.CMD_ID, config.CMD_NAME, config.CMD_DESCRIPTION, ICON_FOLDER)

    if os.path.exists(config.TOOLCLIP_FILENAME):
        cmd_def.toolClipFilename = config.TOOLCLIP_FILENAME

    futil.add_handler(cmd_def.commandCreated, command_created, local_handlers=local_handlers)

    workspace = ui.workspaces.itemById(WORKSPACE_ID)
    panel = workspace.toolbarPanels.itemById(PANEL_ID)
    control = panel.controls.addCommand(cmd_def, COMMAND_BESIDE_ID, False)
    control.isPromoted = addinConfig['UI'].getboolean('is_promoted')

    # Hidden command definition used solely as a grouped-undo runner -- see
    # _run_grouped() below for why this exists.
    undo_group_cmd_def = ui.commandDefinitions.addButtonDefinition(config.UNDO_GROUP_CMD_ID, f'{config.ADDIN_NAME} Undo Group Runner', '')
    futil.add_handler(undo_group_cmd_def.commandCreated, _undo_group_command_created, local_handlers=local_handlers)


def stop():
    futil.log(f'{config.CMD_NAME} Command Stop Event')
    workspace = ui.workspaces.itemById(WORKSPACE_ID)
    panel = workspace.toolbarPanels.itemById(PANEL_ID)
    command_control = panel.controls.itemById(config.CMD_ID)
    command_definition = ui.commandDefinitions.itemById(config.CMD_ID)

    addinConfig = configUtils.readConfig(CONFIG_FOLDER_PATH)
    addinConfig['UI']['is_promoted'] = 'yes' if command_control and command_control.isPromoted else 'no'
    configUtils.writeConfig(addinConfig, CONFIG_FOLDER_PATH)

    if command_control:
        command_control.deleteMe()
    if command_definition:
        command_definition.deleteMe()

    undo_group_cmd_def = ui.commandDefinitions.itemById(config.UNDO_GROUP_CMD_ID)
    if undo_group_cmd_def:
        undo_group_cmd_def.deleteMe()

    global _preview_occurrence_token
    _preview_occurrence_token = None

    palette = ui.palettes.itemById(config.PALETTE_ID)
    if palette:
        _save_palette_geometry(palette)
        palette.deleteMe()

    global _handlers
    _handlers = []


def command_created(args: adsk.core.CommandCreatedEventArgs):
    futil.log(f'{config.CMD_NAME} Command Created Event')
    # This command has no dialog inputs of its own, so Fusion auto-executes it
    # immediately after creation instead of showing an empty dialog.
    futil.add_handler(args.command.execute, lambda _: open_palette(), local_handlers=local_handlers)


# ------------------------------------------------------------------------------
# Grouped undo. Fusion has no Revit-style Design.startTransactionGroup() API
# for scripts/add-ins -- the documented way to collapse several API calls
# into a single Undo entry outside of a command dialog is to run them from a
# headless command's execute event handler (everything done there is
# automatically one undo transaction). See CLAUDE.md for more detail.
# ------------------------------------------------------------------------------
_pending_grouped_work = None


def _undo_group_command_created(args: adsk.core.CommandCreatedEventArgs):
    futil.add_handler(args.command.execute, lambda _: _run_pending_grouped_work(), local_handlers=local_handlers)


def _run_pending_grouped_work():
    global _pending_grouped_work
    work = _pending_grouped_work
    _pending_grouped_work = None
    if work:
        work()


def _run_grouped(work, name: str):
    """Runs `work` (a zero-argument callable) inside the undo-group runner
    command's execute event handler, so every Fusion API call it makes is
    bundled into a single entry on the undo stack. `name` becomes the label
    shown for this entry in the Undo dropdown.
    """
    global _pending_grouped_work
    _pending_grouped_work = work
    cmd_def = ui.commandDefinitions.itemById(config.UNDO_GROUP_CMD_ID)
    cmd_def.name = name
    cmd_def.execute()


# ------------------------------------------------------------------------------
# Palette open/close
# ------------------------------------------------------------------------------
def open_palette():
    palette = ui.palettes.itemById(config.PALETTE_ID)
    if palette:
        palette.isVisible = True
        return

    html_path = os.path.join(RESOURCES_FOLDER, config.PALETTE_HTML_FILENAME)
    url = 'file:///' + html_path.replace('\\', '/') + f'?v={PALETTE_VERSION}'

    geometry = _load_palette_geometry()

    palette = ui.palettes.add(
        config.PALETTE_ID, config.PALETTE_NAME, url,
        True,
        True,
        True,
        geometry['width'], geometry['height'],
    )
    palette.dockingState = geometry['dockingState']
    if geometry['left'] is not None and geometry['top'] is not None:
        palette.setPosition(geometry['left'], geometry['top'])

    on_html_event = PaletteHtmlEventHandler()
    palette.incomingFromHTML.add(on_html_event)
    _handlers.append(on_html_event)

    on_closed = PaletteCloseHandler()
    palette.closed.add(on_closed)
    _handlers.append(on_closed)


def _send(palette: adsk.core.Palette, action: str, payload: dict):
    palette.sendInfoToHTML(action, json.dumps(payload))


def _ensure_safe_to_mutate():
    activeCmd = ui.activeCommand
    if activeCmd and activeCmd != 'SelectCommand':
        return False, 'Please finish or cancel the active command before generating or previewing.'
    return True, ''


# ------------------------------------------------------------------------------
# Minimal preview tracking (single slot). GGPlus's previewState.py adds
# undo/redo-aware resync on top of this same idea -- add that if your add-in
# needs previews to stay accurate across arbitrary Undo/Redo sequences.
# ------------------------------------------------------------------------------
_preview_occurrence_token = None


def has_preview() -> bool:
    return _preview_occurrence_token is not None


def track_preview(occurrence):
    global _preview_occurrence_token
    _preview_occurrence_token = occurrence.entityToken


def clear_preview():
    global _preview_occurrence_token
    if _preview_occurrence_token is None:
        return
    design = adsk.fusion.Design.cast(app.activeProduct)
    if design is not None:
        entity = design.findEntityByToken(_preview_occurrence_token)
        if entity:
            for occurrence in entity:
                occurrence.deleteMe()
    _preview_occurrence_token = None


# ------------------------------------------------------------------------------
# Config manager (named presets, e.g. "Save As...")
# ------------------------------------------------------------------------------
PRESETS_DIR = os.path.join(CONFIG_FOLDER_PATH, 'presets')
INVALID_CONFIG_NAME_CHARS = '\\/:*?"<>|'


def _presets_dir(tab: str) -> str:
    path = os.path.join(PRESETS_DIR, tab)
    os.makedirs(path, exist_ok=True)
    return path


def _config_path(tab: str, name: str) -> str:
    return os.path.join(_presets_dir(tab), f'{name}.json')


def _sanitize_config_name(name: str) -> str:
    name = (name or '').strip()
    for ch in INVALID_CONFIG_NAME_CHARS:
        name = name.replace(ch, '_')
    if not name:
        raise ValueError('Config name cannot be empty')
    return name


def _list_configs(tab: str) -> list:
    directory = _presets_dir(tab)
    names = [
        os.path.splitext(f)[0]
        for f in os.listdir(directory)
        if f.lower().endswith('.json')
    ]
    return sorted(names, key=str.lower)


def _load_ui_defaults() -> dict:
    data = configUtils.readJsonConfig(UI_DEFAULTS_CONFIG_PATH)
    return data if data else {}


def _get_active_config_name(tab: str):
    data = _load_ui_defaults()
    return data.get(tab, {}).get('activeConfig')


def _set_active_config_name(tab: str, name):
    data = _load_ui_defaults()
    data.setdefault(tab, {})['activeConfig'] = name
    configUtils.dumpJsonConfig(UI_DEFAULTS_CONFIG_PATH, data)


def _get_tab_form(tab: str) -> dict:
    """The form shown when the palette opens: the active saved config if one
    is set (merged over the hardcoded defaults, so older configs missing
    newer fields still work), otherwise the hardcoded defaults."""
    active = _get_active_config_name(tab)
    form = dict(DEFAULTS_BY_TAB[tab])
    if active:
        saved = configUtils.readJsonConfig(_config_path(tab, active))
        if saved is not None:
            form.update(saved)
        else:
            _set_active_config_name(tab, None)
    return form


def _send_config_list(palette: adsk.core.Palette, tab: str):
    _send(palette, 'config_list', {
        'tab': tab,
        'configs': _list_configs(tab),
        'activeConfig': _get_active_config_name(tab),
    })


# ------------------------------------------------------------------------------
# Python <-> HTML bridge
# ------------------------------------------------------------------------------
class PaletteHtmlEventHandler(adsk.core.HTMLEventHandler):
    def notify(self, args):
        try:
            html_args = adsk.core.HTMLEventArgs.cast(args)
            data = json.loads(html_args.data)
            action = data.get('action')
            tab = data.get('tab')
            form = data.get('form')
            palette = ui.palettes.itemById(config.PALETTE_ID)
            if palette is None:
                return

            if action == 'get_defaults':
                for t in DEFAULTS_BY_TAB:
                    _send(palette, 'set_state', {
                        'tab': t,
                        'form': _get_tab_form(t),
                        'source': 'defaults',
                    })
                    _send_config_list(palette, t)
                _send(palette, 'set_state', {
                    'tab': 'theme',
                    'form': _load_theme(),
                    'importedThemes': appConfig.load_imported_themes(),
                    'source': 'defaults',
                })
                _send(palette, 'init_data', {'version': config.ADDIN_VERSION})

            elif action == 'update_theme':
                _save_theme(form)

            elif action == 'save_imported_theme':
                themeId = data.get('id')
                themeVars = data.get('vars')
                if themeId and isinstance(themeVars, dict):
                    appConfig.save_imported_theme(themeId, themeVars)

            elif action == 'remove_imported_theme':
                themeId = data.get('id')
                if themeId:
                    appConfig.delete_imported_theme(themeId)

            elif action == 'reset_imported_themes':
                appConfig.reset_imported_themes()

            elif action == 'export_theme':
                self._handle_export_theme(palette, data.get('file_type'), data.get('id'), data.get('vars'),
                                           data.get('fontFamily'), data.get('fontSize'), data.get('content'),
                                           data.get('default_name'))

            elif action == 'import_theme':
                self._handle_import_theme(palette, data.get('file_type'))

            elif action == 'validate':
                result = VALIDATE_BY_TAB[tab](form)
                _send(palette, 'validation_result', {
                    'tab': tab,
                    'valid': result['valid'],
                    'fieldErrors': result['fieldErrors'],
                    'computed': result['computed'],
                })

            elif action == 'update_preview':
                self._handle_update_preview(palette, tab, form)

            elif action == 'clear_preview':
                self._handle_clear_preview(palette, tab)

            elif action == 'generate':
                self._handle_generate(palette, tab, form)

            elif action == 'save_config_as':
                self._handle_save_as(palette, tab, form, data.get('name'))

            elif action == 'update_current_config':
                self._handle_update_current(palette, tab, form)

            elif action == 'load_config':
                self._handle_load_config(palette, tab, data.get('name'))

            elif action == 'delete_config':
                self._handle_delete_config(palette, tab, data.get('name'))

            elif action == 'factory_reset':
                _set_active_config_name(tab, None)
                _send(palette, 'set_state', {
                    'tab': tab,
                    'form': dict(DEFAULTS_BY_TAB[tab]),
                    'source': 'factory_reset',
                })
                _send_config_list(palette, tab)

        except Exception:
            app.log(f'{config.CMD_NAME} PaletteHtmlEventHandler failed:\n{traceback.format_exc()}')

    def _handle_export_theme(self, palette, file_type, themeId, themeVars, fontFamily, fontSize, content, default_name):
        try:
            dialog = ui.createFileDialog()
            dialog.title = 'Export Theme'
            if file_type == 'css':
                dialog.filter = 'CSS files (*.css)'
                dialog.initialFilename = default_name or 'style.css'
                fileContent = content or ''
            else:
                if not themeId or not isinstance(themeVars, dict):
                    return
                dialog.filter = 'Theme files (*.theme.json)'
                dialog.initialFilename = default_name or f'{themeId}.theme.json'
                fileContent = json.dumps({'id': themeId, 'vars': themeVars, 'fontFamily': fontFamily, 'fontSize': fontSize}, indent=2)
            dialog.initialDirectory = THEMES_FOLDER if os.path.isdir(THEMES_FOLDER) else RESOURCES_FOLDER
            if dialog.showSave() != adsk.core.DialogResults.DialogOK:
                return
            with open(dialog.filename, 'w') as themeFile:
                themeFile.write(fileContent)
            _send(palette, 'notification', {'type': 'success', 'message': f'Exported theme to {os.path.basename(dialog.filename)}'})
        except Exception:
            app.log(f'{config.CMD_NAME} theme export failed:\n{traceback.format_exc()}')
            _send(palette, 'notification', {'type': 'error', 'message': 'Failed to export theme'})

    def _handle_import_theme(self, palette, file_type):
        try:
            dialog = ui.createFileDialog()
            dialog.title = 'Import Theme'
            dialog.filter = 'CSS files (*.css)' if file_type == 'css' else 'Theme files (*.theme.json;*.json)'
            dialog.initialDirectory = THEMES_FOLDER if os.path.isdir(THEMES_FOLDER) else RESOURCES_FOLDER
            if dialog.showOpen() != adsk.core.DialogResults.DialogOK:
                return
            with open(dialog.filename, 'r') as themeFile:
                content = themeFile.read()
            _send(palette, 'theme_imported', {'file_type': file_type, 'content': content})
        except Exception:
            app.log(f'{config.CMD_NAME} theme import failed:\n{traceback.format_exc()}')
            _send(palette, 'notification', {'type': 'error', 'message': 'Failed to import theme'})

    def _handle_save_as(self, palette, tab, form, rawName):
        try:
            name = _sanitize_config_name(rawName)
        except ValueError:
            _send(palette, 'notification', {'type': 'error', 'message': 'Enter a name for the config'})
            return
        configUtils.dumpJsonConfig(_config_path(tab, name), form)
        _set_active_config_name(tab, name)
        _send_config_list(palette, tab)
        _send(palette, 'notification', {'type': 'success', 'message': f'Saved as "{name}"'})

    def _handle_update_current(self, palette, tab, form):
        active = _get_active_config_name(tab)
        if not active:
            _send(palette, 'notification', {'type': 'error', 'message': 'No active config to update, use Save As instead'})
            return
        configUtils.dumpJsonConfig(_config_path(tab, active), form)
        _send(palette, 'notification', {'type': 'success', 'message': f'Updated "{active}"'})

    def _handle_load_config(self, palette, tab, name):
        if not name:
            _send(palette, 'notification', {'type': 'error', 'message': 'Select a config to load'})
            return
        saved = configUtils.readJsonConfig(_config_path(tab, name))
        if saved is None:
            _send(palette, 'notification', {'type': 'error', 'message': f'Config "{name}" not found'})
            return
        form = dict(DEFAULTS_BY_TAB[tab])
        form.update(saved)
        _set_active_config_name(tab, name)
        _send(palette, 'set_state', {'tab': tab, 'form': form, 'source': 'load_config'})
        _send_config_list(palette, tab)
        _send(palette, 'notification', {'type': 'success', 'message': f'Loaded "{name}"'})

    def _handle_delete_config(self, palette, tab, name):
        if not name:
            _send(palette, 'notification', {'type': 'error', 'message': 'Select a config to delete'})
            return
        configUtils.deleteConfigFile(_config_path(tab, name))
        if _get_active_config_name(tab) == name:
            _set_active_config_name(tab, None)
        _send_config_list(palette, tab)
        _send(palette, 'notification', {'type': 'success', 'message': f'Deleted "{name}"'})

    def _handle_clear_preview(self, palette, tab):
        if not has_preview():
            _send(palette, 'preview_status', {'tab': tab, 'active': False})
            return

        safe, message = _ensure_safe_to_mutate()
        if not safe:
            _send(palette, 'notification', {'type': 'error', 'message': message})
            return

        try:
            clear_preview()
            _send(palette, 'preview_status', {'tab': tab, 'active': False})
        except Exception:
            app.log(f'{config.CMD_NAME} clear_preview failed:\n{traceback.format_exc()}')
            _send(palette, 'notification', {'type': 'error', 'message': getErrorMessage()})

    def _handle_update_preview(self, palette, tab, form):
        result = VALIDATE_BY_TAB[tab](form)
        if not result['valid']:
            _send(palette, 'validation_result', {
                'tab': tab, 'valid': False,
                'fieldErrors': result['fieldErrors'], 'computed': result['computed'],
            })
            _send(palette, 'notification', {'type': 'error', 'message': 'Fix the highlighted fields before previewing'})
            return

        safe, message = _ensure_safe_to_mutate()
        if not safe:
            _send(palette, 'notification', {'type': 'error', 'message': message})
            return

        def work():
            try:
                clear_preview()
                occurrence = generation.create_and_build(form, is_preview=True)
                track_preview(occurrence)
                _send(palette, 'preview_status', {'tab': tab, 'active': True})
            except Exception:
                app.log(f'{config.CMD_NAME} update_preview failed:\n{traceback.format_exc()}')
                _send(palette, 'notification', {'type': 'error', 'message': getErrorMessage()})

        _run_grouped(work, f'{config.ADDIN_NAME} Preview')

    def _handle_generate(self, palette, tab, form):
        result = VALIDATE_BY_TAB[tab](form)
        if not result['valid']:
            _send(palette, 'validation_result', {
                'tab': tab, 'valid': False,
                'fieldErrors': result['fieldErrors'], 'computed': result['computed'],
            })
            _send(palette, 'notification', {'type': 'error', 'message': 'Fix the highlighted fields before generating'})
            return

        safe, message = _ensure_safe_to_mutate()
        if not safe:
            _send(palette, 'notification', {'type': 'error', 'message': message})
            return

        def work():
            try:
                clear_preview()
                generation.create_and_build(form, is_preview=False)
                _send(palette, 'preview_status', {'tab': tab, 'active': False})
                _send(palette, 'notification', {'type': 'success', 'message': 'Generated'})
            except Exception:
                app.log(f'{config.CMD_NAME} generate failed:\n{traceback.format_exc()}')
                _send(palette, 'notification', {'type': 'error', 'message': getErrorMessage()})

        _run_grouped(work, f'{config.ADDIN_NAME} Generate')


class PaletteCloseHandler(adsk.core.UserInterfaceGeneralEventHandler):
    def notify(self, args):
        try:
            palette = ui.palettes.itemById(config.PALETTE_ID)
            if palette:
                _save_palette_geometry(palette)
        except Exception:
            app.log(f'{config.CMD_NAME} PaletteCloseHandler failed:\n{traceback.format_exc()}')
