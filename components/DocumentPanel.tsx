import React, { useRef, useState, useEffect } from 'react';
import { FileText, Upload, Trash2, Database, Loader2, Info, CheckCircle2, RefreshCw, Settings, ChevronLeft, Plus, Check } from 'lucide-react';
import { useDocumentContext } from '../contexts/DocumentContext';

const DocumentPanel: React.FC = () => {
  const { 
    documents, 
    uploadDocument, 
    deleteDocument, 
    isUploading, 
    error, 
    activeStore,
    stores,
    listStores,
    createStore,
    deleteStore,
    selectStore,
    settings,
    updateSettings
  } = useDocumentContext();
  
  const [deletingStore, setDeletingStore] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [isCreatingStore, setIsCreatingStore] = useState(false);

  // Load stores when settings panel opens
  useEffect(() => {
    if (showSettings) {
      listStores();
    }
  }, [showSettings, listStores]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      uploadDocument(e.target.files[0]);
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  
  const handleCreateStore = async () => {
    if (!newStoreName.trim()) return;
    setIsCreatingStore(true);
    const store = await createStore(newStoreName.trim());
    if (store) {
      selectStore(store);
      setNewStoreName('');
    }
    setIsCreatingStore(false);
  };
  
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[var(--c-bacPri)]/50">
      {/* Header */}
      <div className="h-[54px] px-4 flex items-center justify-between border-b border-[var(--c-borPri)] bg-[var(--c-bacSec)]/80 shrink-0">
        <div className="flex items-center gap-2">
          {showSettings ? (
            <button 
              onClick={() => setShowSettings(false)}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--c-bacTer)] text-[var(--c-texSec)] hover:text-[var(--c-texPri)] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          ) : (
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${activeStore ? 'bg-green-900/30 text-green-400' : 'bg-[var(--c-teaBacAccSec)] text-white'}`}>
              <Database className="w-4 h-4" />
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold text-[var(--c-texPri)]">
              {showSettings ? 'Settings' : 'Knowledge Base'}
            </h3>
            <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${activeStore ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                <span className="text-[10px] text-[var(--c-texSec)] uppercase tracking-wider font-medium">
                {activeStore ? 'Vector Store Active' : 'Initializing...'}
                </span>
            </div>
          </div>
        </div>
        {!showSettings && (
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-md hover:bg-[var(--c-bacTer)] text-[var(--c-texSec)] hover:text-[var(--c-texPri)] transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {showSettings ? (
          /* ─────────────────────────────────────────────────────────────
             SETTINGS PANEL
           ───────────────────────────────────────────────────────────── */
          <div className="space-y-4">
            {/* Display Citations Toggle */}
            <div className="p-3 rounded-lg bg-[var(--c-bacSec)] border border-[var(--c-borPri)]">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-medium text-[var(--c-texPri)]">Display Citations</h4>
                  <p className="text-[10px] text-[var(--c-texSec)] mt-0.5">Show source references in AI responses</p>
                </div>
                <button
                  onClick={() => updateSettings({ displayCitations: !settings.displayCitations })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    settings.displayCitations ? 'bg-green-500' : 'bg-[var(--c-bacTer)]'
                  }`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    settings.displayCitations ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            </div>
            
            {/* Select Store */}
            <div className="p-3 rounded-lg bg-[var(--c-bacSec)] border border-[var(--c-borPri)]">
              <h4 className="text-xs font-medium text-[var(--c-texPri)] mb-2">Select Store</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {stores.map((store) => (
                  <div
                    key={store.name}
                    className={`group/store w-full flex items-center justify-between p-2 rounded-lg transition-colors ${
                      activeStore?.name === store.name 
                        ? 'bg-green-900/30 border border-green-500/30' 
                        : 'bg-[var(--c-bacTer)] border border-transparent hover:border-[var(--c-borStr)]'
                    }`}
                  >
                    <button
                      onClick={() => selectStore(store)}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left"
                    >
                      <Database className="w-3.5 h-3.5 text-[var(--c-texSec)] shrink-0" />
                      <span className="text-xs text-[var(--c-texPri)] truncate">{store.displayName}</span>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-[var(--c-texSec)]">
                        {store.documentCount || 0} docs · {formatBytes(store.totalSizeBytes || 0)}
                      </span>
                      {activeStore?.name === store.name ? (
                        <Check className="w-3.5 h-3.5 text-green-400" />
                      ) : (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            setDeletingStore(store.name);
                            await deleteStore(store.name);
                            setDeletingStore(null);
                          }}
                          disabled={deletingStore === store.name}
                          className="w-5 h-5 rounded flex items-center justify-center text-[var(--c-texDis)] hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover/store:opacity-100 transition-all disabled:opacity-50"
                          title="Delete store"
                        >
                          {deletingStore === store.name ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {stores.length === 0 && (
                  <p className="text-[10px] text-[var(--c-texDis)] text-center py-2">No stores found</p>
                )}
              </div>
              
              {/* Create New Store */}
              <div className="mt-3 pt-3 border-t border-[var(--c-borPri)]">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newStoreName}
                    onChange={(e) => setNewStoreName(e.target.value)}
                    placeholder="New store name..."
                    className="flex-1 px-2 py-1.5 text-xs bg-[var(--c-bacTer)] border border-[var(--c-borStr)] rounded-md text-[var(--c-texPri)] placeholder-[var(--c-texDis)] outline-none focus:border-[var(--c-bluTexAccPri)]"
                  />
                  <button
                    onClick={handleCreateStore}
                    disabled={!newStoreName.trim() || isCreatingStore}
                    className="px-2.5 py-1.5 bg-[var(--c-bluTexAccPri)] text-white text-xs rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {isCreatingStore ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ─────────────────────────────────────────────────────────────
             DOCUMENTS LIST
           ───────────────────────────────────────────────────────────── */
          <>
        {documents.length === 0 && !isUploading && (
          <div className="flex flex-col items-center justify-center h-40 text-center text-[var(--c-texDis)] px-4 border-2 border-dashed border-[var(--c-borPri)] rounded-xl mt-2">
            <FileText className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-xs">No documents indexed.</p>
            <p className="text-[10px] mt-1">Upload PDFs to add them to the semantic search index.</p>
          </div>
        )}

        {documents.map((doc, index) => (
          <div key={doc.uri || `${doc.name}-${index}`} className="group flex items-start gap-3 p-3 rounded-lg bg-[var(--c-bacSec)] border border-[var(--c-borPri)] hover:border-[var(--c-bluTexAccPri)] transition-colors">
            <div className="w-8 h-8 rounded bg-[var(--c-bacTer)] flex items-center justify-center text-[var(--c-bluTexAccPri)] shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[var(--c-texPri)] truncate" title={doc.name}>
                {doc.name}
              </p>
              <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-[var(--c-texSec)]">
                    {(doc.size / 1024).toFixed(1)} KB
                  </span>
                  {doc.status === 'indexing' ? (
                      <div className="flex items-center gap-1 text-[10px] text-yellow-500">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Indexing
                      </div>
                  ) : (
                      <div className="flex items-center gap-1 text-[10px] text-green-500">
                          <CheckCircle2 className="w-3 h-3" />
                          Ready
                      </div>
                  )}
              </div>
            </div>
            <button 
              onClick={() => deleteDocument(doc.documentName || doc.uri)}
              className="p-1.5 text-[var(--c-texDis)] hover:text-red-400 transition-all"
              title="Delete document"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {isUploading && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--c-bacSec)] border border-[var(--c-borPri)] animate-pulse">
             <div className="w-8 h-8 rounded bg-[var(--c-bacTer)] flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--c-texSec)]" />
            </div>
            <div className="flex-1">
                <div className="h-2 bg-[var(--c-borStr)] rounded w-3/4 mb-1.5"></div>
                <div className="h-1.5 bg-[var(--c-borStr)] rounded w-1/2"></div>
            </div>
          </div>
        )}
        
        {error && (
            <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-xs text-red-300 flex gap-2 items-start">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
            </div>
        )}
          </>
        )}
      </div>

      {/* Footer / Upload Action - Only show when not in settings */}
      {!showSettings && (
        <div className="p-4 border-t border-[var(--c-borPri)] bg-[var(--c-bacSec)] shrink-0">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            accept=".pdf,.txt,.md,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.json,.xml,.html,.htm,.rtf,.odt"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || !activeStore}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--c-bacTer)] hover:bg-[var(--c-bacEle)] border border-[var(--c-borStr)] hover:border-[var(--c-texSec)] text-[var(--c-texPri)] text-xs font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : !activeStore ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Initializing Store...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Upload to Knowledge Base
              </>
            )}
          </button>
          <div className="text-[10px] text-center text-[var(--c-texDis)] mt-2">
              PDFs are indexed for semantic search (RAG)
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentPanel;