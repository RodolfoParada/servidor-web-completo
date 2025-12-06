// data/multipart.js
const os = require('os');
const path = require('path');
const fs = require('fs');

function parseMultipart(req, rawBuffer) {
  // Extrae boundary
  const ct = req.headers['content-type'] || '';
  const m = ct.match(/boundary=(.+)$/);
  if (!m) return { fields: {}, files: {} };

  const boundary = '--' + m[1];
  const parts = rawBuffer.toString().split(boundary).slice(1, -1);

  const fields = {};
  const files = {};

  parts.forEach(part => {
    const [rawHeaders, ...rest] = part.split('\r\n\r\n');
    const body = rest.join('\r\n\r\n').slice(0, -2); // quitar final CRLF

    const hdLines = rawHeaders.split('\r\n').filter(Boolean);
    const cdLine = hdLines.find(l => l.toLowerCase().includes('content-disposition'));
    if (!cdLine) return;

    const nameMatch = cdLine.match(/name="([^"]+)"/);
    const filenameMatch = cdLine.match(/filename="([^"]+)"/);

    if (filenameMatch) {
      const filename = path.basename(filenameMatch[1]);
      const tmpPath = path.join(os.tmpdir(), `${Date.now()}-${filename}`);
      fs.writeFileSync(tmpPath, body, 'binary');
      files[nameMatch[1]] = { filename, path: tmpPath, size: Buffer.byteLength(body, 'binary') };
    } else {
      fields[nameMatch[1]] = body;
    }
  });

  return { fields, files };
}

module.exports = { parseMultipart };
