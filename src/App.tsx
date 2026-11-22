import { useMemo, useState } from 'react';
import {
  Disc3,
  Download,
  FileCode2,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  Sliders,
  X,
} from 'lucide-react';
import { BuildConfigView } from './components/BuildConfigView';
import { OverviewView, type WorkspaceTab } from './components/OverviewView';
import { RepoExplorerView } from './components/RepoExplorerView';
import { SecretsGuideView } from './components/SecretsGuideView';
import { XisoDlcFlowView } from './components/XisoDlcFlowView';
import {
  DEFAULT_BUILD_CONFIG,
  generatePortRepository,
  validateBuildConfig,
  type PortBuildConfig,
} from './utils/portGenerator';
import { createZipBlob } from './utils/zipBuilder';

interface NavItem {
  id: WorkspaceTab;
  label: string;
  breadcrumb: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Panoramica', breadcrumb: 'Panoramica & Architettura', icon: LayoutDashboard },
  { id: 'config', label: 'Configurazione Build', breadcrumb: 'Configurazione Build', icon: Sliders },
  { id: 'xiso-dlc', label: 'Flusso XISO & DLC', breadcrumb: 'Launcher XISO & DLC', icon: Disc3 },
  { id: 'explorer', label: 'Esplora Repository', breadcrumb: 'Esplora Repository', icon: FileCode2 },
  { id: 'secrets', label: 'Secrets & Sideload', breadcrumb: 'Secrets & Sideload', icon: ShieldCheck },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [explorerFilePath, setExplorerFilePath] = useState<string | undefined>(undefined);
  const [config, setConfig] = useState<PortBuildConfig>(DEFAULT_BUILD_CONFIG);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const generatedFiles = useMemo(() => generatePortRepository(config), [config]);
  const validationIssues = useMemo(() => validateBuildConfig(config), [config]);

  const totalLines = useMemo(
    () => generatedFiles.reduce((acc, f) => acc + f.content.split('\n').length, 0),
    [generatedFiles]
  );

  const currentNav = NAV_ITEMS.find((item) => item.id === activeTab) ?? NAV_ITEMS[0];

  const handleDownloadZip = () => {
    if (validationIssues.length > 0) {
      setActiveTab('config');
      setExportNotice('Correggi gli errori di configurazione prima di esportare lo ZIP.');
      setTimeout(() => setExportNotice(null), 3500);
      return;
    }

    const blob = createZipBlob(
      generatedFiles.map((f) => ({
        path: f.path,
        content: f.content,
        executable: f.executable,
      }))
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${config.appName.toLowerCase().replace(/\s+/g, '-')}-ios-port-v${config.appVersion}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setExportNotice(`Esportato ${config.appName} (${generatedFiles.length} file clean-room) in formato .zip.`);
    setTimeout(() => setExportNotice(null), 3500);
  };

  const selectTab = (tab: WorkspaceTab, filePath?: string) => {
    setExplorerFilePath(filePath);
    setActiveTab(tab);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-white border-r border-slate-200 sticky top-0 h-screen">
        <div className="px-6 py-5 border-b border-slate-200">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              selectTab('overview');
            }}
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap block"
          >
            MarathonRecomp iOS
          </a>
        </div>

        <nav aria-label="Navigazione principale" className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
          <p className="font-mono text-slate-700 truncate">{config.bundleId}</p>
          <p className="tabular-nums">
            v{config.appVersion} · iOS {config.deploymentTarget}+ · {generatedFiles.length} file
          </p>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            aria-hidden="true"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative z-50 w-64 max-w-[80vw] bg-white h-full border-r border-slate-200 flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <span className="text-base font-bold text-slate-900 whitespace-nowrap">
                MarathonRecomp iOS
              </span>
              <button
                type="button"
                aria-label="Chiudi menu di navigazione"
                onClick={() => setMobileNavOpen(false)}
                className="p-2 text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <nav aria-label="Menu mobile" className="flex-1 px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectTab(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-blue-50 text-blue-800'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb left, 1 primary action right */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Apri menu di navigazione"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 hidden sm:inline whitespace-nowrap">
                MarathonRecomp iOS
              </span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 truncate">{currentNav.breadcrumb}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleDownloadZip}
              className="px-3.5 py-2 text-xs sm:text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>Scarica ZIP Porting</span>
            </button>
          </div>
        </header>

        {/* Export Feedback Banner */}
        {exportNotice && (
          <div
            role="status"
            aria-live="polite"
            className="bg-slate-900 text-white text-xs sm:text-sm px-6 py-2.5 flex items-center justify-between"
          >
            <span>{exportNotice}</span>
            <button
              type="button"
              aria-label="Chiudi notifica"
              onClick={() => setExportNotice(null)}
              className="text-slate-300 hover:text-white ml-4 cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-8">
          {activeTab === 'overview' && (
            <OverviewView
              config={config}
              fileCount={generatedFiles.length}
              totalLines={totalLines}
              onNavigate={selectTab}
            />
          )}
          {activeTab === 'config' && (
            <BuildConfigView
              config={config}
              onChange={setConfig}
              onOpenExplorer={() => selectTab('explorer')}
            />
          )}
          {activeTab === 'xiso-dlc' && <XisoDlcFlowView />}
          {activeTab === 'explorer' && (
            <RepoExplorerView
              key={explorerFilePath ?? 'default'}
              files={generatedFiles}
              initialSelectedPath={explorerFilePath}
            />
          )}
          {activeTab === 'secrets' && <SecretsGuideView config={config} />}
        </main>
      </div>
    </div>
  );
}
