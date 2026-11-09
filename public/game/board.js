// 40 格中国城市版棋盘数据
// rent = [基础租金, 1房, 2房, 3房, 4房, 旅馆]

export const GROUPS = {
  brown:  { name: '华北', color: '#8d5b3a', houseCost: 50,  tiles: [1, 3] },
  lblue:  { name: '岭南', color: '#8ecae6', houseCost: 50,  tiles: [6, 8, 9] },
  pink:   { name: '珠三角', color: '#d95f8d', houseCost: 100, tiles: [11, 13, 14] },
  orange: { name: '华中', color: '#e8912d', houseCost: 100, tiles: [16, 18, 19] },
  red:    { name: '中原', color: '#d33d3d', houseCost: 150, tiles: [21, 23, 24] },
  yellow: { name: '东北', color: '#e8c53a', houseCost: 150, tiles: [26, 27, 29] },
  green:  { name: '西南', color: '#3a9e5a', houseCost: 200, tiles: [31, 32, 34] },
  dblue:  { name: '首都', color: '#2f4fa8', houseCost: 200, tiles: [37, 39] },
};

export const RAIL_TILES = [5, 15, 25, 35];
export const UTIL_TILES = [12, 28];

const P = (i, name, short, group, price, rent) => ({
  i, name, short, group, price, rent, type: 'prop',
});

export const BOARD = [
  { i: 0,  type: 'go',       name: '起点',       short: '起点' },
  P(1,  '台北',   '台北', 'brown', 60,  [2, 10, 30, 90, 160, 250]),
  { i: 2,  type: 'chest',    name: '命运',       short: '命运' },
  P(3,  '高雄',   '高雄', 'brown', 60,  [4, 20, 60, 180, 320, 450]),
  { i: 4,  type: 'tax',      name: '所得税',     short: '所得税', amount: 200 },
  { i: 5,  type: 'rail',     name: '台北车站',   short: '台北站', price: 200 },
  P(6,  '香港',   '香港', 'lblue', 100, [6, 30, 90, 270, 400, 550]),
  { i: 7,  type: 'chance',   name: '机会',       short: '机会' },
  P(8,  '澳门',   '澳门', 'lblue', 100, [6, 30, 90, 270, 400, 550]),
  P(9,  '深圳',   '深圳', 'lblue', 120, [8, 40, 100, 300, 450, 600]),
  { i: 10, type: 'jail',     name: '监狱 / 探监', short: '监狱' },
  P(11, '广州',   '广州', 'pink', 140, [10, 50, 150, 450, 625, 750]),
  { i: 12, type: 'util',     name: '电力公司',   short: '电力', price: 150 },
  P(13, '珠海',   '珠海', 'pink', 140, [10, 50, 150, 450, 625, 750]),
  P(14, '东莞',   '东莞', 'pink', 160, [12, 60, 180, 500, 700, 900]),
  { i: 15, type: 'rail',     name: '广州东站',   short: '广州东', price: 200 },
  P(16, '长沙',   '长沙', 'orange', 180, [14, 70, 200, 550, 750, 950]),
  { i: 17, type: 'chest',    name: '命运',       short: '命运' },
  P(18, '武汉',   '武汉', 'orange', 180, [14, 70, 200, 550, 750, 950]),
  P(19, '南昌',   '南昌', 'orange', 200, [16, 80, 220, 600, 800, 1000]),
  { i: 20, type: 'parking',  name: '免费停车',   short: '停车' },
  P(21, '郑州',   '郑州', 'red', 220, [18, 90, 250, 700, 875, 1050]),
  { i: 22, type: 'chance',   name: '机会',       short: '机会' },
  P(23, '西安',   '西安', 'red', 220, [18, 90, 250, 700, 875, 1050]),
  P(24, '济南',   '济南', 'red', 240, [20, 100, 300, 750, 925, 1100]),
  { i: 25, type: 'rail',     name: '北京南站',   short: '北京南', price: 200 },
  P(26, '天津',   '天津', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
  P(27, '沈阳',   '沈阳', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
  { i: 28, type: 'util',     name: '自来水厂',   short: '自来水', price: 150 },
  P(29, '大连',   '大连', 'yellow', 280, [24, 120, 360, 850, 1025, 1200]),
  { i: 30, type: 'gotojail', name: '入狱',       short: '入狱' },
  P(31, '成都',   '成都', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
  P(32, '重庆',   '重庆', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
  { i: 33, type: 'chest',    name: '命运',       short: '命运' },
  P(34, '昆明',   '昆明', 'green', 320, [28, 150, 450, 1000, 1200, 1400]),
  { i: 35, type: 'rail',     name: '上海虹桥站', short: '上海虹桥', price: 200 },
  { i: 36, type: 'chance',   name: '机会',       short: '机会' },
  P(37, '杭州',   '杭州', 'dblue', 350, [35, 175, 500, 1100, 1300, 1500]),
  { i: 38, type: 'tax',      name: '奢侈税',     short: '奢侈税', amount: 100 },
  P(39, '北京',   '北京', 'dblue', 400, [50, 200, 600, 1400, 1700, 2000]),
];

export const TILE_COUNT = BOARD.length;

// 棋盘格子 -> CSS grid 坐标（11x11，左上角为 1/1）
export function gridPos(i) {
  if (i === 0) return { r: 11, c: 11 };
  if (i === 10) return { r: 11, c: 1 };
  if (i === 20) return { r: 1, c: 1 };
  if (i === 30) return { r: 1, c: 11 };
  if (i < 10) return { r: 11, c: 11 - i };
  if (i < 20) return { r: 11 - (i - 10), c: 1 };
  if (i < 30) return { r: 1, c: 1 + (i - 20) };
  return { r: 1 + (i - 30), c: 11 };
}

export function sideOf(i) {
  if (i === 0 || i === 10 || i === 20 || i === 30) return 'corner';
  if (i < 10) return 'bottom';
  if (i < 20) return 'left';
  if (i < 30) return 'top';
  return 'right';
}

export const COLOR_COUNT = 8;
