export type PackageInspectionManifest = {
  plugin_key: string | null;
  display_name: string | null;
  version: string | null;
  description: string | null;
  capabilities: string[];
  tags: string[];
  categories: string[];
  declared_channel: string | null;
  os_support: string[];
  permissions: string[];
};

export type PackageInspectionSignature = {
  status: 'signed' | 'unsigned' | 'invalid';
  key_id: string | null;
  algorithm: string | null;
};

export type PackageInspectionPackageMetadata = {
  distribution_channel: string | null;
};

export type PackageClientInspection = {
  manifest: PackageInspectionManifest | null;
  package_metadata: PackageInspectionPackageMetadata | null;
  signature: PackageInspectionSignature;
  warnings: string[];
  errors: string[];
};

const textDecoder = new TextDecoder('utf-8');
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

type ZipEntry = {
  filename: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
};

function bytesToString(bytes: Uint8Array) {
  return textDecoder.decode(bytes);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function hasPrefix(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const DecompressionStreamCtor = (globalThis as unknown as {
    DecompressionStream?: new (format: string) => TransformStream<Uint8Array, Uint8Array>;
  }).DecompressionStream;

  if (!DecompressionStreamCtor) {
    throw new Error('This browser cannot inspect compressed .lspkg files because DecompressionStream is unavailable.');
  }

  const rawBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const stream = new Blob([rawBuffer]).stream().pipeThrough(new DecompressionStreamCtor('deflate-raw'));
  const arrayBuffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

function findEndOfCentralDirectory(view: DataView) {
  const minIndex = Math.max(0, view.byteLength - 65557);
  for (let index = view.byteLength - 22; index >= minIndex; index -= 1) {
    if (view.getUint32(index, true) === EOCD_SIGNATURE) return index;
  }
  return -1;
}

function listZipEntries(view: DataView): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(view);
  if (eocdOffset < 0) throw new Error('Invalid ZIP container. End of central directory was not found.');

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const entries: ZipEntry[] = [];
  let cursor = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (view.getUint32(cursor, true) !== CENTRAL_FILE_HEADER_SIGNATURE) {
      throw new Error('Invalid ZIP container. Central directory entry is corrupted.');
    }

    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const filenameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const filenameStart = cursor + 46;
    const filename = bytesToString(new Uint8Array(view.buffer.slice(filenameStart, filenameStart + filenameLength)));

    entries.push({
      filename,
      compressionMethod,
      compressedSize,
      localHeaderOffset,
    });

    cursor += 46 + filenameLength + extraLength + commentLength;
  }

  return entries;
}

