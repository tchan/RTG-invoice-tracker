import Database from 'better-sqlite3';
import path from 'path';
import { InvoiceRecord, ParsedInvoiceData } from './invoiceTypes';

const DB_PATH = path.join(process.cwd(), 'data', 'invoices.db');

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    const fs = require('fs');
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initDatabase();
  }
  return db;
}

function initDatabase(): void {
  const database = db!;

  database.exec(`
    CREATE TABLE IF NOT EXISTS uploaded_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      content_hash TEXT UNIQUE NOT NULL,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_amount REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS invoice_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      record_data TEXT NOT NULL,
      kilometers REAL DEFAULT NULL,
      FOREIGN KEY (file_id) REFERENCES uploaded_files(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS file_columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      column_name TEXT NOT NULL,
      FOREIGN KEY (file_id) REFERENCES uploaded_files(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_content_hash ON uploaded_files(content_hash);
    CREATE INDEX IF NOT EXISTS idx_filename ON uploaded_files(filename);
    CREATE INDEX IF NOT EXISTS idx_file_id ON invoice_records(file_id);

    CREATE TABLE IF NOT EXISTS distance_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origin_address TEXT NOT NULL,
      destination_address TEXT NOT NULL,
      distance_km REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(origin_address, destination_address)
    );

    CREATE INDEX IF NOT EXISTS idx_distance_origin ON distance_cache(origin_address);
    CREATE INDEX IF NOT EXISTS idx_distance_destination ON distance_cache(destination_address);

    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address_type TEXT NOT NULL,
      client_name TEXT,
      address TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(address_type, client_name)
    );

    CREATE INDEX IF NOT EXISTS idx_address_type ON addresses(address_type);
    CREATE INDEX IF NOT EXISTS idx_client_name ON addresses(client_name);
  `);

  // Migration: Add kilometers column if it doesn't exist
  try {
    database.exec(`ALTER TABLE invoice_records ADD COLUMN kilometers REAL DEFAULT NULL`);
  } catch {
    // Column already exists, ignore error
  }
}

export interface UploadedFile {
  id: number;
  filename: string;
  content_hash: string;
  uploaded_at: string;
  total_amount: number;
}

export function getFileByHash(hash: string): UploadedFile | undefined {
  const database = getDatabase();
  return database.prepare('SELECT * FROM uploaded_files WHERE content_hash = ?').get(hash) as UploadedFile | undefined;
}

export function getFileByFilename(filename: string): UploadedFile | undefined {
  const database = getDatabase();
  return database.prepare('SELECT * FROM uploaded_files WHERE filename = ?').get(filename) as UploadedFile | undefined;
}

export function getFileRecords(fileId: number): InvoiceRecord[] {
  const database = getDatabase();
  const rows = database.prepare('SELECT id, record_data, kilometers FROM invoice_records WHERE file_id = ?').all(fileId) as { id: number; record_data: string; kilometers: number | null }[];
  return rows.map(row => {
    const record = JSON.parse(row.record_data);
    record._dbId = row.id; // Store the database ID for updates
    if (row.kilometers !== null) {
      record.kilometers = row.kilometers;
    }
    return record;
  });
}

export function getFileColumns(fileId: number): string[] {
  const database = getDatabase();
  const rows = database.prepare('SELECT column_name FROM file_columns WHERE file_id = ?').all(fileId) as { column_name: string }[];
  return rows.map(row => row.column_name);
}

export function saveInvoiceData(
  filename: string,
  contentHash: string,
  data: ParsedInvoiceData
): number {
  const database = getDatabase();

  const insertFile = database.prepare(`
    INSERT INTO uploaded_files (filename, content_hash, total_amount)
    VALUES (?, ?, ?)
  `);

  const insertRecord = database.prepare(`
    INSERT INTO invoice_records (file_id, record_data)
    VALUES (?, ?)
  `);

  const insertColumn = database.prepare(`
    INSERT INTO file_columns (file_id, column_name)
    VALUES (?, ?)
  `);

  const transaction = database.transaction(() => {
    const result = insertFile.run(filename, contentHash, data.totalAmount || 0);
    const fileId = result.lastInsertRowid as number;

    // Save records with dates serialized
    for (const record of data.records) {
      const serializedRecord = serializeRecord(record);
      insertRecord.run(fileId, JSON.stringify(serializedRecord));
    }

    // Save columns
    for (const column of data.columns) {
      insertColumn.run(fileId, column);
    }

    return fileId;
  });

  return transaction();
}

export function deleteFile(fileId: number): void {
  const database = getDatabase();
  database.prepare('DELETE FROM uploaded_files WHERE id = ?').run(fileId);
}

export function getAllUploadedFiles(): UploadedFile[] {
  const database = getDatabase();
  return database.prepare('SELECT * FROM uploaded_files ORDER BY uploaded_at DESC').all() as UploadedFile[];
}

