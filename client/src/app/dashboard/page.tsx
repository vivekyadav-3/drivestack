"use client";

// Logic fix to handle view narrowing in TypeScript production builds
import { useEffect, useState, useRef } from "react";
import { useUser, useAuth, SignOutButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import api from "@/utils/api";
import { 
  Folder, 
  File, 
  Upload, 
  Plus, 
  LogOut, 
  ChevronRight, 
  Share2, 
  Download, 
  Trash2, 
  RefreshCcw, 
  Trash,
  AlertCircle,
  History,
  HardDrive,
  Search,
  X,
  Users,
  Send
} from "lucide-react";

export default function DashboardPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();
  
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'files' | 'trash' | 'search' | 'shared'>('files');
  const [quota, setQuota] = useState({ used_storage: 0, storage_limit: 104857600 });
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [versionModal, setVersionModal] = useState<{ isOpen: boolean; fileId: string; versions: any[] }>({
    isOpen: false,
    fileId: "",
    versions: []
  });
  const [shareEmailModal, setShareEmailModal] = useState<{ isOpen: boolean; fileId: string; email: string }>({
    isOpen: false,
    fileId: "",
    email: ""
  });

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDanger?: boolean;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/login");
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (isSignedIn && currentView !== 'search') {
      fetchData();
      fetchQuota();
    }
  }, [isSignedIn, currentFolder, currentView]);

  const fetchQuota = async () => {
    try {
      const token = await getToken();
      const res = await api.get('/files/quota', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setQuota(res.data);
    } catch (err) {
      console.error("Failed to fetch quota", err);
    }
  };

  const fetchData = async () => {
    try {
      const token = await getToken();
      if (currentView === 'files') {
        const folderRes = await api.get(`/folders?parent_id=${currentFolder || 'null'}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const fileRes = await api.get(`/files?folder_id=${currentFolder || 'null'}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setFolders(folderRes.data);
        setFiles(fileRes.data);
      } else if (currentView === 'trash') {
        const res = await api.get('/trash', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setFolders(res.data.folders);
        setFiles(res.data.files);
      } else if (currentView === 'shared') {
        const res = await api.get('/shared', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setFolders([]);
        setFiles(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch data", err);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query) {
      setCurrentView('files');
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const token = await getToken();
        const res = await api.get(`/search?q=${query}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setFolders(res.data.folders);
        setFiles(res.data.files);
        setCurrentView('search');
        setCurrentFolder(null);
      } catch (err) {
        console.error("Search failed", err);
      }
    }, 300);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName) return;
    try {
      const token = await getToken();
      await api.post("/folders", { name: newFolderName, parent_id: currentFolder }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNewFolderName("");
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert("Failed to create folder");
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    if (currentFolder) formData.append("folder_id", currentFolder);

    try {
      const token = await getToken();
      await api.post("/files/upload", formData, {
        headers: { 
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`
        },
      });
      fetchData();
      fetchQuota();
    } catch (err: any) {
      if (err.response?.status === 403) {
        alert("Storage limit exceeded! Please delete some files.");
      } else {
        alert("Upload failed");
      }
    }
  };

  const handleDelete = (type: 'file' | 'folder', id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Move to Trash?",
      message: `Are you sure you want to move this ${type} to the trash? You can restore it later.`,
      onConfirm: async () => {
        try {
          const token = await getToken();
          await api.delete(`/${type}s/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          if (currentView === 'search') handleSearch(searchQuery);
          else fetchData();
        } catch (err) {
          alert("Delete failed");
        }
      }
    });
  };

  const handleRestore = async (type: 'file' | 'folder', id: string) => {
    try {
      const token = await getToken();
      await api.patch(`/${type}s/${id}/restore`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
    } catch (err) {
      alert("Restore failed");
    }
  };

  const handlePermanentDelete = (type: 'file' | 'folder', id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Confirm Permanent Delete",
      message: `PROCEED WITH CAUTION: This will permanently delete the ${type}. This action cannot be undone.`,
      isDanger: true,
      onConfirm: async () => {
        try {
          const token = await getToken();
          await api.delete(`/${type}s/${id}/permanent`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          fetchData();
          fetchQuota();
        } catch (err) {
          alert("Permanent delete failed");
        }
      }
    });
  };

  const handleDownload = async (fileId: string) => {
    try {
      const token = await getToken();
      const res = await api.get(`/files/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      window.open(res.data.downloadUrl, "_blank");
    } catch (err) {
      alert("Download failed");
    }
  };

  const handleViewVersions = async (fileId: string) => {
    try {
      const token = await getToken();
      const res = await api.get(`/files/${fileId}/versions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVersionModal({ isOpen: true, fileId, versions: res.data });
    } catch (err) {
      alert("Failed to fetch versions");
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    try {
      const token = await getToken();
      await api.post(`/files/versions/${versionId}/restore`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVersionModal(prev => ({ ...prev, isOpen: false }));
      if (currentView === 'search') handleSearch(searchQuery);
      else fetchData();
    } catch (err) {
      alert("Failed to restore version");
    }
  };

  const handleShareEmail = async () => {
    if (!shareEmailModal.email) return;
    try {
      const token = await getToken();
      await api.post(`/files/${shareEmailModal.fileId}/share-email`, 
        { email: shareEmailModal.email }, 
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShareEmailModal({ isOpen: false, fileId: "", email: "" });
      alert(`Successfully shared with ${shareEmailModal.email}`);
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to share file");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const usedPercentage = Math.min(100, (quota.used_storage / quota.storage_limit) * 100);

  if (!isLoaded || !isSignedIn) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-black text-blue-600 tracking-tighter">DriveStack</h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => { setCurrentView('files'); setCurrentFolder(null); setSearchQuery(""); }}
            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200 ${currentView === 'files' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <Folder size={18} fill={currentView === 'files' ? "white" : "none"} />
            <span className="font-bold sm:text-sm">My Files</span>
          </button>
          <button 
            onClick={() => { setCurrentView('trash'); setCurrentFolder(null); setSearchQuery(""); }}
            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200 ${currentView === 'trash' ? 'bg-red-600 text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <Trash2 size={18} fill={currentView === 'trash' ? "white" : "none"} />
            <span className="font-bold sm:text-sm">Trash</span>
          </button>
          <button 
            onClick={() => { setCurrentView('shared'); setCurrentFolder(null); setSearchQuery(""); }}
            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200 ${currentView === 'shared' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <Users size={18} fill={currentView === 'shared' ? "white" : "none"} />
            <span className="font-bold sm:text-sm">Shared with me</span>
          </button>
        </nav>

        {/* Quota Widget */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 mx-2 mb-2 rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2 text-gray-700">
              <HardDrive size={14} className="text-blue-500" />
              <span className="text-[10px] font-black uppercase tracking-widest">Storage</span>
            </div>
            <span className={`text-[10px] font-black ${usedPercentage > 90 ? 'text-red-500' : 'text-blue-600'}`}>{Math.round(usedPercentage)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3 overflow-hidden">
            <div 
              className={`h-1.5 rounded-full transition-all duration-1000 ease-out ${usedPercentage > 90 ? 'bg-red-500' : usedPercentage > 70 ? 'bg-yellow-500' : 'bg-blue-600'}`}
              style={{ width: `${usedPercentage}%` }}
            ></div>
          </div>
          <p className="text-[10px] text-gray-400 font-medium">
            {formatSize(quota.used_storage)} of {formatSize(quota.storage_limit)}
          </p>
        </div>

        <div className="p-4 border-t border-gray-100">
          <SignOutButton>
            <button className="w-full flex items-center space-x-3 px-3 py-2 text-gray-400 hover:text-red-500 transition-colors uppercase text-[10px] font-black tracking-widest">
              <LogOut size={16} />
              <span>Sign Out</span>
            </button>
          </SignOutButton>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-white border-b border-gray-100 flex items-center justify-between px-8">
          <div className="flex items-center space-x-4 flex-1">
            <div className="relative w-full max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Search your vault..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border-transparent focus:bg-white focus:border-blue-500 rounded-xl text-sm transition-all focus:ring-4 focus:ring-blue-50/50 outline-none"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(""); setCurrentView('files'); fetchData(); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-4 ml-8">
            {currentView === 'files' && (
              <>
                <button onClick={() => setIsModalOpen(true)} className="flex items-center space-x-2 bg-white border border-gray-200 px-5 py-2.5 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm active:scale-95">
                  <Plus size={18} />
                  <span>New Folder</span>
                </button>
                <label className="flex items-center space-x-2 bg-blue-600 px-5 py-2.5 rounded-xl text-sm font-bold text-white hover:bg-blue-700 transition-all shadow-md shadow-blue-200 cursor-pointer active:scale-95">
                  <Upload size={18} />
                  <span>Upload</span>
                  <input type="file" className="hidden" onChange={handleUploadFile} />
                </label>
              </>
            )}
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-8 scroll-smooth">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-gray-400 text-xs font-bold uppercase tracking-widest">
              <span className={currentView === 'search' ? 'text-blue-600' : ''}>{currentView === 'search' ? 'Search Results' : currentView === 'trash' ? 'Bin' : currentView === 'shared' ? 'Shared With Me' : 'My Files'}</span>
              {currentFolder && (
                <>
                  <ChevronRight size={14} />
                  <span className="text-gray-900">Inside Folder</span>
                </>
              )}
            </div>
            {currentView === 'search' && <span className="text-xs text-gray-400 font-bold">{folders.length + files.length} items found</span>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
            {/* Folders */}
            {folders.map((folder: any) => (
              <div 
                key={folder.id}
                onDoubleClick={() => currentView !== 'trash' && setCurrentFolder(folder.id)}
                className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:bg-blue-50/10 transition-all duration-300 cursor-pointer group relative"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-yellow-100/50 p-3 rounded-2xl text-yellow-600">
                    <Folder size={28} fill="currentColor" />
                  </div>
                  <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-all scale-90">
                    {currentView !== 'trash' ? (
                      <button onClick={(e) => { e.stopPropagation(); handleDelete('folder', folder.id); }} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors">
                        <Trash2 size={16} />
                      </button>
                    ) : (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); handleRestore('folder', folder.id); }} className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-xl transition-colors">
                          <RefreshCcw size={16} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handlePermanentDelete('folder', folder.id); }} className="p-2 text-gray-400 hover:text-red-700 hover:bg-red-100 rounded-xl transition-colors">
                          <Trash size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <h3 className="font-bold text-gray-900 truncate pr-8">{folder.name}</h3>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">
                  {currentView === 'trash' ? `Deleted ${new Date(folder.deleted_at).toLocaleDateString()}` : 'Directory'}
                </p>
              </div>
            ))}

            {/* Files */}
            {files.map((file: any) => (
              <div key={file.id} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:bg-blue-50/10 transition-all duration-300 group relative">
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-blue-100/50 p-3 rounded-2xl text-blue-600">
                    <File size={28} />
                  </div>
                  <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-all scale-90">
                    {currentView === 'trash' ? (
                      <>
                        <button onClick={() => handleRestore('file', file.id)} className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-xl transition-colors">
                          <RefreshCcw size={16} />
                        </button>
                        <button onClick={() => handlePermanentDelete('file', file.id)} className="p-2 text-gray-400 hover:text-red-700 hover:bg-red-100 rounded-xl transition-colors">
                          <Trash size={16} />
                        </button>
                      </>
                    ) : currentView === 'shared' ? (
                      <button onClick={() => handleDownload(file.id)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors" title="Download">
                        <Download size={16} />
                      </button>
                    ) : (
                      <>
                        <button onClick={() => handleDownload(file.id)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors" title="Download">
                          <Download size={16} />
                        </button>
                        <button onClick={() => setShareEmailModal({ isOpen: true, fileId: file.id, email: "" })} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors" title="Share via Email">
                          <Send size={16} />
                        </button>
                        <button onClick={() => handleViewVersions(file.id)} className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-colors" title="History">
                          <History size={16} />
                        </button>
                        <button onClick={() => handleDelete('file', file.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors" title="Move to Bin">
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <h3 className="font-bold text-gray-900 truncate pr-8" title={file.name}>{file.name}</h3>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">
                  {currentView === 'trash' ? `Bin • ${new Date(file.deleted_at).toLocaleDateString()}` : currentView === 'shared' ? `Shared on ${new Date(file.shared_at).toLocaleDateString()}` : `${formatSize(file.size)} • ${new Date(file.created_at).toLocaleDateString()}`}
                </p>
              </div>
            ))}
          </div>

          {folders.length === 0 && files.length === 0 && (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center">
              <div className="bg-gray-100 p-8 rounded-full mb-6">
                <Search size={48} className="text-gray-300" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {currentView === 'search' ? 'No matches found' : currentView === 'trash' ? 'Your bin is empty' : 'Nothing here yet'}
              </h3>
              <p className="text-gray-400 text-sm max-w-xs">{currentView === 'search' ? 'Check your spelling or try another keyword' : 'Start by creating a folder or uploading your first file'}</p>
            </div>
          )}
        </main>
      </div>

      {/* Version Modal */}
      {versionModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70]">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg p-8 outline-none border border-gray-100">
            <h2 className="text-2xl font-black mb-6 flex items-center space-x-3 text-gray-900 tracking-tight">
              <div className="bg-purple-100 p-2 rounded-xl text-purple-600"><History size={24} /></div>
              <span>Timeline</span>
            </h2>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 mb-8 custom-scrollbar">
              {versionModal.versions.map((v, idx) => (
                <div key={v.id} className="relative group/v">
                  <div className={`flex items-center justify-between p-5 rounded-2xl border transition-all ${idx === 0 ? 'bg-blue-50/50 border-blue-100' : 'bg-gray-50 border-transparent hover:border-gray-200'}`}>
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <p className="text-sm font-black text-gray-900">V{v.version_number}</p>
                        {idx === 0 && <span className="text-[8px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-widest">Active</span>}
                      </div>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{new Date(v.created_at).toLocaleString()} • {formatSize(v.size)}</p>
                    </div>
                    {idx !== 0 && (
                      <button 
                        onClick={() => handleRestoreVersion(v.id)}
                        className="px-4 py-2 bg-white text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm border border-blue-100"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setVersionModal(prev => ({ ...prev, isOpen: false }))} className="w-full py-4 bg-gray-100 text-gray-900 rounded-2xl hover:bg-gray-200 transition font-black text-xs uppercase tracking-widest">Done</button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80]">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm p-8 text-center border border-gray-100">
            <div className={`mx-auto w-16 h-16 rounded-3xl flex items-center justify-center mb-6 shadow-lg ${confirmModal.isDanger ? 'bg-red-500 text-white shadow-red-200' : 'bg-blue-600 text-white shadow-blue-200'}`}>
              <AlertCircle size={32} />
            </div>
            <h2 className="text-xl font-black text-gray-900 mb-2 leading-tight">{confirmModal.title}</h2>
            <p className="text-sm text-gray-500 font-medium mb-8 px-4">{confirmModal.message}</p>
            <div className="flex space-x-3">
              <button onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} className="flex-1 px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400 bg-gray-50 hover:bg-gray-100 rounded-2xl transition-all">Go Back</button>
              <button onClick={confirmModal.onConfirm} className={`flex-1 px-4 py-3 text-xs font-black uppercase tracking-widest text-white rounded-2xl transition-all shadow-lg ${confirmModal.isDanger ? 'bg-red-500 hover:bg-red-600 shadow-red-200' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'}`}>I'm Sure</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Folder Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[90]">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md p-8 border border-gray-100">
            <h2 className="text-2xl font-black mb-6 text-gray-900 tracking-tight">New Collection</h2>
            <input autoFocus type="text" placeholder="Folder label" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()} className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-2xl px-5 py-4 mb-8 text-sm font-bold text-gray-900 focus:ring-4 focus:ring-blue-100 outline-none transition-all" />
            <div className="flex justify-end space-x-3">
              <button onClick={() => setIsModalOpen(false)} className="px-6 py-3 text-xs font-black uppercase tracking-widest text-gray-400 bg-gray-50 hover:bg-gray-100 rounded-2xl transition-all">Cancel</button>
              <button onClick={handleCreateFolder} className="px-6 py-3 text-xs font-black uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 rounded-2xl transition-all shadow-xl shadow-blue-100">Create Directory</button>
            </div>
          </div>
        </div>
      )}

      {/* Share Email Modal */}
      {shareEmailModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[90]">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md p-8 border border-gray-100">
            <h2 className="text-2xl font-black mb-2 text-gray-900 tracking-tight flex items-center space-x-3">
              <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600"><Send size={24} /></div>
              <span>Share Access</span>
            </h2>
            <p className="text-sm text-gray-500 font-medium mb-6">Enter the user's email address to grant them secure access to this file.</p>
            <input autoFocus type="email" placeholder="user@example.com" value={shareEmailModal.email} onChange={(e) => setShareEmailModal({ ...shareEmailModal, email: e.target.value })} onKeyDown={(e) => e.key === "Enter" && handleShareEmail()} className="w-full bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl px-5 py-4 mb-8 text-sm font-bold text-gray-900 focus:ring-4 focus:ring-indigo-100 outline-none transition-all" />
            <div className="flex justify-end space-x-3">
              <button onClick={() => setShareEmailModal({ ...shareEmailModal, isOpen: false })} className="px-6 py-3 text-xs font-black uppercase tracking-widest text-gray-400 bg-gray-50 hover:bg-gray-100 rounded-2xl transition-all">Cancel</button>
              <button onClick={handleShareEmail} className="px-6 py-3 text-xs font-black uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-700 rounded-2xl transition-all shadow-xl shadow-indigo-200">Share Securely</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
