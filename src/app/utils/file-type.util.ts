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