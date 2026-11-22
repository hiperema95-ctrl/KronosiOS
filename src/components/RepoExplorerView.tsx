import { useMemo, useState } from 'react';
import { Check, Copy, Download, FileCode2, Search } from 'lucide-react';
import type { FileCategory, GeneratedRepositoryFile } from '../utils/portGenerator';

interface RepoExplorerViewProps {
  files: GeneratedRepositoryFile[];
  initialSelectedPath?: string;
}

const CATEGORY_TABS: { id: 'all' | FileCategory; label: string }[] = [
  { id: 'all', label: 'Tutti' },
  { id: 'ci', label: 'GitHub CI' },
  { id: 'script', label: 'Patch Script' },
  { id: 'ios-native', label: 'Nativo iOS' },
  { id: 'cmake', label: 'CMake' },
  { id: 'docs', label: 'Docs & Legal' },
];

export function RepoExplorerView({ files, initialSelectedPath }: RepoExplorerViewProps) {
  const [category, setCategory] = useState<'all' | FileCategory>('all');
  const [query, setQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState<string>(
    initialSelectedPath || files[0]?.path || ''
  );
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const filteredFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((file) => {
      if (category !== 'all' && file.category !== category) return false;
      if (!q) return true;
      return (
        file.path.toLowerCase().includes(q) ||
        file.title.toLowerCase().includes(q) ||
        file.description.toLowerCase().includes(q)
      );
    });
  }, [files, category, query]);

  const activeFile = useMemo(() => {
    const exact = filteredFiles.find((f) => f.path === selectedPath);
    return exact ?? filteredFiles[0] ?? null;
  }, [filteredFiles, selectedPath]);

  const handleCopyFile = async () => {
    if (!activeFile) return;
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopiedPath(activeFile.path);
      setTimeout(() => setCopiedPath(null), 1800);
    } catch {
      // Ignore clipboard failure in headless contexts
    }
  };

  const handleDownloadSingleFile = () => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.path.split('/').pop() || 'file.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const codeLines = activeFile ? activeFile.content.split('\n') : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Esplora Repository Clean-Room
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Ispeziona tutti i {files.length} file pronti per il push su GitHub pubblico (già salvati anche nella root del progetto).
        </p>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategory(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                category === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-80">
          <label htmlFor="repo-search" className="sr-only">
            Cerca file nel repository
          </label>
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="repo-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtra file (es. nfd_ios, Info.plist, yml)..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
        </div>
      </div>

      {/* Split Explorer + Code Viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* File List */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>Albero File</span>
            <span className="tabular-nums">{filteredFiles.length} file</span>
          </div>

          {filteredFiles.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <p className="text-sm font-medium text-slate-900">Nessun file trovato</p>
              <p className="text-xs text-slate-500">Prova a rimuovere il filtro di ricerca o seleziona Tutti.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setCategory('all');
                }}
                className="mt-2 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md cursor-pointer"
              >
                Mostra tutti i file
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[620px] overflow-y-auto">
              {filteredFiles.map((file) => {
                const isSelected = activeFile?.path === file.path;
                const lineCount = file.content.split('\n').length;
                return (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setSelectedPath(file.path)}
                    className={`w-full text-left px-4 py-3 transition-colors cursor-pointer block ${
                      isSelected ? 'bg-blue-50/80' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-xs font-mono truncate ${
                          isSelected ? 'font-semibold text-blue-800' : 'text-slate-800'
                        }`}
                      >
                        {file.path}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">
                        {lineCount}L
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{file.title}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Code Viewer */}
        <div className="lg:col-span-8 bg-[#0B1220] border border-slate-800 rounded-xl overflow-hidden">
          {activeFile ? (
            <>
              <div className="px-5 py-3.5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                    <FileCode2 className="w-4 h-4 text-blue-400 shrink-0" aria-hidden="true" />
                    <span className="text-slate-100 font-semibold truncate" data-testid="active-file-path">
                      {activeFile.path}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums shrink-0">{codeLines.length} righe</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{activeFile.description}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyFile}
                    className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedPath === activeFile.path ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                        Copiato
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        Copia
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadSingleFile}
                    className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    File
                  </button>
                </div>
              </div>

              <div className="max-h-[560px] overflow-auto">
                <pre
                  data-testid="code-viewer-content"
                  className="p-4 text-xs leading-relaxed font-mono text-slate-200"
                >
                  {codeLines.map((line, idx) => (
                    <div key={idx} className="table-row">
                      <span className="table-cell pr-4 text-right select-none text-slate-500 tabular-nums w-10">
                        {idx + 1}
                      </span>
                      <span className="table-cell whitespace-pre">{line || ' '}</span>
                    </div>
                  ))}
                </pre>
              </div>
            </>
          ) : (
            <div className="p-10 text-center text-sm text-slate-400">
              Seleziona un file dalla lista per visualizzarne il contenuto.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
