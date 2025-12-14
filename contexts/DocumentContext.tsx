import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import { UploadedDocument, FileSearchStore, GoogleOperation, DocumentMetadata, ChunkingConfig } from '../types';

// Upload options for enhanced File Search features
export interface UploadOptions {
  displayName?: string;
  metadata?: DocumentMetadata[];
  chunkingConfig?: ChunkingConfig;
}

// RAG Settings
export interface RagSettings {
  displayCitations: boolean;
}

interface DocumentContextType {
  documents: UploadedDocument[];
  activeStore: FileSearchStore | null;
  stores: FileSearchStore[];
  uploadDocument: (file: File, options?: UploadOptions) => Promise<void>;
  deleteDocument: (documentName: string) => Promise<void>;
  isUploading: boolean;
  error: string | null;
  // Enhanced features
  refreshStore: () => Promise<void>;
  listStores: () => Promise<void>;
  createStore: (displayName: string) => Promise<FileSearchStore | null>;
  deleteStore: (storeName: string) => Promise<boolean>;
  selectStore: (store: FileSearchStore) => void;
  // Settings
  settings: RagSettings;
  updateSettings: (settings: Partial<RagSettings>) => void;
}

const DocumentContext = createContext<DocumentContextType | undefined>(undefined);

const DEFAULT_SETTINGS: RagSettings = {
  displayCitations: true
};

const SETTINGS_STORAGE_KEY = 'jan-rag-settings';

// Load settings from localStorage
const loadSettings = (): RagSettings => {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn('Failed to load RAG settings:', e);
  }
  return DEFAULT_SETTINGS;
};

