import { getFolders, getBookmarksInFolder, groupBySeriesName, FolderNotFoundError } from '../modules/bookmarks.js';

const mockTree = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: 'Bookmarks bar',
        children: [
          { id: '10', title: 'Anime Pendiente', children: [] },
          { id: '11', title: 'Work', children: [] },
        ],
      },
      {
        id: '2',
        title: 'Other bookmarks',
        children: [
          { id: '20', title: 'Misc', children: [] },
        ],
      },
      { id: '3', title: 'Mobile bookmarks', children: [] },
    ],
  },
];

describe('getFolders', () => {
  test('returns first-level subfolders from root node IDs 1, 2, 3', async () => {
    chrome.bookmarks.getTree.mockResolvedValue(mockTree);
    const folders = await getFolders();
    expect(folders).toEqual([
      { id: '10', title: 'Anime Pendiente' },
      { id: '11', title: 'Work' },
      { id: '20', title: 'Misc' },
    ]);
  });

  test('does not include the root nodes themselves (IDs 1, 2, 3)', async () => {
    chrome.bookmarks.getTree.mockResolvedValue(mockTree);
    const ids = (await getFolders()).map(f => f.id);
    expect(ids).not.toContain('1');
    expect(ids).not.toContain('2');
    expect(ids).not.toContain('3');
  });
});

describe('getBookmarksInFolder', () => {
  const mockChildren = [
    { id: 'b1', title: 'One Piece Episode 1100 - Crunchyroll', url: 'https://crunchyroll.com/1100' },
    { id: 'b2', title: 'Sakamoto Days Part 2 4 Sub Español — JkAnime', url: 'https://jkanime.net/sakamoto/4' },
    { id: 'sf', title: 'Subfolder', children: [] }, // no url → excluded
  ];

  test('returns BookmarkItems with id, title, url', async () => {
    chrome.bookmarks.getChildren.mockResolvedValue(mockChildren);
    const items = await getBookmarksInFolder('10');
    expect(items).toEqual([
      { id: 'b1', title: 'One Piece Episode 1100 - Crunchyroll', url: 'https://crunchyroll.com/1100' },
      { id: 'b2', title: 'Sakamoto Days Part 2 4 Sub Español — JkAnime', url: 'https://jkanime.net/sakamoto/4' },
    ]);
  });

  test('excludes subfolder nodes (no url property)', async () => {
    chrome.bookmarks.getChildren.mockResolvedValue(mockChildren);
    const items = await getBookmarksInFolder('10');
    expect(items.every(i => i.url)).toBe(true);
  });

  test('throws FolderNotFoundError when getChildren rejects', async () => {
    chrome.bookmarks.getChildren.mockRejectedValue(new Error('No node with id'));
    await expect(getBookmarksInFolder('deleted-id')).rejects.toBeInstanceOf(FolderNotFoundError);
  });
});

describe('groupBySeriesName', () => {
  test('groups bookmarks under their lowercased parsed series name', () => {
    const bookmarks = [
      { id: 'b1', title: 'One Piece Episode 1100 - Crunchyroll', url: 'https://crunchyroll.com/1' },
      { id: 'b2', title: 'One Piece Episode 1101 - Crunchyroll', url: 'https://crunchyroll.com/2' },
      { id: 'b3', title: 'Demon Slayer S03E04 | Crunchyroll', url: 'https://crunchyroll.com/3' },
    ];
    const grouped = groupBySeriesName(bookmarks);
    expect(Object.keys(grouped)).toContain('one piece');
    expect(Object.keys(grouped)).toContain('demon slayer');
    expect(grouped['one piece']).toHaveLength(2);
    expect(grouped['demon slayer']).toHaveLength(1);
  });
});
