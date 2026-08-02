import os
import adsk.core
from .. import config
from ..lib import fusionAddInUtils as futil

app = adsk.core.Application.get()
ui = app.userInterface

# TODO *** Specify the command identity information. ***
CMD_ID = f'{config.COMPANY_NAME}_{config.ADDIN_NAME}_cmdExample'
CMD_NAME = 'Example Command'
CMD_DESCRIPTION = 'TODO: replace this with your add-in\'s real command.'

# Specify that the command will be promoted to the panel.
IS_PROMOTED = True

# Resource location for command icons -- resources/ ships a full
# 16/32/64/128/256/512/1024 size stack; Fusion picks the sizes it needs.
ICON_FOLDER = os.path.join(config.get_resource_folder(), '')

# Local list of event handlers used to maintain a reference so
# they are not released and garbage collected.
local_handlers = []


def start():
    cmd_def = ui.commandDefinitions.addButtonDefinition(CMD_ID, CMD_NAME, CMD_DESCRIPTION, ICON_FOLDER)
    futil.add_handler(cmd_def.commandCreated, command_created)

    workspace = ui.workspaces.itemById(config.DEFAULT_WORKSPACE_ID)
    panel = workspace.toolbarPanels.itemById(config.DEFAULT_PANEL_ID)
    control = panel.controls.addCommand(cmd_def, config.COMMAND_BESIDE_ID, False)
    control.isPromoted = IS_PROMOTED


def stop():
    workspace = ui.workspaces.itemById(config.DEFAULT_WORKSPACE_ID)
    panel = workspace.toolbarPanels.itemById(config.DEFAULT_PANEL_ID)
    command_control = panel.controls.itemById(CMD_ID)
    command_def = ui.commandDefinitions.itemById(CMD_ID)

    if command_control:
        command_control.deleteMe()
    if command_def:
        command_def.deleteMe()


def command_created(args: adsk.core.CommandCreatedEventArgs):
    futil.add_handler(args.command.execute, command_execute)


def command_execute(args: adsk.core.CommandEventArgs):
    # TODO replace with your add-in's real behavior.
    ui.messageBox(f'"{app.activeDocument.name}" is the active Document.')
