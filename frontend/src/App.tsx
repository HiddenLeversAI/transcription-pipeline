import React, { useState, useCallback, useEffect } from 'react';
import { Upload, FileAudio, FileVideo, Clock, CheckCircle, XCircle, Loader2, Eye, EyeOff, Settings, Download } from 'lucide-react';

// Types
interface UploadJob {
  id: string;
  filename: string;
  fileSize: number;
  fileType: string;
  status: 'uploading' | 'uploaded' | 'processing' | 'completed' | 'error';
  uploadProgress: number;
  saladJobId?: string;
  transcriptionData?: any;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
}

interface AppConfig {
  accessToken: string;
  workerEndpoint: string;
}

// API functions
const api = {
  validateToken: async (token: string, endpoint: string) => {
    try {
      const response = await fetch(`${endpoint}/auth/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      return data.valid;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  },
  
  getSignedUploadUrl: async (filename: string, token: string, endpoint: string) => {
    const response = await fetch(`${endpoint}/upload/signed-url`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename }),
    });
    if (!response.ok) throw new Error('Failed to get upload URL');
    return await response.json();
  },
  
  uploadFile: async (url: string, file: File, token: string, onProgress: (progress: number) => void) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // Set up progress tracking
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      });
      
      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (error) {
            resolve({ success: true });
          }
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });
      
      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });
      
      // Set up the request
      xhr.open('POST', url);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Content-Type', file.type);
      
      // Start the upload
      xhr.send(file);
    });
  },
  
  getJobStatus: async (jobId: string, token: string, endpoint: string) => {
    const response = await fetch(`${endpoint}/job/${jobId}/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!response.ok) throw new Error('Failed to get job status');
    return await response.json();
  }
};

// Configuration Modal Component
const ConfigModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  onSave: (config: AppConfig) => void;
}> = ({ isOpen, onClose, config, onSave }) => {
  const [formData, setFormData] = useState(config);
  const [showToken, setShowToken] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">Configuration</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Access Token
              </label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={formData.accessToken}
                  onChange={(e) => setFormData(prev => ({ ...prev, accessToken: e.target.value }))}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter access token"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                >
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Worker Endpoint
              </label>
              <input
                type="url"
                value={formData.workerEndpoint}
                onChange={(e) => setFormData(prev => ({ ...prev, workerEndpoint: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://transcription-worker.your-subdomain.workers.dev"
              />
            </div>
          </div>
          
          <div className="flex space-x-3 mt-6">
            <button
              onClick={handleSave}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Save Configuration
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Job Card Component
const JobCard: React.FC<{ job: UploadJob; onViewTranscription: (job: UploadJob) => void }> = ({ 
  job, 
  onViewTranscription 
}) => {
  const getStatusIcon = () => {
    switch (job.status) {
      case 'uploading':
        return <Loader2 className="animate-spin text-blue-500" size={20} />;
      case 'uploaded':
      case 'processing':
        return <Clock className="text-yellow-500" size={20} />;
      case 'completed':
        return <CheckCircle className="text-green-500" size={20} />;
      case 'error':
        return <XCircle className="text-red-500" size={20} />;
      default:
        return null;
    }
  };

  const getFileIcon = () => {
    return job.fileType.startsWith('audio/') ? 
      <FileAudio className="text-blue-500" size={24} /> : 
      <FileVideo className="text-purple-500" size={24} />;
  };

  const formatFileSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
  };

  const formatDuration = (start: string, end?: string) => {
    const startTime = new Date(start);
    if (!end) return `Started ${startTime.toLocaleTimeString()}`;
    
    const endTime = new Date(end);
    const duration = (endTime.getTime() - startTime.getTime()) / 1000;
    return `Completed in ${duration.toFixed(1)}s`;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          {getFileIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-gray-900 truncate">
                {job.filename}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {formatFileSize(job.fileSize)} • {formatDuration(job.createdAt, job.completedAt)}
              </p>
            </div>
            
            <div className="flex items-center space-x-2 ml-2">
              {getStatusIcon()}
              {job.status === 'completed' && (
                <button
                  onClick={() => onViewTranscription(job)}
                  className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                >
                  View
                </button>
              )}
            </div>
          </div>
          
          {job.status === 'uploading' && (
            <div className="mt-2">
              <div className="bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${job.uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">{job.uploadProgress}% uploaded</p>
            </div>
          )}
          
          {job.status === 'error' && job.errorMessage && (
            <p className="text-xs text-red-600 mt-1">{job.errorMessage}</p>
          )}
          
          {job.status === 'completed' && job.transcriptionData && (
            <div className="mt-2 text-xs text-gray-600">
              <p>Confidence: {(job.transcriptionData.confidence * 100).toFixed(1)}%</p>
              <p>Duration: {job.transcriptionData.duration?.toFixed(1)}s</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Transcription Modal Component
const TranscriptionModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  job: UploadJob | null;
}> = ({ isOpen, onClose, job }) => {
  const [activeTab, setActiveTab] = useState('text');

  if (!isOpen || !job?.transcriptionData) return null;

  const downloadTranscription = (format: string) => {
    const data = job.transcriptionData;
    let content = '';
    let filename = '';
    let mimeType = '';

    switch (format) {
      case 'txt':
        content = data.text;
        filename = `${job.filename.split('.')[0]}_transcription.txt`;
        mimeType = 'text/plain';
        break;
      case 'json':
        content = JSON.stringify(data, null, 2);
        filename = `${job.filename.split('.')[0]}_transcription.json`;
        mimeType = 'application/json';
        break;
      case 'srt':
        // Generate basic SRT format
        content = data.segments?.map((segment: any, index: number) => {
          const start = formatSRTTime(segment.start);
          const end = formatSRTTime(segment.end);
          return `${index + 1}\n${start} --> ${end}\n${segment.text}\n`;
        }).join('\n') || data.text;
        filename = `${job.filename.split('.')[0]}_captions.srt`;
        mimeType = 'text/plain';
        break;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatSRTTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{job.filename}</h2>
              <p className="text-sm text-gray-500 mt-1">
                Transcription completed • Confidence: {(job.transcriptionData.confidence * 100).toFixed(1)}%
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
          
          <div className="flex space-x-4 mt-4">
            <button
              onClick={() => setActiveTab('text')}
              className={`px-3 py-1 text-sm font-medium rounded ${
                activeTab === 'text' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Transcription
            </button>
            <button
              onClick={() => setActiveTab('metadata')}
              className={`px-3 py-1 text-sm font-medium rounded ${
                activeTab === 'metadata' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Metadata
            </button>
            <button
              onClick={() => setActiveTab('segments')}
              className={`px-3 py-1 text-sm font-medium rounded ${
                activeTab === 'segments' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Segments
            </button>
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-96">
          {activeTab === 'text' && (
            <div className="prose max-w-none">
              <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                {job.transcriptionData.text}
              </p>
            </div>
          )}
          
          {activeTab === 'metadata' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Duration:</span>
                  <span className="ml-2 text-gray-600">{job.transcriptionData.duration?.toFixed(1)}s</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Language:</span>
                  <span className="ml-2 text-gray-600">{job.transcriptionData.metadata?.language || 'en'}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Processing Time:</span>
                  <span className="ml-2 text-gray-600">{job.transcriptionData.metadata?.processingTime?.toFixed(1)}s</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Salad Job ID:</span>
                  <span className="ml-2 text-gray-600 font-mono text-xs">{job.transcriptionData.metadata?.saladJobId}</span>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'segments' && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {job.transcriptionData.segments?.map((segment: any, index: number) => (
                <div key={index} className="flex justify-between items-center py-1 px-2 bg-gray-50 rounded text-sm">
                  <span className="font-medium">{segment.text}</span>
                  <div className="text-gray-500 space-x-2">
                    <span>{segment.start?.toFixed(2)}s</span>
                    <span>→</span>
                    <span>{segment.end?.toFixed(2)}s</span>
                    {segment.speaker && <span className="text-xs">({segment.speaker})</span>}
                  </div>
                </div>
              )) || <p className="text-gray-500">No segments available</p>}
            </div>
          )}
        </div>
        
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">Download transcription in different formats:</p>
            <div className="flex space-x-2">
              <button
                onClick={() => downloadTranscription('txt')}
                className="flex items-center space-x-1 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
              >
                <Download size={14} />
                <span>TXT</span>
              </button>
              <button
                onClick={() => downloadTranscription('json')}
                className="flex items-center space-x-1 px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
              >
                <Download size={14} />
                <span>JSON</span>
              </button>
              <button
                onClick={() => downloadTranscription('srt')}
                className="flex items-center space-x-1 px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 transition-colors"
              >
                <Download size={14} />
                <span>SRT</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main App Component
const TranscriptionApp: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>({
    accessToken: '',
    workerEndpoint: 'https://transcription-worker.mike-522.workers.dev',
  });
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<UploadJob | null>(null);
  const [showTranscription, setShowTranscription] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Load config from localStorage on mount
  useEffect(() => {
    const savedConfig = localStorage.getItem('transcription-config');
    if (savedConfig) {
      const parsedConfig = JSON.parse(savedConfig);
      setConfig(parsedConfig);
      if (parsedConfig.accessToken) {
        validateToken(parsedConfig.accessToken);
      }
    }
  }, []);

  // Poll for job status updates
  useEffect(() => {
    const interval = setInterval(async () => {
      const processingJobs = jobs.filter(job => 
        job.status === 'processing' || job.status === 'uploaded'
      );
      
      for (const job of processingJobs) {
        try {
          const status = await api.getJobStatus(job.id, config.accessToken, config.workerEndpoint);
          if (status.status === 'completed') {
            setJobs(prev => prev.map(j => 
              j.id === job.id 
                ? { 
                    ...j, 
                    status: 'completed', 
                    transcriptionData: status.transcriptionData,
                    completedAt: new Date().toISOString()
                  }
                : j
            ));
          } else if (status.status === 'error') {
            setJobs(prev => prev.map(j => 
              j.id === job.id 
                ? { ...j, status: 'error', errorMessage: status.errorMessage || 'Transcription failed' }
                : j
            ));
          }
        } catch (error) {
          console.error('Error checking job status:', error);
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobs, config.accessToken, config.workerEndpoint]);

  const validateToken = async (token: string) => {
    setIsLoading(true);
    setAuthError('');
    
    try {
      const isValid = await api.validateToken(token, config.workerEndpoint);
      if (isValid) {
        setIsAuthenticated(true);
        setConfig(prev => ({ ...prev, accessToken: token }));
        localStorage.setItem('transcription-config', JSON.stringify({ ...config, accessToken: token }));
      } else {
        setAuthError('Invalid access token');
        setIsAuthenticated(false);
      }
    } catch (error) {
      setAuthError('Failed to validate token');
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = () => {
    const tokenInput = document.getElementById('token') as HTMLInputElement;
    if (tokenInput?.value) {
      validateToken(tokenInput.value);
    }
  };

  const handleConfigSave = (newConfig: AppConfig) => {
    setConfig(newConfig);
    localStorage.setItem('transcription-config', JSON.stringify(newConfig));
    if (newConfig.accessToken !== config.accessToken) {
      validateToken(newConfig.accessToken);
    }
  };

  const handleFileUpload = async (files: FileList) => {
    if (!isAuthenticated) return;

    for (const file of Array.from(files)) {
      // Validate file type
      if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
        alert(`${file.name} is not a valid audio or video file`);
        continue;
      }

      // Create job
      const job: UploadJob = {
        id: `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        filename: file.name,
        fileSize: file.size,
        fileType: file.type,
        status: 'uploading',
        uploadProgress: 0,
        createdAt: new Date().toISOString()
      };

      setJobs(prev => [job, ...prev]);

      try {
        // Get signed upload URL
        const { uploadUrl, jobId } = await api.getSignedUploadUrl(file.name, config.accessToken, config.workerEndpoint);
        
        // Update job with real ID
        setJobs(prev => prev.map(j => 
          j.id === job.id ? { ...j, id: jobId } : j
        ));
        
        // Upload file
        await api.uploadFile(uploadUrl, file, config.accessToken, (progress) => {
          setJobs(prev => prev.map(j => 
            j.id === jobId ? { ...j, uploadProgress: progress } : j
          ));
        });

        // Update job status
        setJobs(prev => prev.map(j => 
          j.id === jobId 
            ? { ...j, status: 'processing', uploadProgress: 100 }
            : j
        ));

      } catch (error) {
        setJobs(prev => prev.map(j => 
          j.id === job.id 
            ? { ...j, status: 'error', errorMessage: 'Upload failed' }
            : j
        ));
      }
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (e.dataTransfer.files) {
      handleFileUpload(e.dataTransfer.files);
    }
  }, [isAuthenticated]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileUpload(e.target.files);
    }
  };

  const handleViewTranscription = (job: UploadJob) => {
    setSelectedJob(job);
    setShowTranscription(true);
  };

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Transcription Tool</h1>
              <p className="text-gray-600 mt-2">Enter your access token to continue</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-1">
                  Access Token
                </label>
                <input
                  type="password"
                  id="token"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your access token"
                />
              </div>
              
              {authError && (
                <p className="text-red-600 text-sm">{authError}</p>
              )}
              
              <button
                onClick={handleLogin}
                disabled={isLoading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={16} />
                    Validating...
                  </>
                ) : (
                  'Access Tool'
                )}
              </button>
            </div>
            
            <div className="mt-6 text-center">
              <button
                onClick={() => setShowConfig(true)}
                className="text-blue-600 hover:text-blue-800 text-sm flex items-center justify-center mx-auto"
              >
                <Settings size={16} className="mr-1" />
                Configuration
              </button>
            </div>
          </div>
        </div>
        
        <ConfigModal
          isOpen={showConfig}
          onClose={() => setShowConfig(false)}
          config={config}
          onSave={handleConfigSave}
        />
      </div>
    );
  }

  // Main app interface
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Transcription Tool</h1>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowConfig(true)}
                className="text-gray-600 hover:text-gray-900 p-2 rounded-md hover:bg-gray-100"
                title="Settings"
              >
                <Settings size={20} />
              </button>
              <button
                onClick={() => {
                  setIsAuthenticated(false);
                  localStorage.removeItem('transcription-config');
                }}
                className="text-red-600 hover:text-red-800 text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Upload Area */}
        <div className="mb-8">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragOver 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 bg-white hover:border-gray-400'
            }`}
          >
            <Upload className={`mx-auto mb-4 ${isDragOver ? 'text-blue-500' : 'text-gray-400'}`} size={48} />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Drop your audio or video files here
            </h3>
            <p className="text-gray-600 mb-4">
              Supports MP3, M4A, MP4, WAV and other common formats • Up to 2.5 hours per file
            </p>
            
            <div className="space-y-2">
              <label className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 cursor-pointer transition-colors">
                <Upload size={16} className="mr-2" />
                Choose Files
                <input
                  type="file"
                  multiple
                  accept="audio/*,video/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
              
              <p className="text-xs text-gray-500">
                Or drag and drop files directly onto this area
              </p>
            </div>
          </div>
        </div>

        {/* Jobs List */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Recent Uploads ({jobs.length})
            </h2>
            {jobs.length > 0 && (
              <button
                onClick={() => setJobs([])}
                className="text-red-600 hover:text-red-800 text-sm font-medium"
              >
                Clear All
              </button>
            )}
          </div>
          
          {jobs.length === 0 ? (
            <div className="text-center py-12">
              <FileAudio className="mx-auto text-gray-300 mb-4" size={48} />
              <p className="text-gray-500">No uploads yet. Drop some files to get started!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  onViewTranscription={handleViewTranscription}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      <ConfigModal
        isOpen={showConfig}
        onClose={() => setShowConfig(false)}
        config={config}
        onSave={handleConfigSave}
      />
      
      <TranscriptionModal
        isOpen={showTranscription}
        onClose={() => setShowTranscription(false)}
        job={selectedJob}
      />
    </div>
  );
};

export default TranscriptionApp;
