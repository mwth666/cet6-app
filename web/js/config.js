// 全局配置：需要调整学习节奏时只改这里
window.CFG = {
  // 每天新词量（冲刺期建议 120-180；先筛词后再定）
  dailyNew: 150,
  // 冲刺模式下按「剩余词数 / 剩余天数」自动上调，但不超过这个上限
  sprintMaxNew: 600,
  // 考试日期（YYYY-MM-DD），用于倒计时与配额建议
  examDate: '2026-12-19',
  // 冲刺模式：间隔上限压缩到 10 天，保证考前多轮
  sprint: true,
  sprintMaxInterval: 10,
  normalMaxInterval: 30,
  // 掌握判定：间隔达到多少天算掌握
  masterInterval: 21,

  audio: {
    // 'web' 用浏览器内置语音合成（离线、免费、零配置）
    // 'off' 关闭语音，听力模块自动切换为遮蔽模式
    provider: 'web',
    rate: 0.92,   // 语速 0.1–2
    pitch: 1.0,
  },

  ui: {
    // 一屏筛词的词数
    screenSize: 30,
    // 一次学习会话的题数
    sessionSize: 20,
    // 每学几题存一次盘
    flushEvery: 5,
  },
};