async function readZipEntryBytes(view: DataView, entry: ZipEntry): Promise<Uint8Array> {
  const localOffset = entry.localHeaderOffset;
  if (view.getUint32(localOffset, true) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error(`Invalid ZIP container. Local header is missing for ${entry.filename}.`);
  }

  const filenameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  const dataStart = localOffset + 30 + filenameLength + extraLength;
  const raw = new Uint8Array(view.buffer.slice(dataStart, dataStart + entry.compressedSize));

  if (entry.compressionMethod === 0) return raw;
  if (entry.compressionMethod === 8) return inflateRaw(raw);

  throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod} in ${entry.filename}.`);
}

async function readZipTextFile(view: DataView, filename: string): Promise<string | null> {
  const target = filename.toLowerCase();
  const entries = listZipEntries(view);
  const entry = entries.find((item) => item.filename.toLowerCase() === target);
  if (!entry) return null;
  return bytesToString(await readZipEntryBytes(view, entry));
}

function parseJson(text: string | null) {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function collectCapabilities(manifest: Record<string, unknown>) {
  return asStringList(manifest.capabilities);
}

function collectOsSupport(manifest: Record<string, unknown>, packageMetadata: Record<string, unknown>) {
  const compatibility = asRecord(manifest.compatibility);
  return [...new Set([
    ...asStringList(manifest.os_support),
    ...asStringList(compatibility.os_support),
    ...asStringList(packageMetadata.os_support),
  ])];
}

function collectPermissions(manifest: Record<string, unknown>) {
  const permissions = manifest.permissions;
  if (Array.isArray(permissions)) {
    return permissions
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        const obj = asRecord(item);
        return String(obj.permission ?? obj.key ?? obj.name ?? '').trim();
      })
      .filter(Boolean);
  }
  return [];
}

export async function readFileBytes(file: File) {
  return new Uint8Array(await file.arrayBuffer());
}

export function isZipMagic(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && [0x03, 0x05, 0x07].includes(bytes[2]);
}

export function detectImageKind(bytes: Uint8Array): 'png' | 'jpeg' | 'webp' | 'gif' | null {
  if (bytes.length >= 8 && hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (bytes.length >= 3 && hasPrefix(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (
    bytes.length >= 12
    && hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46])
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  ) {
    return 'webp';
  }
  if (bytes.length >= 6) {
    const header = bytesToString(bytes.slice(0, 6));
    if (header === 'GIF87a' || header === 'GIF89a') return 'gif';
  }
  return null;
}

export async function inspectLspkgFile(file: File): Promise<PackageClientInspection> {
  const warnings: string[] = [];
  const errors: string[] = [];

  const bytes = await readFileBytes(file);
  if (!isZipMagic(bytes)) {
    return {
      manifest: null,
      package_metadata: null,
      signature: { status: 'invalid', key_id: null, algorithm: null },
      warnings,
      errors: ['Package is not a valid ZIP-based .lspkg file.'],
    };
  }

  const view = new DataView(bytes.buffer);

  let manifestJson: unknown = null;
  let packageMetadataJson: unknown = null;
  let signatureJson: unknown = null;

  try {
    manifestJson = parseJson(await readZipTextFile(view, 'manifest.json'));
    packageMetadataJson = parseJson(await readZipTextFile(view, 'package-metadata.json'));
    signatureJson = parseJson(await readZipTextFile(view, 'signature.json'));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unable to inspect package contents.');
  }

  const manifestRecord = asRecord(manifestJson);
  const packageMetadataRecord = asRecord(packageMetadataJson);
  const signatureRecord = asRecord(signatureJson);

  if (!Object.keys(manifestRecord).length) errors.push('manifest.json was not found or could not be parsed.');
  if (!Object.keys(packageMetadataRecord).length) warnings.push('package-metadata.json was not found or could not be parsed.');

  const signatureStatus: PackageInspectionSignature['status'] = !signatureJson
    ? 'unsigned'
    : Object.keys(signatureRecord).length
      ? 'signed'
      : 'invalid';

  if (signatureStatus === 'unsigned') warnings.push('Package is unsigned.');
  if (signatureStatus === 'invalid') errors.push('signature.json exists but could not be parsed.');

  const manifest = Object.keys(manifestRecord).length
    ? {
        plugin_key: typeof manifestRecord.plugin_key === 'string' ? manifestRecord.plugin_key : null,
        display_name: typeof manifestRecord.display_name === 'string' ? manifestRecord.display_name : null,
        version: typeof manifestRecord.version === 'string' ? manifestRecord.version : null,
        description: typeof manifestRecord.description === 'string' ? manifestRecord.description : null,
        capabilities: collectCapabilities(manifestRecord),
        tags: asStringList(manifestRecord.tags ?? manifestRecord.keywords),
        categories: asStringList(manifestRecord.categories),
        declared_channel:
          typeof manifestRecord.declared_channel === 'string'
            ? manifestRecord.declared_channel
            : typeof packageMetadataRecord.distribution_channel === 'string'
              ? packageMetadataRecord.distribution_channel
              : null,
        os_support: collectOsSupport(manifestRecord, packageMetadataRecord),
        permissions: collectPermissions(manifestRecord),
      }
    : null;

  if (manifest && !manifest.plugin_key) errors.push('manifest.json is missing plugin_key.');
  if (manifest && !manifest.version) errors.push('manifest.json is missing version.');

  return {
    manifest,
    package_metadata: Object.keys(packageMetadataRecord).length
      ? {
          distribution_channel:
            typeof packageMetadataRecord.distribution_channel === 'string'
              ? packageMetadataRecord.distribution_channel
              : null,
        }
      : null,
    signature: {
      status: signatureStatus,
      key_id: typeof signatureRecord.key_id === 'string' ? signatureRecord.key_id : null,
      algorithm: typeof signatureRecord.algorithm === 'string' ? signatureRecord.algorithm : null,
    },
    warnings,
    errors,
  };
}
