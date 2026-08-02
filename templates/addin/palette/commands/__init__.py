# Here you define the commands that will be added to your add-in.

# TODO Import the modules corresponding to the commands you created.
# If you want to add an additional command, add its module here.
from . import PaletteCommand

# TODO add imported modules to this list.
# Fusion will automatically call the start() and stop() functions.
_commands = [
    PaletteCommand,
]


# Called when the add-in is started. Registers all commands.
def start():
    for command in _commands:
        command.start()


# Called when the add-in is stopped. Un-registers all commands.
def stop():
    for command in _commands:
        command.stop()