export function getAllInvoices(): {
  files: UploadedFile[];
  records: InvoiceRecord[];
  columns: string[];
  totalAmount: number;
} {
  const database = getDatabase();
  const files = getAllUploadedFiles();

  if (files.length === 0) {
    return { files: [], records: [], columns: [], totalAmount: 0 };
  }

  // Collect all records
  const allRecords: InvoiceRecord[] = [];
  const columnSet = new Set<string>();
  let totalAmount = 0;

  for (const file of files) {
    const records = getFileRecords(file.id);
    const columns = getFileColumns(file.id);

    // Deserialize dates in records
    for (const record of records) {
      allRecords.push(deserializeRecord(record));
    }

    columns.forEach(col => columnSet.add(col));
    totalAmount += file.total_amount;
  }

  return {
    files,
    records: allRecords,
    columns: Array.from(columnSet),
    totalAmount
  };
}

export interface DiffResult {
  added: InvoiceRecord[];
  removed: InvoiceRecord[];
  modified: { old: InvoiceRecord; new: InvoiceRecord }[];
  unchanged: number;
}

export function compareFileData(existingFileId: number, newData: ParsedInvoiceData): DiffResult {
  const existingRecords = getFileRecords(existingFileId).map(r => deserializeRecord(r));
  const newRecords = newData.records;

  const diff: DiffResult = {
    added: [],
    removed: [],
    modified: [],
    unchanged: 0
  };

  // Create a key function for comparing records (using Lesson Date + Client Name)
  const getRecordKey = (record: InvoiceRecord): string => {
    const date = record['Lesson Date'];
    const dateStr = date instanceof Date ? date.toISOString() : String(date || '');
    const client = String(record['Client Name'] || '');
    return `${dateStr}|${client}`;
  };

  const existingByKey = new Map<string, InvoiceRecord>();
  for (const record of existingRecords) {
    existingByKey.set(getRecordKey(record), record);
  }

  const newByKey = new Map<string, InvoiceRecord>();
  for (const record of newRecords) {
    newByKey.set(getRecordKey(record), record);
  }

  // Find added and modified
  for (const [key, newRecord] of newByKey) {
    const existingRecord = existingByKey.get(key);
    if (!existingRecord) {
      diff.added.push(newRecord);
    } else {
      // Compare all fields
      const isModified = !recordsEqual(existingRecord, newRecord);
      if (isModified) {
        diff.modified.push({ old: existingRecord, new: newRecord });
      } else {
        diff.unchanged++;
      }
    }
  }

  // Find removed
  for (const [key, existingRecord] of existingByKey) {
    if (!newByKey.has(key)) {
      diff.removed.push(existingRecord);
    }
  }

  return diff;
}

function recordsEqual(a: InvoiceRecord, b: InvoiceRecord): boolean {
  const aKeys = Object.keys(a).filter(k => a[k] !== null && a[k] !== undefined);
  const bKeys = Object.keys(b).filter(k => b[k] !== null && b[k] !== undefined);

  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    const aVal = a[key];
    const bVal = b[key];

    if (aVal instanceof Date && bVal instanceof Date) {
      if (aVal.getTime() !== bVal.getTime()) return false;
    } else if (aVal !== bVal) {
      return false;
    }
  }

  return true;
}

function serializeRecord(record: InvoiceRecord): InvoiceRecord {
  const serialized: InvoiceRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (value instanceof Date) {
      serialized[key] = value.toISOString();
    } else {
      serialized[key] = value;
    }
  }
  return serialized;
}

function deserializeRecord(record: InvoiceRecord): InvoiceRecord {
  const deserialized: InvoiceRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string' && key.toLowerCase().includes('date')) {
      // Try to parse as date
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        deserialized[key] = date;
      } else {
        deserialized[key] = value;
      }
    } else {
      deserialized[key] = value;
    }
  }
  return deserialized;
}

export function replaceFile(existingFileId: number, filename: string, contentHash: string, data: ParsedInvoiceData): number {
  const database = getDatabase();

  const transaction = database.transaction(() => {
    // Delete existing file (cascade will delete records and columns)
    deleteFile(existingFileId);
    // Save new file
    return saveInvoiceData(filename, contentHash, data);
  });

  return transaction();
}

export function mergeFile(existingFileId: number, filename: string, contentHash: string, data: ParsedInvoiceData): number {
  const database = getDatabase();
  const existingRecords = getFileRecords(existingFileId);
  const existingColumns = getFileColumns(existingFileId);
  const existingFile = database.prepare('SELECT * FROM uploaded_files WHERE id = ?').get(existingFileId) as UploadedFile;

  // Merge records (keeping existing + adding new)
  const getRecordKey = (record: InvoiceRecord): string => {
    const date = record['Lesson Date'];
    const dateStr = date instanceof Date ? date.toISOString() : String(date || '');
    const client = String(record['Client Name'] || '');
    return `${dateStr}|${client}`;
  };

  const existingKeys = new Set(existingRecords.map(getRecordKey));
  const newRecords = data.records.filter(r => !existingKeys.has(getRecordKey(r)));

  const mergedData: ParsedInvoiceData = {
    records: [...existingRecords.map(deserializeRecord), ...newRecords],
    columns: [...new Set([...existingColumns, ...data.columns])],
    totalAmount: (existingFile.total_amount || 0) + (data.totalAmount || 0)
  };

  const transaction = database.transaction(() => {
    deleteFile(existingFileId);
    return saveInvoiceData(filename, contentHash, mergedData);
  });

  return transaction();
}

