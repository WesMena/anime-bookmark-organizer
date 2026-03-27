import { vi, beforeEach } from 'vitest';

let _storageData = {};

const chromeMock = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  bookmarks: {
    getTree: vi.fn(),
    getChildren: vi.fn(),
    get: vi.fn(),
    onCreated: { addListener: vi.fn() },
    onRemoved: { addListener: vi.fn() },
    onChanged: { addListener: vi.fn() },
    onMoved: { addListener: vi.fn() },
  },
};

function attachStorageImpl() {
  chromeMock.storage.local.get.mockImplementation(async (keys) => {
    if (typeof keys === 'string') return { [keys]: _storageData[keys] };
    const result = {};
    const keyList = Array.isArray(keys) ? keys : Object.keys(keys);
    for (const key of keyList) result[key] = _storageData[key];
    return result;
  });
  chromeMock.storage.local.set.mockImplementation(async (items) => {
    Object.assign(_storageData, items);
  });
}

globalThis.chrome = chromeMock;
attachStorageImpl();

beforeEach(() => {
  _storageData = {};
  vi.clearAllMocks();
  attachStorageImpl();
});
