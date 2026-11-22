import { useState } from 'react';
import { Check, Copy, Link2, Lock, ShieldAlert, Smartphone } from 'lucide-react';
import { convertGoogleDriveUrl, type PortBuildConfig } from '../utils/portGenerator';

interface SecretsGuideViewProps {
  config: PortBuildConfig;
}

interface SecretRow {
  name: string;
  required: string;
  sourcePath: string;
  purpose: string;
}

export function SecretsGuideView({ config }: SecretsGuideViewProps) {
  const [copiedSecret, setCopiedSecret] = useState<string | null>(null);
  const [driveInput, setDriveInput] = useState(
    'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/view?usp=sharing'
  );
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({
    extract: false,
    secrets: false,
    action: false,
    sideload: false,
  });

  const driveConversion = convertGoogleDriveUrl(driveInput);

  const secretsList: SecretRow[] =
    config.secretMode === 'single-archive'
      ? [
          {
            name: 'GAME_FILES_ARCHIVE_URL',
            required: 'Obbligatorio (Archivio Unico)',
            sourcePath: 'archivio .zip con default.xex + shader.arc + shader_lt.arc',
            purpose:
              'Link diretto privato scaricato nella VM effimera di GitHub Actions e cancellato prima del packaging .ipa.',
          },
        ]
      : [
          {
            name: 'DEFAULT_XEX_URL',
            required: 'Obbligatorio',
            sourcePath: 'Root disco Xbox 360 -> default.xex',
            purpose: 'Compilato staticamente in arm64 C++ da XenonRecomp (146 unità ppc_recomp).',
          },
          {
            name: 'SHADER_ARC_URL',
            required: 'Obbligatorio',
            sourcePath: '/xenon/archives/shader.arc',
            purpose: 'Estratto da u8extract e ricompilato in Metal AIR iOS da XenosRecomp.',
          },
          {
            name: 'SHADER_LT_ARC_URL',
            required: 'Obbligatorio',
            sourcePath: '/xenon/archives/shader_lt.arc',
            purpose: 'Archivio shader lighting estratto e ricompilato insieme a shader.arc.',
          },
        ];

  const copyText = async (value: string, key = value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedSecret(key);
      setTimeout(() => setCopiedSecret(null), 1600);
    } catch {
      // Ignore clipboard failure
    }
  };

  const toggleStep = (id: string) => {
    setCheckedSteps((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Sicurezza Repo Pubblico, GitHub Secrets &amp; Sideload iOS
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Guida operativa per compilare <span className="font-mono">{config.appName}</span> (
          <span className="font-mono">{config.bundleId}</span>) su repository GitHub pubblico senza mai esporre
          eseguibili o shader protetti da copyright.
        </p>
      </div>

      {/* Crucial difference from edgyios (default.xbe vs default.xex + shaders) */}
      <section className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3.5">
        <ShieldAlert className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-1.5 text-sm text-amber-950">
          <h2 className="font-bold">Differenza fondamentale rispetto a edgyios (Xbox OG vs Xbox 360)</h2>
          <p className="leading-relaxed">
            In <span className="font-mono font-medium">edgyios</span> (Shadow the Hedgehog per Xbox Originale) bastava un solo secret{' '}
            <span className="font-mono font-medium">DEFAULT_XBE_URL</span>. In{' '}
            <span className="font-mono font-medium">MarathonRecomp v1.0.0</span> (Sonic &apos;06 per Xbox 360),{' '}
            <span className="font-mono">MarathonRecompLib/CMakeLists.txt</span> richiede <strong>3 file privati</strong>:
            <span className="font-mono font-medium"> default.xex</span> (root del disco),{' '}
            <span className="font-mono font-medium">shader.arc</span> e{' '}
            <span className="font-mono font-medium">shader_lt.arc</span> (da <span className="font-mono">/xenon/archives/</span>).
            Puoi caricarli comodamente in un unico zip privato usando{' '}
            <span className="font-mono font-medium">GAME_FILES_ARCHIVE_URL</span> oppure come 3 secret separati.
          </p>
        </div>
      </section>

      {/* Interactive Google Drive Link Converter */}
      <section aria-labelledby="gdrive-heading" className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-blue-700" aria-hidden="true" />
          <h2 id="gdrive-heading" className="text-base font-bold text-slate-900">
            Convertitore Link Google Drive per GitHub Secret
          </h2>
        </div>
        <p className="text-sm text-slate-600">
          Carica il tuo <span className="font-mono">.zip</span> (contenente <span className="font-mono">default.xex</span>,{' '}
          <span className="font-mono">shader.arc</span>, <span className="font-mono">shader_lt.arc</span>) su Google Drive,
          imposta <strong>Condividi -&gt; Chiunque abbia il link (Visualizzatore)</strong> e incolla il link qui sotto per
          ottenere il formato diretto compatibile con <span className="font-mono">curl</span> (anche se il nostro workflow
          normalizza già automaticamente i link Drive).
        </p>

        <div>
          <label htmlFor="gdrive-url-input" className="block text-xs font-medium text-slate-700 mb-1.5">
            Link di condivisione Google Drive
          </label>
          <input
            id="gdrive-url-input"
            type="url"
            value={driveInput}
            onChange={(e) => setDriveInput(e.target.value)}
            placeholder="https://drive.google.com/file/d/ID_FILE/view?usp=sharing"
            className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
        </div>

        {driveConversion.valid && driveConversion.directUrl ? (
          <div
            data-testid="gdrive-converted-box"
            className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="text-emerald-700 font-semibold">Formato diretto pronto per il Secret</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">ID: {driveConversion.fileId}</span>
              </div>
              <code className="block text-xs font-mono text-slate-900 break-all">
                {driveConversion.directUrl}
              </code>
            </div>
            <button
              type="button"
              onClick={() => copyText(driveConversion.directUrl!, 'gdrive-direct')}
              className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer self-start md:self-center"
            >
              {copiedSecret === 'gdrive-direct' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  URL Copiato
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  Copia URL Diretto
                </>
              )}
            </button>
          </div>
        ) : (
          <p role="alert" className="text-xs text-red-700">
            {driveConversion.error}
          </p>
        )}
      </section>

      {/* Secrets Table */}
      <section aria-labelledby="secrets-table-heading" className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-blue-700" aria-hidden="true" />
            <h2 id="secrets-table-heading" className="text-base font-bold text-slate-900">
              GitHub Actions Secrets Richiesti (Settings -&gt; Secrets -&gt; Actions)
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Modalità attiva:{' '}
            {config.secretMode === 'single-archive' ? 'Archivio Unico' : '3 Secret Separati'}
          </span>
        </div>

        <div className="divide-y divide-slate-200">
          {secretsList.map((secret) => (
            <div
              key={secret.name}
              className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-sm font-semibold text-slate-900 font-mono">{secret.name}</code>
                  <span className="text-xs text-slate-500">· {secret.required}</span>
                </div>
                <p className="text-xs font-mono text-slate-600">{secret.sourcePath}</p>
                <p className="text-sm text-slate-600">{secret.purpose}</p>
              </div>
              <button
                type="button"
                onClick={() => copyText(secret.name)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer self-start md:self-center"
              >
                {copiedSecret === secret.name ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                    Copiato
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    Copia nome
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive Launch Checklist */}
      <section aria-labelledby="checklist-heading" className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="checklist-heading" className="text-base font-bold text-slate-900">
            Checklist Pubblicazione &amp; Sideload
          </h2>
          <span className="text-xs text-slate-500 tabular-nums">
            {Object.values(checkedSteps).filter(Boolean).length} / 4 completati
          </span>
        </div>

        <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
          {[
            {
              id: 'extract',
              title: '01. Estrai i 3 file build dalla tua copia Xbox 360',
              detail:
                'Prendi default.xex, xenon/archives/shader.arc e xenon/archives/shader_lt.arc dal tuo dump legale e comprimili in un file .zip privato (non committarlo mai nel repo!).',
            },
            {
              id: 'secrets',
              title: '02. Configura i Secrets su GitHub (Repo Pubblico sicuro)',
              detail:
                'Vai su GitHub -> Settings -> Secrets and variables -> Actions -> New repository secret e incolla l’URL diretto privato. Lo step 2 della CI verifica automaticamente che nessun file .xex/.xiso/.arc sia stato committato.',
            },
            {
              id: 'action',
              title: '03. Avvia la Workflow Action macOS-15 (No Mac richiesto)',
              detail:
                'Apri Actions -> Build ' +
                config.appName +
                ' iOS IPA -> Run workflow. Al termine scarica l’artefatto ' +
                config.appName +
                '-v' +
                config.appVersion +
                '-iOS-arm64.ipa.',
            },
            {
              id: 'sideload',
              title: '04. Installa su iPhone/iPad (Feather o LiveContainer) & Inserisci XISO + DLC',
              detail:
                'Firma e installa l’.ipa con Feather o LiveContainer. Al primo avvio seleziona direttamente il file .xiso nello step Gioco Base, poi importa i DLC desiderati nello step separato Select DLC.',
            },
          ].map((step) => (
            <label
              key={step.id}
              className="flex items-start gap-3.5 px-4 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors"
            >
              <input
                type="checkbox"
                checked={checkedSteps[step.id]}
                onChange={() => toggleStep(step.id)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span className="text-sm">
                <span
                  className={`font-semibold block ${
                    checkedSteps[step.id] ? 'line-through text-slate-400' : 'text-slate-900'
                  }`}
                >
                  {step.title}
                </span>
                <span className="text-xs text-slate-600 mt-0.5 block leading-relaxed">{step.detail}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="pt-2 flex items-center gap-2 text-xs text-slate-500">
          <Smartphone className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
          <span>
            Compatibilità testata in build config: iOS {config.deploymentTarget}+ · arm64 (Zero JIT) · Feather &amp;
            LiveContainer (`-fPIC -Wl,-pie`).
          </span>
        </div>
      </section>
    </div>
  );
}
