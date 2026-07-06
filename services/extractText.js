// Extract plain text from a course file buffer (PDF or Word .docx).
// Returns { text, kind }.

const mammoth = require('mammoth');

async function extractText(buffer, originalName = '') {
  const name = originalName.toLowerCase();

  if (name.endsWith('.pdf')) {
    // Lazy-require so a broken/optional dep doesn't crash startup.
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return { text: (data.text || '').trim(), kind: 'pdf' };
  }

  if (name.endsWith('.docx')) {
    const { value } = await mammoth.extractRawText({ buffer });
    return { text: (value || '').trim(), kind: 'docx' };
  }

  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return { text: buffer.toString('utf8').trim(), kind: 'text' };
  }

  // Legacy .doc is not supported by mammoth (only .docx).
  throw new Error(
    'Unsupported file type for analysis. Please use PDF, DOCX, TXT, or MD (legacy .doc not supported).'
  );
}

module.exports = { extractText };
