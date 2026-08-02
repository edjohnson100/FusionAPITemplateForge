"""
Placeholder for the add-in's real Fusion geometry construction.

Replace create_and_build() with whatever your add-in actually generates
(sketches/features via adsk.fusion), driven by the plain `form` dict that
PaletteCommand.py collects from the Main tab's fields. Keep the two-mode
shape (is_preview=True builds a not-yet-finalized, deletable component;
is_preview=False finalizes it) since PaletteCommand.py's Update
Preview/Generate/Clear Preview buttons rely on it.
"""
import adsk.core
import adsk.fusion

PREVIEW_NAME_PREFIX = 'PREVIEW_'


def create_and_build(form: dict, is_preview: bool = False):
    """TODO: build real geometry here.

    Arguments:
    form -- the Main tab's field values, e.g. {'exampleValue': 1.0}.
    is_preview -- True for Update Preview (not-yet-finalized, deletable),
                  False for Generate (permanent).

    :returns: the created adsk.fusion.Occurrence (or component), so
        PaletteCommand.py's preview tracking can find/delete it later.
    """
    app = adsk.core.Application.get()
    design = adsk.fusion.Design.cast(app.activeProduct)
    if design is None:
        raise RuntimeError('No active Fusion design.')

    root = design.rootComponent
    name = f'{PREVIEW_NAME_PREFIX}Example' if is_preview else 'Example'
    occurrences = root.occurrences
    new_occurrence = occurrences.addNewComponent(adsk.core.Matrix3D.create())
    new_occurrence.component.name = name

    # TODO: replace this placeholder sketch with your real feature(s), e.g.:
    # sketches = new_occurrence.component.sketches
    # sketch = sketches.add(new_occurrence.component.xYConstructionPlane)
    # ...

    return new_occurrence
