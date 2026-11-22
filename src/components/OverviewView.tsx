import { useState } from 'react';
import { ArrowRight, Check, FileCode2, FolderGit2, ShieldCheck, Sliders } from 'lucide-react';
import type { PortBuildConfig } from '../utils/portGenerator';

export type WorkspaceTab = 'overview' | 'config' | 'xiso-dlc' | 'explorer' | 'secrets';

interface OverviewViewProps {
  config: PortBuildConfig;
  fileCount: number;
  totalLines: number;
  onNavigate: (tab: WorkspaceTab, filePath?: string) => void;
}

const APP_ICON_URL = '/src/assets/images/marathon_ios_icon_1795382084846.jpg';

const COMPARISON_ROWS = [
  {
    feature: 'Base Upstream',
    cleanRoom: 'sonicnext-dev/MarathonRecomp v1.0.0 (clone fresco in CI)',
    devZero: 'Fork statico non aggiornato alla v1.0.0',
  },
  {
    feature: 'Struttura Repository',
    cleanRoom: 'Overlay pulito stile edgyios (16 file iOS + script patch)',
    devZero: 'Fork monolitico da 786+ file difficile da mantenere',
  },
  {
    feature: 'Installazione Gioco Base',
    cleanRoom: 'Selezione diretta file .xiso / .iso nel launcher (lettore streaming pread)',
    devZero: 'Richiede estrazione manuale o limiti mmap su immagini da 6+ GB',
  },
  {
    feature: 'Installazione DLC',
    cleanRoom: 'Step separato nativo per tutti i 7 DLC Xbox 360 nel launcher',
    devZero: 'Flusso misto legato a cartelle desktop estratte',
  },
  {
    feature: 'Build Cloud Senza Mac',
    cleanRoom: 'GitHub Actions macOS-15 + Secrets effimeri + audit copyright',
    devZero: 'Richiede Mac locale con Xcode e script manuali',
  },
  {
    feature: 'Sideload & Runtime',
    cleanRoom: 'arm64 nativo (-fPIC -Wl,-pie) per Feather e LiveContainer',
    devZero: 'Target Xcode manuale orientato a provisioning locale',
  },
];

