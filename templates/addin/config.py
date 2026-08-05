"""
Global configuration and constants for the add-in.
"""
import os
import json

# Flag that indicates to run in Debug mode or not. When running in Debug mode
# more information is written to the Text Command window. Generally, it's
# useful to set this to True while developing an add-in and set it to False
# when you are ready to distribute it.
DEBUG = True

# Gets the name of the add-in from the name of the folder the py file is in.
# This automatically becomes your real add-in's name once you rename the
# project folder -- no string to hand-edit here. It's also recommended to
# use a company name as part of any ID built from these, to better ensure
# uniqueness.
ADDIN_NAME = os.path.basename(os.path.dirname(__file__))
COMPANY_NAME = 'YourCompany'  # TODO: replace with your own company/author tag

# ==============================================================================
# Workspace / Panel Placement
# ==============================================================================
DEFAULT_WORKSPACE_ID = 'FusionSolidEnvironment'  # Design workspace
DEFAULT_PANEL_ID = '{{PANEL_ID}}'
COMMAND_BESIDE_ID = 'ScriptsManagerCommand'

# FORGE:IF secondaryPanel
# Duplicates the command button into a second panel/tab as well.
SECONDARY_PANEL_ID = '{{SECONDARY_PANEL_ID}}'
# FORGE:ENDIF

# ==============================================================================
# Resource Paths
# ==============================================================================
RESOURCES_ROOT = 'resources'


def get_resource_folder(folder_name: str = '') -> str:
    """Defaults to the root resources folder if no name is provided."""
    return os.path.join(RESOURCES_ROOT, folder_name)


# Must be an absolute path -- unlike resourceFolder, toolClipFilename gets no
# special relative-path handling from the Fusion API and is resolved against
# Fusion's process working directory, not the add-in's own folder.
TOOLCLIP_FILENAME = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'resources', 'toolClip.png')

# The palette HTML file, relative to the add-in root (see PaletteCommand.open_palette()).
PALETTE_HTML_FILENAME = f'{ADDIN_NAME}_Index.html'

# ==============================================================================
# Palette / Command Identifiers
# ==============================================================================
PALETTE_ID = f'{COMPANY_NAME}_{ADDIN_NAME}_palette_id'
PALETTE_NAME = ADDIN_NAME

CMD_ID = f'{COMPANY_NAME}_{ADDIN_NAME}_cmdPalette'
CMD_NAME = ADDIN_NAME
CMD_DESCRIPTION = 'TODO: describe what this add-in does.'

# Fusion has no scripting-level transaction-group API -- this hidden command
# definition is how PaletteCommand._run_grouped() bundles several API calls
# into a single Undo entry (see PaletteCommand.py for the full explanation).
UNDO_GROUP_CMD_ID = f'{COMPANY_NAME}_{ADDIN_NAME}_cmdUndoGroupRunner'


def _read_manifest_version() -> str:
    manifest_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), f'{ADDIN_NAME}.manifest')
    try:
        with open(manifest_path, 'r', encoding='utf-8') as f:
            return json.load(f).get('version', '')
    except Exception:
        return ''


ADDIN_VERSION = _read_manifest_version()
