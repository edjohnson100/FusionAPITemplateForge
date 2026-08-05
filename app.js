(function () {
    'use strict';

    const TEMPLATES_ROOT = 'templates/';
    const APP_VERSION = '1.2.0';
    const APP_RELEASE_DATE = 'August 2026';

    // ------------------------------------------------------------------
    // Command button toolbar placement -- Design workspace (FusionSolidEnvironment)
    // only, for now. Panel IDs verified against a real Fusion UI dump
    // (Archive/Fusion_Workspace_Panels.xml), not guessed -- wrong IDs make
    // config.DEFAULT_PANEL_ID resolve to None in the generated add-in and
    // crash on startup. Construct/Inspect/Insert/Select are genuinely the
    // same panel ID shared across the Solid and Surface tabs in Fusion's own
    // UI, not a shortcut taken here.
    // ------------------------------------------------------------------
    const PANEL_LOCATIONS = {
        solid: {
            label: 'Solid',
            panels: [
                { label: 'Create', id: 'SolidCreatePanel' },
                { label: 'Modify', id: 'SolidModifyPanel' },
                { label: 'Assemble', id: 'AssemblePanel' },
                { label: 'Configure', id: 'ConfigurePanel' },
                { label: 'Construct', id: 'ConstructionPanel' },
                { label: 'Inspect', id: 'InspectPanel' },
                { label: 'Insert', id: 'InsertPanel' },
                { label: 'Select', id: 'SelectPanel' },
                { label: 'Project Salvador (requires the beta preference enabled)', id: 'Autodesk_ProjectSalvador_panel_id' },
            ],
        },
        surface: {
            label: 'Surface',
            panels: [
                { label: 'Create', id: 'SurfaceCreatePanel' },
                { label: 'Modify', id: 'SurfaceModifyPanel' },
                { label: 'Construct', id: 'ConstructionPanel' },
                { label: 'Inspect', id: 'InspectPanel' },
                { label: 'Insert', id: 'InsertPanel' },
                { label: 'Select', id: 'SelectPanel' },
            ],
        },
        mesh: {
            label: 'Mesh',
            panels: [
                { label: 'Create', id: 'ParaMeshCreatePanel' },
                { label: 'Prepare', id: 'ParaMeshPreparePanel' },
                { label: 'Modify', id: 'ParaMeshModifyPanel' },
                { label: 'Construct', id: 'ConstructionPanel' },
                { label: 'Inspect', id: 'InspectPanel' },
                { label: 'Insert', id: 'InsertPanel' },
                { label: 'Select', id: 'ParaMeshSelectPanel' },
                { label: 'Export', id: 'ParaMeshExportPanel' },
            ],
        },
        utilities: {
            label: 'Utilities',
            panels: [
                { label: 'Add-ins', id: 'SolidScriptsAddinsPanel' },
                { label: 'Utility', id: 'UtilityPanel' },
                { label: 'Make', id: 'MakePanel' },
                { label: 'Nest', id: 'NESTPanel' },
                { label: 'Inspect', id: 'ToolsInspectPanel' },
                { label: 'Create PMI', id: 'Annotate3DPanel' },
                { label: 'Select', id: 'SelectPanel' },
            ],
        },
        // Not a persistent ribbon tab -- Fusion swaps the whole ribbon to this
        // one contextual tab while actively creating/editing a sketch,
        // regardless of which of the tabs above you started from. Confirmed
        // as a single shared occurrence (not per-base-tab) in
        // Archive/Fusion_Workspace_Panels.xml.
        sketch: {
            label: 'Sketch (active while editing a sketch)',
            panels: [
                { label: 'Create', id: 'SketchCreatePanel' },
                { label: 'Modify', id: 'SketchModifyPanel' },
                { label: 'Constraints', id: 'SketchConstraintsPanel' },
                { label: 'Configure', id: 'ConfigurePanel' },
                { label: 'Inspect', id: 'InspectPanel' },
                { label: 'Insert', id: 'InsertPanel' },
                { label: 'Select', id: 'SelectPanel' },
            ],
        },
    };
    const DEFAULT_PANEL_TAB = 'solid';
    const DEFAULT_SECONDARY_PANEL_TAB = 'sketch';

    const els = {
        projectType: () => document.querySelector('input[name="projectType"]:checked').value,
        tier: () => document.querySelector('input[name="tier"]:checked').value,
        name: document.getElementById('input-name'),
        nameRow: document.getElementById('name-row'),
        author: document.getElementById('input-author'),
        company: document.getElementById('input-company'),
        companyRow: document.getElementById('company-row'),
        description: document.getElementById('input-description'),
        version: document.getElementById('input-version'),
        license: document.getElementById('input-license'),
        tierPanel: document.getElementById('tier-panel'),
        tierNote: document.getElementById('tier-note'),
        placementPanel: document.getElementById('placement-panel'),
        panelTab: document.getElementById('input-panel-tab'),
        panelId: document.getElementById('input-panel-id'),
        secondaryEnabled: document.getElementById('input-secondary-enabled'),
        secondaryFields: document.getElementById('secondary-placement-fields'),
        panelTab2: document.getElementById('input-panel-tab-2'),
        panelId2: document.getElementById('input-panel-id-2'),
        bundledNote: document.getElementById('bundled-note'),
        fileTree: document.getElementById('file-tree'),
        generateBtn: document.getElementById('generate-btn'),
        nextStepsPanel: document.getElementById('next-steps-panel'),
        nextStepsContent: document.getElementById('next-steps-content'),
        themeSelect: document.getElementById('app-theme-select'),
        versionLine: document.getElementById('app-version-line'),
    };

    const featureIds = ['configManager', 'groupedUndo', 'previewGenerate', 'toolClip', 'vscode', 'readme', 'claudeMd', 'archiveGuide', 'archiveExtras'];
    const featureCheckbox = (id) => document.getElementById(`feat-${id}`);
    const featureLabel = (id) => document.getElementById(`feat-${id}-label`);

    function getState() {
        const projectType = els.projectType();
        const tier = els.tier();
        const features = {};
        featureIds.forEach((id) => { features[id] = featureCheckbox(id).checked; });
        return {
            projectType,
            tier,
            name: els.name.value.trim(),
            author: els.author.value.trim(),
            company: els.company.value.trim() || 'YourCompany',
            description: els.description.value.trim() || 'TODO: describe what this does.',
            version: els.version.value.trim() || '1.0.0',
            license: els.license.value,
            panelId: els.panelId.value || PANEL_LOCATIONS[DEFAULT_PANEL_TAB].panels[0].id,
            secondaryEnabled: els.secondaryEnabled.checked,
            secondaryPanelId: els.panelId2.value || PANEL_LOCATIONS[DEFAULT_SECONDARY_PANEL_TAB].panels[0].id,
            features,
        };
    }

    function isValidName(name) {
        return /^[A-Z][A-Za-z0-9]*$/.test(name);
    }

    // ------------------------------------------------------------------
    // Command button placement: Tab select drives which panels are offered.
    // Both the primary and secondary location use this same pair of
    // functions against their own select elements/default tab, so they stay
    // in sync with PANEL_LOCATIONS automatically.
    // ------------------------------------------------------------------
    function populateTabOptions(tabSelect, defaultTab) {
        tabSelect.innerHTML = '';
        Object.keys(PANEL_LOCATIONS).forEach((key) => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = PANEL_LOCATIONS[key].label;
            tabSelect.appendChild(opt);
        });
        tabSelect.value = defaultTab;
    }

    function populatePanelOptions(tabSelect, panelSelect, defaultTab) {
        const tab = PANEL_LOCATIONS[tabSelect.value] || PANEL_LOCATIONS[defaultTab];
        panelSelect.innerHTML = '';
        tab.panels.forEach((panel) => {
            const opt = document.createElement('option');
            opt.value = panel.id;
            opt.textContent = panel.label;
            panelSelect.appendChild(opt);
        });
    }

    // ------------------------------------------------------------------
    // UI gating: project type / tier control which fields & checkboxes
    // are relevant. Switching away silently unchecks/hides, never restores.
    // ------------------------------------------------------------------
    function updateGating() {
        const projectType = els.projectType();
        const tier = els.tier();
        const isAddin = projectType === 'addin';
        const isPaletteTier = isAddin && tier !== 'bare';

        els.tierPanel.style.display = isAddin ? '' : 'none';
        els.companyRow.style.display = isAddin ? '' : 'none';
        els.tierNote.style.display = 'none';
        els.placementPanel.style.display = isAddin ? '' : 'none';
        els.secondaryFields.style.display = (isAddin && els.secondaryEnabled.checked) ? '' : 'none';

        const paletteOnlyFeatures = ['configManager', 'groupedUndo', 'previewGenerate'];
        paletteOnlyFeatures.forEach((id) => {
            const cb = featureCheckbox(id);
            const label = featureLabel(id);
            if (!isPaletteTier) {
                cb.checked = false;
                cb.disabled = true;
                label.classList.add('disabled');
            } else {
                cb.disabled = false;
                label.classList.remove('disabled');
            }
        });

        // previewGenerate's Update Preview/Generate handlers call _run_grouped(),
        // so it can't be included without groupedUndo -- force the dependency.
        const previewGenerateCb = featureCheckbox('previewGenerate');
        const groupedUndoCb = featureCheckbox('groupedUndo');
        const groupedUndoLabel = featureLabel('groupedUndo');
        if (isPaletteTier && previewGenerateCb.checked) {
            groupedUndoCb.checked = true;
            groupedUndoCb.disabled = true;
            groupedUndoLabel.classList.add('disabled');
        }
        els.bundledNote.style.display = (isPaletteTier && previewGenerateCb.checked) ? '' : 'none';

        // Scripts don't register a command button, so there's nothing for a
        // toolClip hover-preview image to attach to.
        const toolClipCb = featureCheckbox('toolClip');
        const toolClipLabel = featureLabel('toolClip');
        if (projectType === 'script') {
            toolClipCb.checked = false;
            toolClipCb.disabled = true;
            toolClipLabel.classList.add('disabled');
        } else {
            toolClipCb.disabled = false;
            toolClipLabel.classList.remove('disabled');
        }

        // Extras only make sense once the Archive/ folder itself is included.
        const archiveGuideCb = featureCheckbox('archiveGuide');
        const archiveExtrasCb = featureCheckbox('archiveExtras');
        const archiveExtrasLabel = featureLabel('archiveExtras');
        if (!archiveGuideCb.checked) {
            archiveExtrasCb.checked = false;
            archiveExtrasCb.disabled = true;
            archiveExtrasLabel.classList.add('disabled');
        } else {
            archiveExtrasCb.disabled = false;
            archiveExtrasLabel.classList.remove('disabled');
        }
    }

    // ------------------------------------------------------------------
    // File manifest: maps the selected options to {out, src, binary} entries.
    // `src` is relative to templates/. Every text file gets the same
    // placeholder substitution pass -- see substitute().
    // ------------------------------------------------------------------
    function computeFileList(s) {
        const root = s.name || 'MyProject';
        const files = [];
        const add = (out, src, binary = false) => files.push({ out: `${root}/${out}`, src, binary });

        if (s.projectType === 'script') {
            add(`${root}.py`, 'script/ScriptName.py');
            add(`${root}.manifest`, 'script/manifest.json');
            add(`${root}AppIcon.png`, 'addin/icons/512x512.png', true);
            add('.gitignore', 'common/gitignore_script');
            add('.gitattributes', 'common/gitattributes');
            if (s.features.vscode) add('.vscode/launch.json', 'common/vscode_launch.json');
            if (s.license) add('LICENSE', `common/licenses/${s.license}.txt`);
            if (s.features.readme) add('README.md', 'common/README_script.md');
            if (s.features.claudeMd) add('CLAUDE.md', 'common/CLAUDE_script.md');
            add('NEXT_STEPS.md', 'common/NEXT_STEPS_script.md');
            if (s.features.archiveGuide) {
                add('Archive/!Fusion_Scripts_Template_User_Guide.md', 'common/archive/script_guide.md');
                if (s.features.archiveExtras) {
                    add('Archive/!Dev_Notes.md', 'common/archive/script_dev_notes.md');
                    add('Archive/!Next_Chat.md', 'common/archive/script_next_chat.md');
                    add('Archive/!Release_Notes.md', 'common/archive/script_release_notes.md');
                    add('Archive/Add-in_Scripts_Installation_Template.md', 'common/archive/install_template.md');
                }
            }
            return files;
        }

        // Add-in, all tiers
        add(`${root}.py`, 'addin/AddInName.py');
        add(`${root}.manifest`, 'addin/manifest.json');
        add(`${root}AppIcon.png`, 'addin/icons/512x512.png', true);
        add('config.py', 'addin/config.py');
        add('lib/__init__.py', 'addin/lib/__init__.py');
        add('lib/fusionAddInUtils/__init__.py', 'addin/lib/fusionAddInUtils/__init__.py');
        add('lib/fusionAddInUtils/event_utils.py', 'addin/lib/fusionAddInUtils/event_utils.py');
        add('lib/fusionAddInUtils/general_utils.py', 'addin/lib/fusionAddInUtils/general_utils.py');
        ['16x16', '32x32', '64x64', '128x128', '256x256', '512x512', '1024x1024'].forEach((sz) => {
            add(`resources/${sz}.png`, `addin/icons/${sz}.png`, true);
        });
        if (s.features.toolClip) add('resources/toolClip.png', 'common/toolClip.png', true);
        if (s.features.vscode) add('.vscode/launch.json', 'common/vscode_launch.json');
        add('.gitignore', 'common/gitignore_addin');
        add('.gitattributes', 'common/gitattributes');
        if (s.license) add('LICENSE', `common/licenses/${s.license}.txt`);
        if (s.features.readme) add('README.md', 'common/README_addin.md');
        add('NEXT_STEPS.md', 'common/NEXT_STEPS_addin.md');

        if (s.tier === 'bare') {
            add('commands/__init__.py', 'addin/bare/commands/__init__.py');
            add('commands/ExampleCommand.py', 'addin/bare/commands/ExampleCommand.py');
            if (s.features.claudeMd) add('CLAUDE.md', 'common/CLAUDE_addin_bare.md');
        } else {
            add('lib/appConfig.py', 'addin/lib/appConfig.py');
            add('lib/configUtils.py', 'addin/lib/configUtils.py');
            add('commands/__init__.py', 'addin/palette/commands/__init__.py');
            if (s.features.previewGenerate) add('commands/generation.py', 'addin/palette/commands/generation.py');
            add('commands/PaletteCommand.py', 'addin/palette/commands/PaletteCommand.py');
            add(`resources/${root}_Index.html`, 'addin/palette/resources/AddInName_Index.html');
            add('resources/script.js', 'addin/palette/resources/script.js');
            add('resources/style.css', 'addin/palette/resources/style.css');
            if (s.tier === 'theme') {
                add('resources/themes/Forest.theme.json', 'addin/palette/resources/themes/Forest.theme.json');
                add('resources/themes/Ocean.theme.json', 'addin/palette/resources/themes/Ocean.theme.json');
            }
            add('commandConfig/config.ini', 'addin/palette/commandConfig/config.ini');
            if (s.features.claudeMd) add('CLAUDE.md', 'common/CLAUDE_addin_palette.md');
        }

        if (s.features.archiveGuide) {
            add('Archive/!Fusion_Addin_Template_User_Guide.md', 'common/archive/addin_guide.md');
            if (s.features.archiveExtras) {
                add('Archive/!Dev_Notes.md', 'common/archive/addin_dev_notes.md');
                add('Archive/!Next_Chat.md', 'common/archive/addin_next_chat.md');
                add('Archive/!Release_Notes.md', 'common/archive/addin_release_notes.md');
                add('Archive/!Add-in_Scripts_Installation_Template.md', 'common/archive/install_template.md');
            }
        }

        return files;
    }

    // ------------------------------------------------------------------
    // FORGE:IF / FORGE:ELSE / FORGE:ENDIF marker stripping. Comment-syntax
    // agnostic (works whether the marker sits in a #, //, <!-- --> or /* */
    // comment) since it just regexes for the marker text on each line.
    // Supports nesting via a stack, though the templates don't currently
    // nest markers.
    // ------------------------------------------------------------------
    function stripForgeMarkers(text, flags) {
        const lines = text.split('\n');
        const out = [];
        const stack = [];
        for (const line of lines) {
            const ifMatch = line.match(/FORGE:IF\s+(\w+)/);
            if (ifMatch) {
                stack.push({ branch: 'then', flagVal: !!flags[ifMatch[1]] });
                continue;
            }
            if (/FORGE:ELSE\b/.test(line)) {
                const top = stack[stack.length - 1];
                if (top) top.branch = 'else';
                continue;
            }
            if (/FORGE:ENDIF\b/.test(line)) {
                stack.pop();
                continue;
            }
            const keep = stack.every((f) => (f.branch === 'then' ? f.flagVal : !f.flagVal));
            if (keep) out.push(line);
        }
        return out.join('\n');
    }

    function getFeatureFlags(s) {
        return {
            palette: s.projectType === 'addin' && s.tier !== 'bare',
            themeDesigner: s.tier === 'theme',
            configManager: s.features.configManager,
            groupedUndo: s.features.groupedUndo,
            previewGenerate: s.features.previewGenerate,
            secondaryPanel: s.secondaryEnabled,
        };
    }

    function substitute(text, s, guid) {
        const year = new Date().getFullYear();
        return text
            .replace(/\{\{NAME\}\}/g, s.name)
            .replace(/\{\{AUTHOR\}\}/g, s.author || 'Unknown')
            .replace(/\{\{COMPANY\}\}/g, s.company)
            .replace(/\{\{DESCRIPTION\}\}/g, s.description)
            .replace(/\{\{VERSION\}\}/g, s.version)
            .replace(/\{\{PANEL_ID\}\}/g, s.panelId)
            .replace(/\{\{SECONDARY_PANEL_ID\}\}/g, s.secondaryPanelId)
            .replace(/\{\{GUID\}\}/g, guid)
            .replace(/\{\{YEAR\}\}/g, String(year))
            .replace(/AddInName/g, s.name || 'AddInName')
            .replace(/YourCompany/g, s.company);
    }

    // ------------------------------------------------------------------
    // Live file-tree preview
    // ------------------------------------------------------------------
    function renderTree(files) {
        if (!files.length) {
            els.fileTree.textContent = '(enter a name to preview)';
            return;
        }
        const root = {};
        files.forEach((f) => {
            const parts = f.out.split('/');
            let node = root;
            parts.forEach((part, i) => {
                if (i === parts.length - 1) {
                    node[part] = null;
                } else {
                    node[part] = node[part] || {};
                    node = node[part];
                }
            });
        });

        const lines = [];
        function walk(node, prefix) {
            const keys = Object.keys(node).sort((a, b) => {
                const aDir = node[a] !== null, bDir = node[b] !== null;
                if (aDir !== bDir) return aDir ? -1 : 1;
                return a.localeCompare(b);
            });
            keys.forEach((key, i) => {
                const isLast = i === keys.length - 1;
                lines.push(prefix + (isLast ? '└── ' : '├── ') + key);
                if (node[key] !== null) {
                    walk(node[key], prefix + (isLast ? '    ' : '│   '));
                }
            });
        }
        walk(root, '');
        els.fileTree.textContent = lines.join('\n');
    }

    function refreshPreview() {
        const s = getState();
        const nameOk = isValidName(s.name);
        els.nameRow.classList.toggle('invalid', s.name.length > 0 && !nameOk);

        const files = nameOk ? computeFileList(s) : [];
        renderTree(files);

        els.generateBtn.disabled = !nameOk;
        els.generateBtn.textContent = nameOk ? `Generate ${s.name}.zip` : 'Enter a valid name to generate';
    }

    // ------------------------------------------------------------------
    // Generate + download
    // ------------------------------------------------------------------
    async function generate() {
        const s = getState();
        if (!isValidName(s.name)) return;

        els.generateBtn.disabled = true;
        els.generateBtn.textContent = 'Generating...';

        try {
            const guid = crypto.randomUUID();
            const flags = getFeatureFlags(s);
            const files = computeFileList(s);
            const zip = new JSZip();

            for (const f of files) {
                const url = TEMPLATES_ROOT + f.src;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
                if (f.binary) {
                    zip.file(f.out, await res.arrayBuffer());
                } else {
                    const text = substitute(stripForgeMarkers(await res.text(), flags), s, guid);
                    zip.file(f.out, text);
                }
            }

            const blob = await zip.generateAsync({ type: 'blob' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${s.name}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();

            const nextStepsSrc = s.projectType === 'script' ? 'common/NEXT_STEPS_script.md' : 'common/NEXT_STEPS_addin.md';
            const nextStepsRes = await fetch(TEMPLATES_ROOT + nextStepsSrc);
            const nextStepsText = substitute(await nextStepsRes.text(), s, guid);
            els.nextStepsContent.textContent = nextStepsText;
            els.nextStepsPanel.classList.add('visible');
        } catch (err) {
            console.error(err);
            alert(`Something went wrong generating the zip: ${err.message}`);
        } finally {
            refreshPreview();
        }
    }

    // ------------------------------------------------------------------
    // This page's own theming -- a live demo of the same CSS-variable /
    // data-theme system Theme Designer Pro and its generated palettes use.
    // Plain client-side localStorage here is fine (unlike generated
    // add-ins, there's no Python-owned state to stay in sync with).
    // ------------------------------------------------------------------
    const THEME_STORAGE_KEY = 'forge-app-theme';

    function applyAppTheme(name) {
        if (name) {
            document.documentElement.setAttribute('data-theme', name);
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        els.themeSelect.value = name || '';
    }

    function initAppTheme() {
        const saved = localStorage.getItem(THEME_STORAGE_KEY) || '';
        applyAppTheme(saved);
        els.themeSelect.addEventListener('change', () => {
            const name = els.themeSelect.value;
            applyAppTheme(name);
            localStorage.setItem(THEME_STORAGE_KEY, name);
        });
    }

    // ------------------------------------------------------------------
    // Wire up events
    // ------------------------------------------------------------------
    document.querySelectorAll('input[name="projectType"]').forEach((el) => el.addEventListener('change', () => { updateGating(); refreshPreview(); }));
    document.querySelectorAll('input[name="tier"]').forEach((el) => el.addEventListener('change', () => { updateGating(); refreshPreview(); }));
    [els.name, els.author, els.company, els.description, els.version, els.license].forEach((el) => el.addEventListener('input', refreshPreview));
    featureIds.forEach((id) => featureCheckbox(id).addEventListener('change', () => { updateGating(); refreshPreview(); }));
    els.panelTab.addEventListener('change', () => { populatePanelOptions(els.panelTab, els.panelId, DEFAULT_PANEL_TAB); refreshPreview(); });
    els.panelId.addEventListener('change', refreshPreview);
    els.secondaryEnabled.addEventListener('change', () => { updateGating(); refreshPreview(); });
    els.panelTab2.addEventListener('change', () => { populatePanelOptions(els.panelTab2, els.panelId2, DEFAULT_SECONDARY_PANEL_TAB); refreshPreview(); });
    els.panelId2.addEventListener('change', refreshPreview);
    els.generateBtn.addEventListener('click', generate);

    initAppTheme();
    els.versionLine.textContent = `v${APP_VERSION}, ${APP_RELEASE_DATE}`;
    populateTabOptions(els.panelTab, DEFAULT_PANEL_TAB);
    populatePanelOptions(els.panelTab, els.panelId, DEFAULT_PANEL_TAB);
    populateTabOptions(els.panelTab2, DEFAULT_SECONDARY_PANEL_TAB);
    populatePanelOptions(els.panelTab2, els.panelId2, DEFAULT_SECONDARY_PANEL_TAB);
    updateGating();
    refreshPreview();
})();
