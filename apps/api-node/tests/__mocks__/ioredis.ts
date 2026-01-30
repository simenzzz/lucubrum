// Mock for ioredis
import { EventEmitter } from 'events';
import { jest } from '@jest/globals';

interface DataItem {
  value: string;
  expiry?: number;
}

interface HashData {
  [field: string]: string;
}

class MockRedis extends EventEmitter {
  private data = new Map<string, DataItem>();
  private hashData = new Map<string, HashData>();
  private listData = new Map<string, string[]>();

  constructor() {
    super();
  }

  // Internal helpers that don't go through mocks
  private _getValue(key: string): string | null {
    const item = this.data.get(key);
    if (!item) return null;
    if (item.expiry && item.expiry < Date.now()) {
      this.data.delete(key);
      return null;
    }
    return item.value;
  }

  private _setValue(key: string, value: string, expiry?: number): void {
    this.data.set(key, { value, expiry });
  }

  // Public API methods with jest.fn() wrappers for spy/assertion capabilities
  get = jest.fn().mockImplementation(async (key: string): Promise<string | null> => {
    return this._getValue(key);
  });

  set = jest.fn().mockImplementation(async (key: string, value: string, ...args: unknown[]): Promise<string> => {
    let expiry: number | undefined;
    // Handle SET key value EX seconds or SET key value PX milliseconds
    for (let i = 0; i < args.length; i += 2) {
      const option = String(args[i]).toUpperCase();
      const val = args[i + 1];
      if (option === 'EX' && typeof val === 'number') {
        expiry = Date.now() + val * 1000;
      } else if (option === 'PX' && typeof val === 'number') {
        expiry = Date.now() + val;
      }
    }
    this._setValue(key, value, expiry);
    return 'OK';
  });

  setex = jest.fn().mockImplementation(async (key: string, seconds: number, value: string): Promise<string> => {
    const expiry = Date.now() + seconds * 1000;
    this._setValue(key, value, expiry);
    return 'OK';
  });

  del = jest.fn().mockImplementation(async (...keys: string[]): Promise<number> => {
    let count = 0;
    for (const key of keys) {
      if (this.data.has(key) || this.hashData.has(key) || this.listData.has(key)) {
        this.data.delete(key);
        this.hashData.delete(key);
        this.listData.delete(key);
        count++;
      }
    }
    return count;
  });

  expire = jest.fn().mockImplementation(async (key: string, seconds: number): Promise<number> => {
    const item = this.data.get(key);
    if (item) {
      item.expiry = Date.now() + seconds * 1000;
      return 1;
    }
    return 0;
  });

