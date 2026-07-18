const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
  'application/zip',
  'application/x-zip-compressed',
  'text/plain'
]);

/** Images (any image/*), PDF, DOCX, XLSX, ZIP, TXT — per DocVault's supported upload types. */
export function isSupportedDocumentType(file: File): boolean {

  if (file.type.startsWith('image/')) {
    return true;
  }

  return SUPPORTED_MIME_TYPES.has(file.type);

}

export function unsupportedFileTypeMessage(file: File): string {
  return `"${file.name}" isn't a supported file type. DocVault accepts images, PDF, DOCX, XLSX, ZIP, and TXT files.`;
}

/** Same PDF check used across the documents list, thumbnailing, and the PDF viewer — one definition so they can't drift apart. */
export function isPdfDocument(doc: { file_type?: string; local_file_name?: string; file_url?: string }): boolean {

  if (doc.file_type === 'application/pdf') {
    return true;
  }

  const name = doc.local_file_name || doc.file_url || '';
  return name.toLowerCase().includes('.pdf');
}
