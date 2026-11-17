/* 由小程序版移植，逻辑未改动 */
(function () {
// 改良 SM-2 调度器：纯函数，方便单测
const DAY = 86400000;
const STEPS = [10 / 1440, 1]; // 学习步长（天）：10 分钟 → 1 天

function newRecord() {
  return { s: 0, iv: 0, due: 0, ef: 2.5, lapses: 0, reps: 0, g: -1, last: 0, step: 0 };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * @param {object} rec 旧记录（可为空）
 * @param {number} grade 0=忘了 1=困难 2=记得 3=秒答
 * @param {number} now 时间戳
 * @param {object} cfg { sprint, sprintMaxInterval, normalMaxInterval, masterInterval }
 */
function schedule(rec, grade, now, cfg) {
  const r = Object.assign(newRecord(), rec || {});
  const maxIv = cfg && cfg.sprint
    ? (cfg.sprintMaxInterval || 10)
    : (cfg.normalMaxInterval || 30);

  r.reps = (r.reps || 0) + 1;
  r.g = grade;
  r.last = now;

  if (r.s < 2) {
    // 学习阶段：STEPS 是"下一步"的间隔，走完最后一步就毕业进复习
    if (grade === 0) {
      r.s = 1;
      r.step = 0;
      r.iv = STEPS[0];
    } else if (grade === 1) {
      r.s = 1;
      r.iv = STEPS[Math.min(r.step || 0, STEPS.length - 1)];
    } else if (grade === 2) {
      const step = r.step || 0;
      if (step < STEPS.length - 1) {
        r.s = 1;
        r.step = step + 1;
        r.iv = STEPS[step];
      } else {
        r.s = 2;
        r.step = STEPS.length;
        r.iv = 1;
      }
    } else {
      r.s = 2;
      r.step = STEPS.length;
      r.iv = 2;
    }
  } else {
    // 复习阶段
    if (grade === 0) {
      r.lapses = (r.lapses || 0) + 1;
      r.s = 1;
      r.step = 0;
      r.iv = STEPS[0];
      r.ef = clamp(r.ef - 0.2, 1.3, 2.8);
      r.due = now + Math.round(r.iv * DAY);
      r.mastered = 0;
      return r;
    }
    if (grade === 1) {
      r.iv = Math.max(1, r.iv * 1.2);
      r.ef = clamp(r.ef - 0.15, 1.3, 2.8);
    } else if (grade === 2) {
      r.iv = r.iv * r.ef;
    } else {
      r.iv = r.iv * r.ef * 1.3;
      r.ef = clamp(r.ef + 0.1, 1.3, 2.8);
    }
    // 抖动，避免同一天的词全部堆在一天
    r.iv = r.iv * (0.95 + Math.random() * 0.1);
    r.iv = clamp(r.iv, 1, maxIv);
  }

  r.iv = Math.max(r.iv, 5 / 1440);
  r.due = now + Math.round(r.iv * DAY);
  r.mastered = r.s === 2 && r.iv >= ((cfg && cfg.masterInterval) || 21) ? 1 : 0;
  return r;
}

function isDue(rec, now) {
  if (!rec || rec.s === 0) return false;
  return rec.due <= now;
}

function labelOf(grade) {
  return ['忘了', '困难', '记得', '秒答'][grade] || '';
}

window.SRS = { DAY, STEPS, newRecord, schedule, isDue, labelOf, clamp };

})();