  ttl = jest.fn().mockImplementation(async (key: string): Promise<number> => {
    const item = this.data.get(key);
    if (!item) return -2; // Key doesn't exist
    if (!item.expiry) return -1; // Key exists but has no TTL
    const remaining = Math.ceil((item.expiry - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  });

  exists = jest.fn().mockImplementation(async (...keys: string[]): Promise<number> => {
    let count = 0;
    for (const key of keys) {
      if (this._getValue(key) !== null || this.hashData.has(key) || this.listData.has(key)) {
        count++;
      }
    }
    return count;
  });

  incr = jest.fn().mockImplementation(async (key: string): Promise<number> => {
    const current = parseInt(this._getValue(key) ?? '0', 10);
    const newValue = current + 1;
    this._setValue(key, newValue.toString());
    return newValue;
  });

  incrby = jest.fn().mockImplementation(async (key: string, increment: number): Promise<number> => {
    const current = parseInt(this._getValue(key) ?? '0', 10);
    const newValue = current + increment;
    this._setValue(key, newValue.toString());
    return newValue;
  });

  decr = jest.fn().mockImplementation(async (key: string): Promise<number> => {
    const current = parseInt(this._getValue(key) ?? '0', 10);
    const newValue = current - 1;
    this._setValue(key, newValue.toString());
    return newValue;
  });

  decrby = jest.fn().mockImplementation(async (key: string, decrement: number): Promise<number> => {
    const current = parseInt(this._getValue(key) ?? '0', 10);
    const newValue = current - decrement;
    this._setValue(key, newValue.toString());
    return newValue;
  });

  // Hash operations
  hset = jest.fn().mockImplementation(async (key: string, ...args: unknown[]): Promise<number> => {
    let hash = this.hashData.get(key);
    if (!hash) {
      hash = {};
      this.hashData.set(key, hash);
    }
    let newFields = 0;
    // Handle hset key field value [field value ...]
    for (let i = 0; i < args.length; i += 2) {
      const field = String(args[i]);
      const value = String(args[i + 1]);
      if (!(field in hash)) newFields++;
      hash[field] = value;
    }
    return newFields;
  });

  hget = jest.fn().mockImplementation(async (key: string, field: string): Promise<string | null> => {
    const hash = this.hashData.get(key);
    if (!hash) return null;
    return hash[field] ?? null;
  });

  hgetall = jest.fn().mockImplementation(async (key: string): Promise<Record<string, string>> => {
    const hash = this.hashData.get(key);
    return hash ? { ...hash } : {};
  });

  hdel = jest.fn().mockImplementation(async (key: string, ...fields: string[]): Promise<number> => {
    const hash = this.hashData.get(key);
    if (!hash) return 0;
    let deleted = 0;
    for (const field of fields) {
      if (field in hash) {
        delete hash[field];
        deleted++;
      }
    }
    return deleted;
  });

  // Multi-key operations
  mget = jest.fn().mockImplementation(async (...keys: string[]): Promise<(string | null)[]> => {
    return keys.map(key => this._getValue(key));
  });

  mset = jest.fn().mockImplementation(async (...args: unknown[]): Promise<string> => {
    for (let i = 0; i < args.length; i += 2) {
      const key = String(args[i]);
      const value = String(args[i + 1]);
      this._setValue(key, value);
    }
    return 'OK';
  });

  // List operations
  lpush = jest.fn().mockImplementation(async (key: string, ...values: string[]): Promise<number> => {
    let list = this.listData.get(key);
    if (!list) {
      list = [];
      this.listData.set(key, list);
    }
    list.unshift(...values.reverse());
    return list.length;
  });

  rpush = jest.fn().mockImplementation(async (key: string, ...values: string[]): Promise<number> => {
    let list = this.listData.get(key);
    if (!list) {
      list = [];
      this.listData.set(key, list);
    }
    list.push(...values);
    return list.length;
  });

  lrange = jest.fn().mockImplementation(async (key: string, start: number, stop: number): Promise<string[]> => {
    const list = this.listData.get(key);
    if (!list) return [];
    const end = stop === -1 ? undefined : stop + 1;
    return list.slice(start, end);
  });

  // Key pattern matching
  keys = jest.fn().mockImplementation(async (pattern: string): Promise<string[]> => {
    // Convert Redis glob pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/\*/g, '.*')  // * matches any characters
      .replace(/\?/g, '.');  // ? matches single character
    const regex = new RegExp(`^${regexPattern}$`);

    const allKeys = [
      ...Array.from(this.data.keys()),
      ...Array.from(this.hashData.keys()),
      ...Array.from(this.listData.keys()),
    ];
    return [...new Set(allKeys)].filter(key => regex.test(key));
  });

  scan = jest.fn().mockImplementation(async (
    cursor: string | number,
    ...args: unknown[]
  ): Promise<[string, string[]]> => {
    // Parse MATCH and COUNT options
    let pattern = '*';
    let count = 10;

    for (let i = 0; i < args.length; i += 2) {
      const option = String(args[i]).toUpperCase();
      if (option === 'MATCH') {
        pattern = String(args[i + 1]);
      } else if (option === 'COUNT') {
        count = Number(args[i + 1]);
      }
    }

    const allKeys = await this.keys(pattern);
    const cursorNum = Number(cursor);
    const nextKeys = allKeys.slice(cursorNum, cursorNum + count);
    const nextCursor = cursorNum + count >= allKeys.length ? '0' : String(cursorNum + count);

    return [nextCursor, nextKeys];
  });

  flushdb = jest.fn().mockImplementation(async (): Promise<string> => {
    this.data.clear();
    this.hashData.clear();
    this.listData.clear();
    return 'OK';
  });

  flushall = jest.fn().mockImplementation(async (): Promise<string> => {
    return this.flushdb();
  });

  disconnect = jest.fn().mockImplementation(async (): Promise<void> => {
    this.data.clear();
    this.hashData.clear();
    this.listData.clear();
  });

  quit = jest.fn().mockImplementation(async (): Promise<string> => {
    this.data.clear();
    this.hashData.clear();
    this.listData.clear();
    return 'OK';
  });

  connect = jest.fn().mockResolvedValue(undefined);

  on = jest.fn().mockImplementation((event: string, callback: (...args: unknown[]) => void) => {
    super.on(event, callback);
    return this;
  });

  // Pipeline support (simplified)
  pipeline = jest.fn().mockImplementation(() => {
    const commands: Array<{ method: string; args: unknown[] }> = [];
    const self = this;

    const pipelineInstance = {
      get: (key: string) => { commands.push({ method: 'get', args: [key] }); return pipelineInstance; },
      set: (...args: unknown[]) => { commands.push({ method: 'set', args }); return pipelineInstance; },
      setex: (...args: unknown[]) => { commands.push({ method: 'setex', args }); return pipelineInstance; },
      del: (...args: unknown[]) => { commands.push({ method: 'del', args }); return pipelineInstance; },
      incr: (key: string) => { commands.push({ method: 'incr', args: [key] }); return pipelineInstance; },
      expire: (...args: unknown[]) => { commands.push({ method: 'expire', args }); return pipelineInstance; },
      exec: async () => {
        const results: Array<[Error | null, unknown]> = [];
        for (const cmd of commands) {
          try {
            const method = (self as Record<string, unknown>)[cmd.method] as (...args: unknown[]) => Promise<unknown>;
            const result = await method.apply(self, cmd.args);
            results.push([null, result]);
          } catch (err) {
            results.push([err as Error, null]);
          }
        }
        return results;
      },
    };

    return pipelineInstance;
  });

  // Helper method for tests to directly set values
  _set = (key: string, value: string, expiry?: number): void => {
    this._setValue(key, value, expiry);
  };

  // Helper method for tests to get all data
  _getAll = (): Map<string, DataItem> => {
    return new Map(this.data);
  };

  // Helper to clear all mock call history
  _clearMocks = (): void => {
    this.get.mockClear();
    this.set.mockClear();
    this.setex.mockClear();
    this.del.mockClear();
    this.expire.mockClear();
    this.ttl.mockClear();
    this.exists.mockClear();
    this.incr.mockClear();
    this.incrby.mockClear();
    this.hset.mockClear();
    this.hget.mockClear();
    this.mget.mockClear();
    this.mset.mockClear();
    this.keys.mockClear();
    this.scan.mockClear();
  };
}

export default MockRedis;