// Distance cache functions
export interface CachedDistance {
  id: number;
  origin_address: string;
  destination_address: string;
  distance_km: number;
  created_at: string;
}

export function getCachedDistance(origin: string, destination: string): number | null {
  const database = getDatabase();

  // Normalize addresses for consistent caching
  const normalizedOrigin = origin.trim().toLowerCase();
  const normalizedDest = destination.trim().toLowerCase();

  // Check both directions since distance is the same
  const result = database.prepare(`
    SELECT distance_km FROM distance_cache
    WHERE (origin_address = ? AND destination_address = ?)
       OR (origin_address = ? AND destination_address = ?)
  `).get(normalizedOrigin, normalizedDest, normalizedDest, normalizedOrigin) as { distance_km: number } | undefined;

  return result ? result.distance_km : null;
}

export function setCachedDistance(origin: string, destination: string, distanceKm: number): void {
  const database = getDatabase();

  // Normalize addresses for consistent caching
  const normalizedOrigin = origin.trim().toLowerCase();
  const normalizedDest = destination.trim().toLowerCase();

  database.prepare(`
    INSERT OR REPLACE INTO distance_cache (origin_address, destination_address, distance_km)
    VALUES (?, ?, ?)
  `).run(normalizedOrigin, normalizedDest, distanceKm);
}

export function getAllCachedDistances(): CachedDistance[] {
  const database = getDatabase();
  return database.prepare('SELECT * FROM distance_cache ORDER BY created_at DESC').all() as CachedDistance[];
}

export function clearDistanceCacheDb(): void {
  const database = getDatabase();
  database.prepare('DELETE FROM distance_cache').run();
}

// Update kilometers for a specific invoice record
export function updateInvoiceKilometers(recordId: number, kilometers: number): void {
  const database = getDatabase();
  database.prepare('UPDATE invoice_records SET kilometers = ? WHERE id = ?').run(kilometers, recordId);
}

// Batch update kilometers for multiple records
export function updateMultipleInvoiceKilometers(updates: { recordId: number; kilometers: number }[]): void {
  const database = getDatabase();
  const update = database.prepare('UPDATE invoice_records SET kilometers = ? WHERE id = ?');

  const transaction = database.transaction(() => {
    for (const { recordId, kilometers } of updates) {
      update.run(kilometers, recordId);
    }
  });

  transaction();
}

// Address functions
export interface StoredAddress {
  id: number;
  address_type: 'home' | 'client';
  client_name: string | null;
  address: string;
  created_at: string;
  updated_at: string;
}

export function getHomeAddressDb(): string | null {
  const database = getDatabase();
  const result = database.prepare(`
    SELECT address FROM addresses WHERE address_type = 'home'
  `).get() as { address: string } | undefined;
  return result ? result.address : null;
}

export function setHomeAddressDb(address: string): void {
  const database = getDatabase();
  database.prepare(`
    INSERT INTO addresses (address_type, client_name, address, updated_at)
    VALUES ('home', NULL, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(address_type, client_name) DO UPDATE SET
      address = excluded.address,
      updated_at = CURRENT_TIMESTAMP
  `).run(address);
}

export function getClientAddressDb(clientName: string): string | null {
  const database = getDatabase();
  const result = database.prepare(`
    SELECT address FROM addresses WHERE address_type = 'client' AND client_name = ?
  `).get(clientName) as { address: string } | undefined;
  return result ? result.address : null;
}

export function setClientAddressDb(clientName: string, address: string): void {
  const database = getDatabase();
  database.prepare(`
    INSERT INTO addresses (address_type, client_name, address, updated_at)
    VALUES ('client', ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(address_type, client_name) DO UPDATE SET
      address = excluded.address,
      updated_at = CURRENT_TIMESTAMP
  `).run(clientName, address);
}

export function getAllClientAddressesDb(): { [clientName: string]: string } {
  const database = getDatabase();
  const rows = database.prepare(`
    SELECT client_name, address FROM addresses WHERE address_type = 'client'
  `).all() as { client_name: string; address: string }[];

  const addresses: { [clientName: string]: string } = {};
  for (const row of rows) {
    addresses[row.client_name] = row.address;
  }
  return addresses;
}

export function removeClientAddressDb(clientName: string): void {
  const database = getDatabase();
  database.prepare(`
    DELETE FROM addresses WHERE address_type = 'client' AND client_name = ?
  `).run(clientName);
}

export function setAllClientAddressesDb(addresses: { [clientName: string]: string }): void {
  const database = getDatabase();

  const deleteAll = database.prepare(`DELETE FROM addresses WHERE address_type = 'client'`);
  const insert = database.prepare(`
    INSERT INTO addresses (address_type, client_name, address)
    VALUES ('client', ?, ?)
  `);

  const transaction = database.transaction(() => {
    deleteAll.run();
    for (const [clientName, address] of Object.entries(addresses)) {
      insert.run(clientName, address);
    }
  });

  transaction();
}
