import React, { useCallback } from 'react';
import { Upload } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (files: FileList) => void;
}

export function FileUpload({ onFileSelect }: FileUploadProps) {
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      onFileSelect(files);
    }
  }, [onFileSelect]);

  return (
    <div
      className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        type="file"
        id="fileInput"
        className="hidden"
        multiple
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={(e) => e.target.files && onFileSelect(e.target.files)}
      />
      <label
        htmlFor="fileInput"
        className="cursor-pointer flex flex-col items-center gap-2"
      >
        <Upload className="w-12 h-12 text-gray-400" />
        <p className="text-lg font-medium text-gray-700">
          Drop files here or click to upload
        </p>
        <p className="text-sm text-gray-500">
          Supports PDF, JPG, JPEG, PNG
        </p>
      </label>
    </div>
  );
}