export const DocumentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [stores, setStores] = useState<FileSearchStore[]>([]);
  const [activeStore, setActiveStore] = useState<FileSearchStore | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<RagSettings>(loadSettings);
  const initializingRef = useRef(false);
  
  // Refs for stable callback access (prevents callback recreation)
  const activeStoreRef = useRef(activeStore);
  const documentsRef = useRef(documents);
  
  // Keep refs in sync with state
  useEffect(() => { activeStoreRef.current = activeStore; }, [activeStore]);
  useEffect(() => { documentsRef.current = documents; }, [documents]);

  // Helper to get a clean key
  const getApiKey = () => process.env.API_KEY?.replace(/["']/g, "").trim();

  // Initialize a new File Search Store for this session
  useEffect(() => {
    const initStore = async () => {
      const apiKey = getApiKey();
      if (!apiKey || activeStore || initializingRef.current) return;
      
      initializingRef.current = true;
      
      try {
        console.log("Initializing File Search Store...");
        const ai = new GoogleGenAI({ apiKey });
        
        // Create Store using SDK
        // Note: types might be slightly different depending on exact SDK version, casting if needed
        const createResponse = await ai.fileSearchStores.create({
            config: {
                displayName: `Screen_Agent_Session_${Date.now()}`
            }
        });

        console.log("File Search Store Created:", createResponse.name);
        const newStore = { 
          name: createResponse.name, 
          displayName: `Screen_Agent_Session_${Date.now()}`,
          documentCount: 0,
          totalSizeBytes: 0
        };
        setActiveStore(newStore);
        setStores(prev => [...prev, newStore]); // Add to stores array
      } catch (err: any) {
        console.error("Store init failed:", err);
        setError(`RAG Init Failed: ${err.message || 'Unknown error'}`);
        initializingRef.current = false; 
      }
    };

    initStore();
  }, [activeStore]);

  // Poll the Google Operation until it's done
  const pollOperation = async (operationName: string): Promise<void> => {
    const apiKey = getApiKey();
    if (!apiKey) return;

    const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`;
    
    console.log(`Polling operation: ${operationName}`);

    // Timeout after 60s
    const startTime = Date.now();
    
    while (Date.now() - startTime < 60000) {
      const response = await fetch(pollUrl);
      if (!response.ok) {
          throw new Error(`Polling failed: ${response.statusText}`);
      }
      
      const operation: GoogleOperation = await response.json();

      if (operation.done) {
        if (operation.error) {
          throw new Error(operation.error.message);
        }
        console.log("Operation completed successfully");
        return;
      }

      // Wait 2 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error("Operation timed out");
  };
  
  // Refresh a specific store's stats and update both activeStore and stores array
  const refreshStoreStats = useCallback(async (storeName: string) => {
    const apiKey = getApiKey();
    if (!apiKey) return;
    
    try {
      const getUrl = `https://generativelanguage.googleapis.com/v1beta/${storeName}?key=${apiKey}`;
      const response = await fetch(getUrl);
      
      if (response.ok) {
        const storeData = await response.json();
        const updatedStats = {
          documentCount: storeData.documentCount || 0,
          totalSizeBytes: parseInt(storeData.totalSizeBytes || '0', 10)
        };
        
        console.log('[DocumentContext] Store stats updated:', storeName, updatedStats);
        
        // Update activeStore if it matches
        setActiveStore(prev => prev?.name === storeName ? {
          ...prev,
          ...updatedStats
        } : prev);
        
        // Update stores array
        setStores(prev => prev.map(s => s.name === storeName ? {
          ...s,
          ...updatedStats
        } : s));
      }
    } catch (err) {
      console.warn("Failed to refresh store stats:", err);
    }
  }, []);
  
  const uploadDocument = useCallback(async (file: File, options?: UploadOptions) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setError("API Key missing");
      return;
    }
    
    setIsUploading(true);
    setError(null);
    
    // Use ref for stable access to activeStore
    const currentStore = activeStoreRef.current;

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      if (!currentStore) throw new Error("No active store found");
      
      console.log("Uploading to File Search Store:", currentStore.name);
      
      // Build upload config with optional chunking and metadata
      const uploadConfig: any = {
        displayName: options?.displayName || file.name,
        mimeType: file.type
      };
      
      // Add custom chunking configuration if provided
      if (options?.chunkingConfig) {
        uploadConfig.chunkingConfig = {
          whiteSpaceConfig: {
            maxTokensPerChunk: options.chunkingConfig.maxTokensPerChunk || 256,
            maxOverlapTokens: options.chunkingConfig.maxOverlapTokens || 64
          }
        };
        console.log("[DocumentContext] Using custom chunking:", uploadConfig.chunkingConfig);
      }
      
      // Add custom metadata if provided
      if (options?.metadata?.length) {
        uploadConfig.customMetadata = options.metadata.map(m => ({
          key: m.key,
          ...(m.stringValue !== undefined && { stringValue: m.stringValue }),
          ...(m.numericValue !== undefined && { numericValue: m.numericValue })
        }));
        console.log("[DocumentContext] Using custom metadata:", uploadConfig.customMetadata);
      }

      const uploadResponse = await ai.fileSearchStores.uploadToFileSearchStore({
          fileSearchStoreName: currentStore.name,
          file: file,
          config: uploadConfig
      });

      console.log("Upload complete. Response:", uploadResponse);
      
      // Extract document info from response
      const responseData = uploadResponse as any;
      const documentName = responseData.response?.documentName || responseData.documentName;
      
      const newDoc: UploadedDocument = {
        uri: documentName || `${currentStore.name}/documents/${file.name}`,
        name: options?.displayName || file.name,
        documentName: documentName,  // Store for deletion
        mimeType: file.type,
        size: file.size,
        status: 'ready',
        metadata: options?.metadata
      };

      setDocuments(prev => [...prev, newDoc]);
      console.log("[DocumentContext] Document indexed:", newDoc.name);
      
      // Optimistic update - immediately update local stats
      const fileSize = file.size;
      setActiveStore(prev => prev ? {
        ...prev,
        documentCount: (prev.documentCount || 0) + 1,
        totalSizeBytes: (prev.totalSizeBytes || 0) + fileSize
      } : null);
      
      setStores(prev => prev.map(s => s.name === currentStore.name ? {
        ...s,
        documentCount: (s.documentCount || 0) + 1,
        totalSizeBytes: (s.totalSizeBytes || 0) + fileSize
      } : s));
      
      // Also fetch from API after a delay to get accurate stats
      setTimeout(() => refreshStoreStats(currentStore.name), 2000);

    } catch (err: any) {
      const errorMessage = err.message || (typeof err === 'string' ? err : JSON.stringify(err));
      console.error("Upload/Indexing failed:", errorMessage);
      setError(errorMessage || "Failed to process document");
    } finally {
      setIsUploading(false);
    }
  }, [refreshStoreStats]); // Stable deps - uses ref for activeStore

  // Delete document from store
  const deleteDocument = useCallback(async (documentName: string) => {
    const apiKey = getApiKey();
    const currentStore = activeStoreRef.current;
    const currentDocs = documentsRef.current;
    
    // Find the document to get its size for optimistic update
    const docToDelete = currentDocs.find(d => d.documentName === documentName || d.uri === documentName);
    const docSize = docToDelete?.size || 0;
    
    if (!apiKey || !currentStore) {
      setDocuments(prev => prev.filter(d => d.documentName !== documentName && d.uri !== documentName));
      return;
    }
    
    try {
      // Call the delete API
      const deleteUrl = `https://generativelanguage.googleapis.com/v1beta/${documentName}?key=${apiKey}`;
      const response = await fetch(deleteUrl, { method: 'DELETE' });
      
      if (!response.ok && response.status !== 404) {
        console.warn("Delete API returned:", response.status);
      }
      
      console.log("[DocumentContext] Document deleted:", documentName);
    } catch (err) {
      console.warn("Delete failed (document may already be removed):", err);
    }
    
    // Remove from local state regardless
    setDocuments(prev => prev.filter(d => d.documentName !== documentName && d.uri !== documentName));
    
    // Optimistic update - immediately decrement local stats
    setActiveStore(prev => prev ? {
      ...prev,
      documentCount: Math.max(0, (prev.documentCount || 0) - 1),
      totalSizeBytes: Math.max(0, (prev.totalSizeBytes || 0) - docSize)
    } : null);
    
    setStores(prev => prev.map(s => s.name === currentStore.name ? {
      ...s,
      documentCount: Math.max(0, (s.documentCount || 0) - 1),
      totalSizeBytes: Math.max(0, (s.totalSizeBytes || 0) - docSize)
    } : s));
    
    // Also fetch from API after a delay to get accurate stats
    setTimeout(() => refreshStoreStats(currentStore.name), 2000);
  }, [refreshStoreStats]); // Stable deps - uses refs for activeStore and documents
  
  // Refresh active store info
  const refreshStore = useCallback(async () => {
    const currentStore = activeStoreRef.current;
    if (currentStore) {
      await refreshStoreStats(currentStore.name);
    }
  }, [refreshStoreStats]); // Stable deps - uses ref for activeStore
  
  // List all available stores with their stats
  const listStores = useCallback(async () => {
    const apiKey = getApiKey();
    if (!apiKey) return;
    
    try {
      const listUrl = `https://generativelanguage.googleapis.com/v1beta/fileSearchStores?key=${apiKey}`;
      const response = await fetch(listUrl);
      
      if (response.ok) {
        const data = await response.json();
        const basicList = data.fileSearchStores || [];
        
        // Fetch detailed stats for each store
        const storeList: FileSearchStore[] = await Promise.all(
          basicList.map(async (s: any) => {
            try {
              // Get individual store details for accurate counts
              const detailUrl = `https://generativelanguage.googleapis.com/v1beta/${s.name}?key=${apiKey}`;
              const detailResponse = await fetch(detailUrl);
              
              if (detailResponse.ok) {
                const details = await detailResponse.json();
                return {
                  name: s.name,
                  displayName: details.displayName || s.displayName || s.name.split('/').pop(),
                  documentCount: details.documentCount || 0,
                  totalSizeBytes: parseInt(details.totalSizeBytes || '0', 10)
                };
              }
            } catch (e) {
              console.warn('Failed to get store details:', s.name);
            }
            
            // Fallback to basic info
            return {
              name: s.name,
              displayName: s.displayName || s.name.split('/').pop(),
              documentCount: 0,
              totalSizeBytes: 0
            };
          })
        );
        
        setStores(storeList);
        console.log('[DocumentContext] Listed stores with stats:', storeList);
      }
    } catch (err) {
      console.warn("Failed to list stores:", err);
    }
  }, []);
  
  // Create a new store
  const createStore = useCallback(async (displayName: string): Promise<FileSearchStore | null> => {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    
    try {
      const ai = new GoogleGenAI({ apiKey });
      const createResponse = await ai.fileSearchStores.create({
        config: { displayName }
      });
      
      const newStore: FileSearchStore = {
        name: createResponse.name,
        displayName: displayName,
        documentCount: 0,
        totalSizeBytes: 0
      };
      
      setStores(prev => [...prev, newStore]);
      console.log('[DocumentContext] Created store:', newStore.name);
      return newStore;
    } catch (err) {
      console.error("Failed to create store:", err);
      return null;
    }
  }, []);
  
  // Delete a store
  const deleteStore = useCallback(async (storeName: string): Promise<boolean> => {
    const apiKey = getApiKey();
    if (!apiKey) return false;
    
    try {
      // Use force=true to delete all documents in the store
      const deleteUrl = `https://generativelanguage.googleapis.com/v1beta/${storeName}?force=true&key=${apiKey}`;
      const response = await fetch(deleteUrl, { method: 'DELETE' });
      
      if (response.ok) {
        // Remove from local state
        setStores(prev => prev.filter(s => s.name !== storeName));
        
        // If this was the active store, clear it
        if (activeStoreRef.current?.name === storeName) {
          setActiveStore(null);
          setDocuments([]);
        }
        
        console.log('[DocumentContext] Deleted store:', storeName);
        return true;
      } else {
        const error = await response.json();
        console.error('Failed to delete store:', error);
        setError(`Failed to delete store: ${error.error?.message || 'Unknown error'}`);
        return false;
      }
    } catch (err) {
      console.error('Failed to delete store:', err);
      setError('Failed to delete store');
      return false;
    }
  }, []);
  
  // Select a store (switch active store)
  const selectStore = useCallback((store: FileSearchStore) => {
    setActiveStore(store);
    setDocuments([]); // Clear documents when switching stores
    console.log('[DocumentContext] Selected store:', store.name);
  }, []);
  
  // Update settings and persist to localStorage
  const updateSettings = useCallback((newSettings: Partial<RagSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save RAG settings:', e);
      }
      return updated;
    });
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo<DocumentContextType>(() => ({
    documents,
    activeStore,
    stores,
    uploadDocument,
    deleteDocument,
    isUploading,
    error,
    refreshStore,
    listStores,
    createStore,
    deleteStore,
    selectStore,
    settings,
    updateSettings
  }), [
    documents,
    activeStore,
    stores,
    isUploading,
    error,
    settings,
    // Callbacks are stable due to useCallback with minimal deps
    uploadDocument,
    deleteDocument,
    refreshStore,
    listStores,
    createStore,
    deleteStore,
    selectStore,
    updateSettings
  ]);

  return (
    <DocumentContext.Provider value={contextValue}>
      {children}
    </DocumentContext.Provider>
  );
};

export const useDocumentContext = () => {
  const context = useContext(DocumentContext);
  if (!context) throw new Error('useDocumentContext must be used within DocumentProvider');
  return context;
};