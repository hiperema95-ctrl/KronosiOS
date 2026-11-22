# Marathon06iOS — MarathonRecomp v1.0.0 for iOS & iPadOS

Porting nativo **clean-room** per iOS / iPadOS (`arm64` · Metal 3 Nativo (Plume) · 120Hz ProMotion) di [sonicnext-dev/MarathonRecomp](https://github.com/sonicnext-dev/MarathonRecomp.git) **v1.0.0** (*Sonic the Hedgehog 2006* Xbox 360 Static Recompilation).

Progettato da zero con architettura **overlay pulita** ispirata a [hiperema95-ctrl/edgyios](https://github.com/hiperema95-ctrl/edgyios):
- **Nessun fork obsoleto**: clona sempre `sonicnext-dev/MarathonRecomp` (main / v1.0.0) fresco in CI e applica le patch iOS in modo modulare.
- **Zero file protetti da copyright nel repository pubblico**: `default.xex`, `shader.arc` e `shader_lt.arc` vengono scaricati in modo effimero solo durante la build GitHub Actions tramite GitHub Secrets e cancellati prima del packaging.
- **Importazione diretta `.xiso` / `.iso` nel launcher iOS**: non serve scompattare l'immagine su PC! Il lettore streaming `pread()` legge immagini Xbox 360 da 6+ GB usando meno di 4 MB di RAM.
- **DLC separati nel launcher**: tutti i 7 pacchetti DLC ufficiali Xbox 360 (*Very Hard* Sonic/Shadow/Silver, *Team Attack Amigo*, *Mission Packs*) si importano separatamente nello step dedicato del launcher.

---

## Come Compilare l'.ipa su GitHub Actions (Senza Mac)

1. Fai **push** di questo repository su GitHub (anche **Public** — `.gitignore` e lo step di audit bloccano qualsiasi binario Xbox 360).
2. Estrai dalla **tua copia legale** di *Sonic the Hedgehog (2006)* Xbox 360 i 3 file richiesti da `MarathonRecompLib/CMakeLists.txt`:
   - `default.xex` (root del disco)
   - `shader.arc` (`/xenon/archives/shader.arc`)
   - `shader_lt.arc` (`/xenon/archives/shader_lt.arc`)
3. Vai su **GitHub -> Settings -> Secrets and variables -> Actions -> New repository secret**:
   - Crea il secret **`GAME_FILES_ARCHIVE_URL`** con un link diretto privato a un `.zip` contenente `default.xex`, `shader.arc` e `shader_lt.arc`.
   - **Se usi Google Drive**: imposta il file su *"Chiunque abbia il link (Visualizzatore)"* e usa il formato:
     `https://drive.usercontent.google.com/download?id=ID_DEL_FILE&export=download&confirm=t`
     *(Il workflow normalizza comunque in automatico anche il link standard `https://drive.google.com/file/d/ID_DEL_FILE/view?usp=sharing`)*.
   - *(In alternativa supporta anche i 3 secret separati: `DEFAULT_XEX_URL`, `SHADER_ARC_URL`, `SHADER_LT_ARC_URL`)*
4. Apri il tab **Actions -> Build Marathon06iOS iOS IPA -> Run workflow**.
5. Scarica l'artefatto **`Marathon06iOS-v1.0.0-iOS-arm64.ipa`** e installalo su iPhone/iPad tramite **Feather** o **LiveContainer**.

---

## Installazione Dati di Gioco su iPhone / iPad

1. Avvia **Marathon06iOS** su iPhone o iPad (iOS 17.0+).
2. **Gioco Base (XISO Diretto)**: nello step iniziale del launcher, seleziona direttamente il tuo file **`.xiso` / `.iso`** dall'app File di iOS (oppure copialo prima in `Su questo iPhone -> Marathon06iOS -> MarathonRecomp/` per la rilevazione istantanea zero-copy).
3. **DLC (Separati)**: nello step **Select DLC** del launcher, aggiungi separatamente i file STFS/XContent o le cartelle dei DLC Xbox 360 desiderati.
4. **Mod Manager**: copia eventuali mod in `App File -> Marathon06iOS -> MarathonRecomp/mods/` e attivale dal pannello Quick-HUD (`06 -> Mods`).

---

## Note Legali

Vedi [LEGAL.md](LEGAL.md). Nessun file di gioco, eseguibile, shader o asset SEGA / Sonic Team è incluso in questo repository.
