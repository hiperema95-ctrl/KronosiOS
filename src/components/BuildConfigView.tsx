import { AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import {
  DEFAULT_BUILD_CONFIG,
  validateBuildConfig,
  type PortBuildConfig,
} from '../utils/portGenerator';

interface BuildConfigViewProps {
  config: PortBuildConfig;
  onChange: (next: PortBuildConfig) => void;
  onOpenExplorer: () => void;
}

export function BuildConfigView({
  config,
  onChange,
  onOpenExplorer,
}: BuildConfigViewProps) {
  const issues = validateBuildConfig(config);
  const issueByField = new Map(issues.map((i) => [i.field, i.message]));

  const update = <K extends keyof PortBuildConfig>(key: K, value: PortBuildConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Configurazione Build iOS & GitHub Actions
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Ogni modifica aggiorna in tempo reale <span className="font-mono">Info.plist</span>,{' '}
            <span className="font-mono">Entitlements.plist</span>,{' '}
            <span className="font-mono">build-ios-ipa.yml</span> e{' '}
            <span className="font-mono">apply_ios_port.sh</span>.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onChange(DEFAULT_BUILD_CONFIG)}
          className="px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          Ripristina Predefiniti
        </button>
      </div>

      {/* Validation Banner */}
      {issues.length > 0 ? (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 text-sm text-red-900"
        >
          <AlertCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-semibold">
              Correggi {issues.length} {issues.length === 1 ? 'campo' : 'campi'} prima di esportare lo ZIP
            </p>
            <ul className="mt-1 list-disc list-inside text-red-800 space-y-0.5">
              {issues.map((issue) => (
                <li key={issue.field}>{issue.message}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-sm text-emerald-900">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>
              Configurazione valida per <span className="font-mono font-medium">{config.bundleId}</span> (iOS{' '}
              {config.deploymentTarget}+ · arm64).
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenExplorer}
            className="text-xs font-semibold text-emerald-800 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            Verifica file generati
          </button>
        </div>
      )}

      {/* Identity & Upstream Grid */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <div>
          <h2 className="text-base font-bold text-slate-900">Identità App iOS & Sorgente Upstream</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Metadati del bundle .ipa e riferimento al repository ufficiale v1.0.0
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label htmlFor="cfg-app-name" className="block text-sm font-medium text-slate-800 mb-1.5">
              Nome Applicazione iOS
            </label>
            <input
              id="cfg-app-name"
              type="text"
              value={config.appName}
              onChange={(e) => update('appName', e.target.value)}
              className={`w-full px-3.5 py-2 text-sm bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 ${
                issueByField.has('appName') ? 'border-red-400' : 'border-slate-300'
              }`}
            />
            {issueByField.has('appName') && (
              <p className="mt-1 text-xs text-red-700">{issueByField.get('appName')}</p>
            )}
          </div>

          <div>
            <label htmlFor="cfg-bundle-id" className="block text-sm font-medium text-slate-800 mb-1.5">
              Bundle Identifier
            </label>
            <input
              id="cfg-bundle-id"
              type="text"
              value={config.bundleId}
              onChange={(e) => update('bundleId', e.target.value)}
              className={`w-full px-3.5 py-2 text-sm font-mono bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 ${
                issueByField.has('bundleId') ? 'border-red-400' : 'border-slate-300'
              }`}
            />
            {issueByField.has('bundleId') && (
              <p className="mt-1 text-xs text-red-700">{issueByField.get('bundleId')}</p>
            )}
          </div>

          <div>
            <label htmlFor="cfg-app-version" className="block text-sm font-medium text-slate-800 mb-1.5">
              Versione Release (.ipa)
            </label>
            <input
              id="cfg-app-version"
              type="text"
              value={config.appVersion}
              onChange={(e) => update('appVersion', e.target.value)}
              className={`w-full px-3.5 py-2 text-sm font-mono bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 ${
                issueByField.has('appVersion') ? 'border-red-400' : 'border-slate-300'
              }`}
            />
            {issueByField.has('appVersion') && (
              <p className="mt-1 text-xs text-red-700">{issueByField.get('appVersion')}</p>
            )}
          </div>

          <div>
            <label htmlFor="cfg-ios-target" className="block text-sm font-medium text-slate-800 mb-1.5">
              iOS Deployment Target
            </label>
            <select
              id="cfg-ios-target"
              value={config.deploymentTarget}
              onChange={(e) =>
                update('deploymentTarget', e.target.value as PortBuildConfig['deploymentTarget'])
              }
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            >
              <option value="17.0">iOS 17.0+ (Consigliato — massima compatibilità)</option>
              <option value="17.4">iOS 17.4+</option>
              <option value="18.0">iOS 18.0+ (iPhone 15/16 &amp; iPadOS 18)</option>
            </select>
          </div>

          <div>
            <label htmlFor="cfg-upstream-url" className="block text-sm font-medium text-slate-800 mb-1.5">
              Repository Upstream
            </label>
            <input
              id="cfg-upstream-url"
              type="url"
              value={config.upstreamRepoUrl}
              onChange={(e) => update('upstreamRepoUrl', e.target.value)}
              className={`w-full px-3.5 py-2 text-sm font-mono bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 ${
                issueByField.has('upstreamRepoUrl') ? 'border-red-400' : 'border-slate-300'
              }`}
            />
            {issueByField.has('upstreamRepoUrl') && (
              <p className="mt-1 text-xs text-red-700">{issueByField.get('upstreamRepoUrl')}</p>
            )}
          </div>

          <div>
            <label htmlFor="cfg-upstream-ref" className="block text-sm font-medium text-slate-800 mb-1.5">
              Branch / Tag Upstream (v1.0.0)
            </label>
            <input
              id="cfg-upstream-ref"
              type="text"
              value={config.upstreamRef}
              onChange={(e) => update('upstreamRef', e.target.value)}
              className={`w-full px-3.5 py-2 text-sm font-mono bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 ${
                issueByField.has('upstreamRef') ? 'border-red-400' : 'border-slate-300'
              }`}
            />
            {issueByField.has('upstreamRef') && (
              <p className="mt-1 text-xs text-red-700">{issueByField.get('upstreamRef')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Compiler, Renderer & Secrets Options */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <div>
          <h2 className="text-base font-bold text-slate-900">Toolchain Grafica, Secrets CI e Sideload</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configura come GitHub Actions compila gli shader Xbox 360 e recupera i file privati in sicurezza
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label htmlFor="cfg-renderer" className="block text-sm font-medium text-slate-800 mb-1.5">
              Backend Grafico GPU
            </label>
            <select
              id="cfg-renderer"
              value={config.rendererBackend}
              onChange={(e) =>
                update('rendererBackend', e.target.value as PortBuildConfig['rendererBackend'])
              }
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            >
              <option value="metal3-native">Metal 3 Nativo via Plume (Consigliato)</option>
              <option value="moltenvk-metal3">Vulkan -&gt; MoltenVK -&gt; Metal 3</option>
            </select>
          </div>

          <div>
            <label htmlFor="cfg-secrets-mode" className="block text-sm font-medium text-slate-800 mb-1.5">
              Modalità GitHub Actions Secrets
            </label>
            <select
              id="cfg-secrets-mode"
              value={config.secretMode}
              onChange={(e) =>
                update('secretMode', e.target.value as PortBuildConfig['secretMode'])
              }
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            >
              <option value="single-archive">Archivio Unico (GAME_FILES_ARCHIVE_URL)</option>
              <option value="individual-secrets">3 Secret Separati (DEFAULT_XEX_URL + Shader)</option>
            </select>
          </div>

          <div>
            <label htmlFor="cfg-installer" className="block text-sm font-medium text-slate-800 mb-1.5">
              Target Sideload iOS
            </label>
            <select
              id="cfg-installer"
              value={config.targetInstaller}
              onChange={(e) =>
                update('targetInstaller', e.target.value as PortBuildConfig['targetInstaller'])
              }
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            >
              <option value="both">Feather + LiveContainer (-fPIC -Wl,-pie)</option>
              <option value="feather">Solo Feather (Standalone)</option>
              <option value="livecontainer">Solo LiveContainer</option>
            </select>
          </div>
        </div>

        {/* Feature Checkboxes */}
        <div className="pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enableDirectXisoImport}
              onChange={(e) => update('enableDirectXisoImport', e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <span className="text-sm">
              <span className="font-semibold text-slate-900 block">
                Importazione Diretta .xiso / .iso (Stile edgyios)
              </span>
              <span className="text-xs text-slate-500">
                Lettore streaming pread() + rilevazione istantanea in Documenti/MarathonRecomp senza scompattare su PC.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enable120HzProMotion}
              onChange={(e) => update('enable120HzProMotion', e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <span className="text-sm">
              <span className="font-semibold text-slate-900 block">120Hz ProMotion (CADisableMinimumFrameDuration)</span>
              <span className="text-xs text-slate-500">
                Abilita frame rate fino a 120 FPS su iPhone Pro e iPad Pro con compositing a latenza ridotta.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enableIncreasedMemoryLimit}
              onChange={(e) => update('enableIncreasedMemoryLimit', e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <span className="text-sm">
              <span className="font-semibold text-slate-900 block">Increased Memory Limit &amp; Extended Virtual Addressing</span>
              <span className="text-xs text-slate-500">
                Richiede gli entitlement Apple necessari per lo spazio di indirizzamento guest Xbox 360.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enableVirtualGamepad}
              onChange={(e) => update('enableVirtualGamepad', e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <span className="text-sm">
              <span className="font-semibold text-slate-900 block">Controller Virtuale Soleanna + CoreHaptics</span>
              <span className="text-xs text-slate-500">
                Overlay touch vettoriale Xbox 360 con Taptic Engine e auto-hide automatico con gamepad fisici.
              </span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
