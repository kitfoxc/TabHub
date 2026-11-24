"""Build the offline editor ZIP from the same files used in the working tree."""
import argparse
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path)
args = parser.parse_args()
files = ["ui/workbench.css", "messages-editor.html", "LICENSE", "styles/base.css", "styles/rich-text.css", "styles/README.md",
         "docs/messages-editor-design.md", "src/hub-shell.js", "src/message-source.js", "src/settings.js",
         "src/theme-manager.js", "src/tab-layout.js", "src/tabs.js", "src/app.js"]
with ZipFile(args.output, "w", ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root / name, name)
    for folder in ["editor", "themes"]:
        for path in sorted((root / folder).rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(root))
