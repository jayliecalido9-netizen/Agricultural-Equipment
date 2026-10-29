Agricultural Equipment and Asset Management System
DETAILED EDITION

19 pages: one cover and 18 individual diagram pages.
Green and teal theme. Each diagram has three detailed interpretation notes.
The generator compares diagram orientation/layout to improve printed legibility.

PDF and Word: AEAMS-Diagrams.pdf / AEAMS-Diagrams.docx
HTML: AEAMS-Diagrams.html
Individual scalable SVG and high-resolution PNG: diagrams/
Editable Graphviz sources: sources/ (custom SVG diagrams are generated in render-detailed.cjs)
Regenerate inside this project with: node artifacts/aeams-diagrams/generate.cjs
Libraries: @viz-js/viz and docx under .test-data/diagram-tools; Playwright in project dependencies.
On a fresh checkout, run npm ci at the project root, then:
npm install --prefix .test-data/diagram-tools --ignore-scripts @viz-js/viz@3.31.0 docx@9.15.0
node artifacts/aeams-diagrams/generate.cjs
Microsoft Edge is used for rendering on Windows. verify-layout.ps1 also requires Microsoft Word.
layout-report.json records page clipping and rendered text size checks.

Admin and Employee are the only portal roles. Farmers are borrower references.
All example object values are fictional. The ERD is a core subset, with omissions stated in its caption.
