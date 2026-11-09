// 机会 / 命运 卡牌
// t: move | nearestRail | back | jail | jailcard | money | repair | payEach | collectEach

export const CHANCE = [
  { t: 'move', to: 0,  text: '前进到起点，领取 ¥200' },
  { t: 'move', to: 39, text: '前进到北京' },
  { t: 'move', to: 24, text: '前进到济南' },
  { t: 'move', to: 11, text: '前进到广州' },
  { t: 'move', to: 37, text: '前进到杭州' },
  { t: 'nearestRail', text: '前进到最近的车站' },
  { t: 'money', amount: 50,  text: '银行支付股息，收入 ¥50' },
  { t: 'jailcard', text: '获得一张“出狱卡”' },
  { t: 'back', n: 3, text: '后退三格' },
  { t: 'jail', text: '直接入狱，不得经过起点' },
  { t: 'repair', house: 25, hotel: 100, text: '房屋大修：每栋房子 ¥25，每座旅馆 ¥100' },
  { t: 'money', amount: -15, text: '缴纳交通罚款 ¥15' },
  { t: 'payEach', amount: 50, text: '当选董事长，向每位玩家支付 ¥50' },
  { t: 'money', amount: 150, text: '建筑贷款到期，收入 ¥150' },
  { t: 'move', to: 19, text: '前进到南昌' },
];

export const CHEST = [
  { t: 'move', to: 0, text: '前进到起点，领取 ¥200' },
  { t: 'money', amount: 200, text: '银行结算错误，收入 ¥200' },
  { t: 'money', amount: -50, text: '支付医药费 ¥50' },
  { t: 'money', amount: 50,  text: '出售股票，收入 ¥50' },
  { t: 'jailcard', text: '获得一张“出狱卡”' },
  { t: 'jail', text: '直接入狱，不得经过起点' },
  { t: 'money', amount: 100, text: '假日基金到期，收入 ¥100' },
  { t: 'money', amount: 20,  text: '退税，收入 ¥20' },
  { t: 'collectEach', amount: 10, text: '今天是你的生日，每位玩家送你 ¥10' },
  { t: 'money', amount: 100, text: '人寿保险到期，收入 ¥100' },
  { t: 'money', amount: -100, text: '支付住院费 ¥100' },
  { t: 'money', amount: -50, text: '支付学费 ¥50' },
  { t: 'money', amount: -25, text: '支付咨询费 ¥25' },
  { t: 'repair', house: 40, hotel: 115, text: '街道整修：每栋房子 ¥40，每座旅馆 ¥115' },
  { t: 'money', amount: 10, text: '选美比赛二等奖，收入 ¥10' },
];

export const DECK_NAME = { chance: '机会', chest: '命运' };
