# SOCIOKAIROS EDU – Research Suite for Moodle (Merged Version 2026)

**Author:** Dr. Víctor Hugo Pérez Gallo
**Institution:** Universidad de Zaragoza
**Package prepared for:** Zenodo deposition and DOI assignment.
**Date:** 2026-08-17

## Description

This repository contains the official SCORM/LTI plugin of the SOCIOKAIROS project for Moodle-based virtual learning environments. It is the merged result of two development lines: the richer SOCIOKAIROS EDU heuristic engine (pedagogical input validation, worldwide geolocation of data sources, methodological alerts, sociological traditions, logical map, suggested designs, SVG visualization) and a technical revision (real SCORM tracking, zero external dependencies, self-contained Word/CSV export).

The plugin integrates the SOCIOKAIROS heuristic engine into SCORM 1.2/2004 objects, enabling students to work on:

- Structural/epistemological validation of the initial research problem, with scaffolded feedback.
- Reformulation of sociological research problems into three question levels (descriptive, relational, critical).
- Dynamic operationalization of dependent and independent variables, including measurement level.
- Worldwide geolocated data-source recommendations.
- Methodological alerts, compatible sociological traditions, a logical map, and suggested study designs.
- An interactive SVG visualization of the problem (causal map, variable network, macro/meso/micro layers).
- Tracking of learning activity through the real SCORM 1.2/2004 API inside Moodle.

Unlike AI-based tools, SOCIOKAIROS works as a **deterministic heuristic engine**, grounded on explicit computational epistemological canons designed for Sociology. No neural networks or external black-box models are used, and the plugin runs entirely in the browser with no runtime or CDN dependency.

## Contents

- `SOCIOKAIROS_EDU_SCORM.zip`: complete SCORM plugin ready to be imported into Moodle. Runs entirely in JavaScript with no external runtime or CDN dependency, and reports real completion status to the LMS through the SCORM 1.2/2004 API.
- `CITATION.cff`: citation metadata in Citation File Format (CFF) for automatic citation tools.
- `metadata.json`: example of Zenodo metadata (optional, for reference).
- `CHANGELOG.md`: technical and methodological revision notes for this package.
- `ROADMAP.md`: native desktop app strategy and future-improvements backlog.
- `README_Zenodo.md`: this documentation.

## How to cite

If you use this plugin for teaching, research or methodological innovation, please cite it as:

> Perez Gallo, V. H. (2026). *SOCIOKAIROS EDU – Research Suite for Moodle (Merged Version 2026)* [Computer software]. Universidad de Zaragoza.

When Zenodo assigns a DOI, you can extend the citation as:

> Perez Gallo, V. H. (2026). *SOCIOKAIROS EDU – Research Suite for Moodle (Merged Version 2026)* [Computer software]. Universidad de Zaragoza. DOI: [to be completed].

## Relation to the SOCIOKAIROS core software

This plugin is part of the broader SOCIOKAIROS ecosystem, a heuristic computational assistant for the reformulation of sociological research problems.

For the main SOCIOKAIROS software and companion paper, see also:

- Perez Gallo, V. H. (2025). *SOCIOKAIROS: A Heuristic Computational Assistant for the Reformulation of Scientific Problems in Sociology (Version 15).* Zenodo. https://doi.org/10.5281/zenodo.17462816
- Perez Gallo, V. H. (2025). *SOCIOKAIROS Companion Paper: Computational Heuristics for Reflexive Sociology.* Zenodo. https://doi.org/10.5281/zenodo.17541706

## Suggested keywords for Zenodo

- Sociology of education
- Research methods
- Digital pedagogy
- Heuristic computing
- SCORM
- Moodle
- SOCIOKAIROS
- Teaching innovation

## License

The software is distributed under **all rights reserved**.
Any use beyond personal research or teaching requires explicit authorization from the author.
