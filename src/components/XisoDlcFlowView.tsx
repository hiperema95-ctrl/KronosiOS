import { useState, type ChangeEvent } from 'react';
import { Check, Copy, Disc3, HardDrive, PackagePlus, Plus, Trash2, Upload } from 'lucide-react';
import {
  DEFAULT_MOD_PROFILES,
  MARATHON_DLC_CATALOG,
  XBOX360_XISO_OFFSETS,
  generateModProfileJson,
  inspectXisoCandidate,
  type ModProfileEntry,
  type XisoInspectionResult,
} from '../utils/portGenerator';

export function XisoDlcFlowView() {
  const [xisoResult, setXisoResult] = useState<XisoInspectionResult>(() =>
    inspectXisoCandidate({
      fileName: 'SonicTheHedgehog_2006_USA.xiso',
      sizeBytes: 6_845_104_128,
      presetOffsetIndex: 0,
    })
  );
  const [selectedDlcIds, setSelectedDlcIds] = useState<string[]>([
    'episode_sonic',
    'episode_amigo',
  ]);
  const [mods, setMods] = useState<ModProfileEntry[]>(DEFAULT_MOD_PROFILES);
  const [newModFolder, setNewModFolder] = useState('');
  const [copiedJson, setCopiedJson] = useState(false);

  const toggleDlc = (id: string) => {
    setSelectedDlcIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleRealFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const headerSlice = file.slice(0, 131072);
    const buffer = new Uint8Array(await headerSlice.arrayBuffer());
    setXisoResult(
      inspectXisoCandidate({
        fileName: file.name,
        sizeBytes: file.size,
        headerSample: buffer,
      })
    );
  };

  const handlePresetXiso = (offsetIndex: number, fileName: string, sizeBytes: number) => {
    setXisoResult(
      inspectXisoCandidate({
        fileName,
        sizeBytes,
        presetOffsetIndex: offsetIndex,
      })
    );
  };

  const toggleMod = (folderName: string) => {
    setMods((prev) =>
      prev.map((m) => (m.folderName === folderName ? { ...m, enabled: !m.enabled } : m))
    );
  };

  const handleAddMod = () => {
    const cleaned = newModFolder.trim().replace(/[^A-Za-z0-9._-]/g, '_');
    if (!cleaned || mods.some((m) => m.folderName === cleaned)) return;
    setMods((prev) => [
      ...prev,
      {
        folderName: cleaned,
        name: cleaned,
        author: 'Locale iOS',
        version: '1.0.0',
        enabled: true,
      },
    ]);
    setNewModFolder('');
  };

  const removeMod = (folderName: string) => {
    setMods((prev) => prev.filter((m) => m.folderName !== folderName));
  };

  const { defaultProfileJson } = generateModProfileJson(mods);

  const handleCopyModJson = async () => {
    try {
      await navigator.clipboard.writeText(defaultProfileJson);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const formatGb = (bytes: number) => `${(bytes / 1_073_741_824).toFixed(2)} GB`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Flusso Launcher iOS: XISO Diretto + DLC Separati
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Replica esattamente la UX di <span className="font-mono">edgyios</span>: lo step del gioco base accetta direttamente
          il file <span className="font-mono">.xiso / .iso</span> tramite lettore streaming <span className="font-mono">pread()</span>,
          mentre i 7 DLC Xbox 360 rimangono nello step separato del launcher.
        </p>
      </div>

      {/* Step 1: Direct XISO Base Game Step */}
      <section aria-labelledby="step1-heading" className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <p className="text-xs font-medium text-blue-700">Step 1 · WizardPage::SelectGame</p>
            <h2 id="step1-heading" className="text-lg font-bold text-slate-900 mt-0.5">
              Selezione Diretta File .xiso / .iso (Zero Scompattazione PC)
            </h2>
          </div>

          <label className="px-3.5 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer">
            <Upload className="w-4 h-4" aria-hidden="true" />
            Verifica tuo file .xiso / .iso
            <input
              type="file"
              accept=".xiso,.iso"
              onChange={handleRealFileSelect}
              className="sr-only"
            />
          </label>
        </div>

        {/* Preset Simulator Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 mr-1">Simula formato Xbox 360:</span>
          <button
            type="button"
            onClick={() => handlePresetXiso(0, 'SonicTheHedgehog_2006_USA.xiso', 6_845_104_128)}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 transition-colors cursor-pointer"
          >
            XISO Compatto (0x00000000)
          </button>
          <button
            type="button"
            onClick={() => handlePresetXiso(4, 'Sonic06_Redump_XGD2.iso', 7_838_695_424)}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 transition-colors cursor-pointer"
          >
            Redump Full ISO (0x0FD90000)
          </button>
          <button
            type="button"
            onClick={() => handlePresetXiso(3, 'Sonic06_XGD3_Dump.iso', 8_738_846_720)}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 transition-colors cursor-pointer"
          >
            XGD3 Dump (0x02080000)
          </button>
        </div>

        {/* Inspection Output */}
        <div
          data-testid="xiso-inspection-panel"
          className={`rounded-lg border p-4 ${
            xisoResult.valid
              ? 'bg-slate-50 border-slate-200'
              : 'bg-red-50 border-red-200'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Disc3
                className={`w-5 h-5 shrink-0 ${
                  xisoResult.valid ? 'text-blue-700' : 'text-red-700'
                }`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 font-mono truncate">
                  {xisoResult.fileName}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {xisoResult.valid
                    ? `${xisoResult.formatLabel} · Magic MICROSOFT*XBOX*MEDIA valido`
                    : xisoResult.error}
                </p>
              </div>
            </div>
            <span
              className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
                xisoResult.valid ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {xisoResult.valid ? 'Pronto per installazione diretta' : 'File non valido'}
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block">Dimensione Immagine</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {formatGb(xisoResult.sizeBytes)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Offset Partizione</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {xisoResult.detectedOffsetHex}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">RAM Lettore pread()</span>
              <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                {xisoResult.estimatedRamFootprintMb.toFixed(1)} MB (No mmap)
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Destinazione Sandbox iOS</span>
              <span className="font-mono text-slate-900">Documents/MarathonRecomp/game</span>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>Offset supportati in iso_file_system.cpp:</span>
          {XBOX360_XISO_OFFSETS.map((o) => (
            <span key={o.hex} className="font-mono text-slate-700">
              {o.hex}
            </span>
          ))}
        </div>
      </section>

      {/* Step 2: Separate DLC Packs */}
      <section aria-labelledby="step2-heading" className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
          <div>
            <p className="text-xs font-medium text-blue-700">Step 2 · WizardPage::SelectDLC</p>
            <h2 id="step2-heading" className="text-lg font-bold text-slate-900 mt-0.5">
              Importazione Separata DLC Xbox 360
            </h2>
          </div>
          <div className="text-sm text-slate-600 tabular-nums" data-testid="selected-dlc-count">
            Selezionati: <span className="font-bold text-slate-900">{selectedDlcIds.length}</span> /{' '}
            {MARATHON_DLC_CATALOG.length} pacchetti
          </div>
        </div>

        <p className="text-sm text-slate-600">
          Come richiesto, i DLC non vengono mescolati all'XISO del gioco base: il launcher iOS attiva la modalità{' '}
          <span className="font-mono text-slate-800">MARATHON_IOS_PICKER_MODE_DLC_SEPARATE</span> con selezione multipla
          STFS/XContent o cartelle, validati tramite <span className="font-mono text-slate-800">Installer::parseDLC()</span>.
        </p>

        <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
          {MARATHON_DLC_CATALOG.map((dlc) => {
            const active = selectedDlcIds.includes(dlc.id);
            return (
              <label
                key={dlc.id}
                className={`flex items-center justify-between gap-4 px-4 py-3 cursor-pointer transition-colors ${
                  active ? 'bg-blue-50/50' : 'bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleDlc(dlc.id)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{dlc.title}</span>
                      <span className="text-xs font-mono text-slate-500">{dlc.enumName}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{dlc.subtitle}</p>
                    <p className="text-xs font-mono text-slate-400 mt-0.5 truncate">
                      {dlc.targetSubDir}/{dlc.validationFile}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-mono text-slate-600 tabular-nums block">
                    {dlc.sizeLabel}
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      active ? 'text-blue-700' : 'text-slate-400'
                    }`}
                  >
                    {active ? 'In coda' : 'Opzionale'}
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      {/* Step 3: iOS Mod Manager Profile Builder */}
      <section aria-labelledby="step3-heading" className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
          <div>
            <p className="text-xs font-medium text-blue-700">Step 3 · Documents/MarathonRecomp/mods</p>
            <h2 id="step3-heading" className="text-lg font-bold text-slate-900 mt-0.5">
              Generatore Profilo Mod iOS (Default.json)
            </h2>
          </div>
          <button
            type="button"
            onClick={handleCopyModJson}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedJson ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                JSON Copiato
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                Copia Default.json
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-3">
            <div className="flex gap-2">
              <label htmlFor="new-mod-folder" className="sr-only">
                Nome cartella mod
              </label>
              <input
                id="new-mod-folder"
                type="text"
                value={newModFolder}
                onChange={(e) => setNewModFolder(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddMod();
                }}
                placeholder="Aggiungi cartella mod (es. Project06_Physics)..."
                className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
              <button
                type="button"
                onClick={handleAddMod}
                className="px-3.5 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Aggiungi
              </button>
            </div>

            <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
              {mods.map((mod) => (
                <div key={mod.folderName} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <label className="flex items-center gap-3 cursor-pointer min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={mod.enabled}
                      onChange={() => toggleMod(mod.folderName)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                    />
                    <span className="min-w-0">
                      <span className="text-sm font-medium text-slate-900 block truncate">{mod.name}</span>
                      <span className="text-xs font-mono text-slate-500 block truncate">{mod.folderName}</span>
                    </span>
                  </label>
                  <button
                    type="button"
                    aria-label={`Rimuovi mod ${mod.folderName}`}
                    onClick={() => removeMod(mod.folderName)}
                    className="p-1.5 text-slate-400 hover:text-red-700 rounded transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#0B1220] text-slate-100 rounded-xl border border-slate-800 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span className="inline-flex items-center gap-2">
                <HardDrive className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                Documents/MarathonRecomp/profiles/Default.json
              </span>
              <span className="inline-flex items-center gap-1 text-slate-300 tabular-nums">
                <PackagePlus className="w-3.5 h-3.5" aria-hidden="true" />
                {mods.filter((m) => m.enabled).length} attive
              </span>
            </div>
            <pre
              data-testid="mod-profile-json"
              className="p-4 text-xs leading-relaxed overflow-x-auto font-mono text-slate-200"
            >
              {defaultProfileJson}
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
}
