# Legal & Copyright Notice — Marathon06iOS

## Zero Copyrighted Assets Policy

This repository contains **only** original clean-room iOS platform integration code, CMake build recipes, GitHub Actions CI workflows, and documentation.

**This repository DOES NOT contain, distribute, or host:**
- Original Xbox 360 executables (`default.xex`) or Xbox OG executables (`default.xbe`)
- Game shader archives (`shader.arc`, `shader_lt.arc`)
- Disc images (`.iso`, `.xiso`), textures, models, audio, cutscenes, or DLC packages
- Any copyrighted intellectual property belonging to SEGA Corporation, Sonic Team, or Microsoft Corporation

## User Responsibility

To compile or run **Marathon06iOS**, you must supply files extracted exclusively from **your own legally acquired copy** of *Sonic the Hedgehog (2006)* for Xbox 360.

During cloud compilation via GitHub Actions:
1. Build inputs are fetched transiently inside an ephemeral runner VM via private user-configured GitHub Secrets.
2. Temporary game inputs are deleted before the `.ipa` artifact is packaged.
3. `.gitignore` and an automated CI audit step prevent accidental commits of protected binaries into the public repository.

## Upstream Credits & Licenses

- **MarathonRecomp** (`sonicnext-dev/MarathonRecomp`): GPL-3.0 / upstream open-source static recompilation runtime.
- **XenonRecomp / XenosRecomp**: Static PowerPC & Xenos shader recompilers.
- **Plume / SDL3 / FFmpeg / FreeType**: Respective open-source licenses.
- **Architecture Inspiration**: Clean-room iOS overlay workflow inspired by `hiperema95-ctrl/edgyios`.