export function OverviewView({
  config,
  fileCount,
  totalLines,
  onNavigate,
}: OverviewViewProps) {
  const [iconFailed, setIconFailed] = useState(false);

  return (
    <div className="space-y-8">
      {/* Primary Hero Panel */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            {iconFailed ? (
              <div
                aria-hidden="true"
                className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center text-amber-400 font-bold text-xl shrink-0"
              >
                06
              </div>
            ) : (
              <img
                src={APP_ICON_URL}
                alt={`Icona iOS di ${config.appName}`}
                referrerPolicy="no-referrer"
                onError={() => setIconFailed(true)}
                className="w-20 h-20 rounded-2xl object-cover border border-slate-200 shrink-0"
              />
            )}

            <div className="space-y-2 max-w-2xl">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span>MarathonRecomp v1.0.0</span>
                <span aria-hidden="true">·</span>
                <span>iOS {config.deploymentTarget}+ arm64</span>
                <span aria-hidden="true">·</span>
                <span>
                  {config.rendererBackend === 'metal3-native'
                    ? 'Metal 3 Nativo'
                    : 'MoltenVK Metal 3'}
                </span>
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">
                {config.appName} — Porting Nativo iOS da Zero
              </h1>
              <p className="text-sm lg:text-base text-slate-600 leading-relaxed">
                Architettura overlay pulita ispirata a <span className="font-mono text-slate-800">hiperema95-ctrl/edgyios</span>:
                clona la v1.0.0 ufficiale in GitHub Actions, scarica in modo effimero i binari privati tramite Secrets,
                importa direttamente il file <span className="font-mono text-slate-800">.xiso</span> nel launcher senza
                scompattarlo su PC e mantiene i 7 DLC separati.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('config')}
              className="px-4 py-2.5 text-sm font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600"
            >
              Configura Build
            </button>
            <button
              type="button"
              onClick={() => onNavigate('explorer')}
              className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600"
            >
              Ispeziona File
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Single-row summary metrics separated by hairline dividers */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mt-8 pt-6 border-t border-slate-200">
          <div>
            <p className="text-xs text-slate-500">File Generati nel Repo</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{fileCount}</p>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">{totalLines.toLocaleString('it-IT')} righe di codice</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Asset Protetti Inclusi</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">0 byte</p>
            <p className="mt-0.5 text-xs text-slate-500">Blocco automatico .gitignore + CI</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Importazione Base Game</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">XISO Diretto</p>
            <p className="mt-0.5 text-xs text-slate-500">Streaming pread() · &lt; 4 MB RAM</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Pacchetti DLC Supportati</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">7 separati</p>
            <p className="mt-0.5 text-xs text-slate-500">Very Hard · Amigo · Boss Attack</p>
          </div>
        </div>
      </section>

      {/* Quick Navigation Workflows */}
      <section aria-labelledby="workflows-heading" className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 id="workflows-heading" className="text-lg font-bold text-slate-900">
            Flusso di Lavoro del Porting
          </h2>
          <span className="text-xs text-slate-500">Pronto per push su GitHub pubblico</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => onNavigate('config')}
            className="text-left bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-5 transition-colors cursor-pointer group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-blue-700">01. Configura Target</span>
              <Sliders className="w-4 h-4 text-slate-400 group-hover:text-blue-700 transition-colors" aria-hidden="true" />
            </div>
            <h3 className="mt-2 text-base font-bold text-slate-900">Parametri Build & Secrets</h3>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
              Imposta Bundle ID, target iOS, backend Metal 3 e modalità GitHub Secrets per default.xex e shader.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('xiso-dlc')}
            className="text-left bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-5 transition-colors cursor-pointer group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-blue-700">02. Verifica Launcher</span>
              <FolderGit2 className="w-4 h-4 text-slate-400 group-hover:text-blue-700 transition-colors" aria-hidden="true" />
            </div>
            <h3 className="mt-2 text-base font-bold text-slate-900">Flusso XISO Diretto & DLC</h3>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
              Testa la validazione dell'header XISO senza estrazione PC e la gestione separata dei 7 DLC e delle mod.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('secrets')}
            className="text-left bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-5 transition-colors cursor-pointer group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-blue-700">03. Pubblica & Compila</span>
              <ShieldCheck className="w-4 h-4 text-slate-400 group-hover:text-blue-700 transition-colors" aria-hidden="true" />
            </div>
            <h3 className="mt-2 text-base font-bold text-slate-900">Guida Secrets & Sideload</h3>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
              Checklist passo-passo per repo pubblico, configurazione Secrets e installazione IPA su Feather o LiveContainer.
            </p>
          </button>
        </div>
      </section>

      {/* Architecture Comparison Table */}
      <section aria-labelledby="comparison-heading" className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 id="comparison-heading" className="text-lg font-bold text-slate-900">
              Confronto Architetturale: Nuovo Porting vs Fork Precedente
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Perché l'approccio overlay clean-room supera i limiti di DevZer0D4Y/MarathonRecompilediOS
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('explorer', 'scripts/apply_ios_port.sh')}
            className="text-sm font-medium text-blue-700 hover:text-blue-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileCode2 className="w-4 h-4" aria-hidden="true" />
            Vedi apply_ios_port.sh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th scope="col" className="py-3 px-6 w-1/4">Componente</th>
                <th scope="col" className="py-3 px-6 w-2/5 text-blue-800">Nuovo Porting Clean-Room (v1.0.0)</th>
                <th scope="col" className="py-3 px-6 w-1/3">DevZer0D4Y/MarathonRecompilediOS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.feature} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 px-6 font-medium text-slate-900">{row.feature}</td>
                  <td className="py-3.5 px-6 text-slate-800">
                    <span className="inline-flex items-start gap-2">
                      <Check className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" aria-hidden="true" />
                      <span>{row.cleanRoom}</span>
                    </span>
                  </td>
                  <td className="py-3.5 px-6 text-slate-500">{row.devZero}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
