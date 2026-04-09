const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// R2 is S3-compatible. The endpoint format is always:
// https://<ACCOUNT_ID>.r2.cloudflarestorage.com
const r2Client = new S3Client({
  region: 'auto', // R2 doesn't use regions — 'auto' is required
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;

/**
 * Upload a single audio file buffer to R2.
 *
 * @param {Buffer} buffer     - Raw file data
 * @param {string} key        - R2 object key, e.g. "HSP001/PAT001/SES001/file_aa.wav"
 * @param {string} mimeType   - e.g. "audio/wav"
 * @returns {Promise<string>} - The R2 key of the uploaded object
 */
async function uploadAudio(buffer, key, mimeType = 'audio/wav') {
  await r2Client.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: mimeType,
  }));
  return key;
}

/**
 * Generate a presigned GET URL for a private R2 object.
 * Valid for 1 hour by default — suitable for in-browser playback.
 * If R2_PUBLIC_URL is set (public bucket), returns a direct URL instead.
 *
 * @param {string} key
 * @param {number} expiresInSeconds
 */
async function getAudioUrl(key, expiresInSeconds = 3600) {
  if (process.env.R2_PUBLIC_URL) {
    return `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  }
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: key });
  // Use GetObjectCommand for presigned read URLs
  return getSignedUrl(r2Client, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

/**
 * Delete a single object from R2.
 */
async function deleteObject(key) {
  await r2Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Delete all objects under a prefix (e.g. all files for a patient or hospital).
 * Used for data deletion / offboarding.
 *
 * @param {string} prefix  - e.g. "HSP001/PAT001/"
 */
async function deletePrefix(prefix) {
  const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
  const listed = await r2Client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }));
  if (!listed.Contents || listed.Contents.length === 0) return;
  await r2Client.send(new DeleteObjectsCommand({
    Bucket: BUCKET,
    Delete: { Objects: listed.Contents.map((o) => ({ Key: o.Key })) },
  }));
}

/**
 * Build the R2 key for a track file.
 * Path: {hospitalID}/{patientID}/{sessionID}/{fileName}
 */
function buildTrackKey(hospitalID, patientID, sessionID, fileName) {
  return `${hospitalID}/${patientID}/${sessionID}/${fileName}`;
}

/**
 * Download a single object from R2 and return it as a Buffer.
 * Used by the analysis pipeline to fetch WAV files to a local temp directory.
 *
 * @param {string} key  - R2 object key
 * @returns {Promise<Buffer>}
 */
async function downloadAudio(key) {
  const response = await r2Client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

module.exports = { r2Client, uploadAudio, getAudioUrl, downloadAudio, deleteObject, deletePrefix, buildTrackKey };