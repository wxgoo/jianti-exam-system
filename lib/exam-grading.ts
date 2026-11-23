/**
 * 考试自动判分引擎
 * 支持单选/多选/填空/解答题的规则化判分，供练习/考试提交时使用。
 */

export type GradeResult = {
  isCorrect: boolean;
  score: number;
  maxScore: number;
  detail: string;
};

export type GradingQuestion = {
  id: string;
  type: "single" | "multiple" | "fill" | "answer";
  answer: string;
  score: number;
};

/** 标准化答案字符串：去首尾空白、折叠内部空白、小写化、中英文标点统一 */
function normalize(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace(/[，。！？；：""''（）《》【】]/g, (m) => {
      const map: Record<string, string> = {
        "，": ",", "。": ".", "！": "!", "？": "?", "；": ";", "：": ":",
        "“": "\"", "”": "\"", "‘": "'", "’": "'", "（": "(", "）": ")",
        "《": "<", "》": ">", "【": "[", "】": "]",
      };
      return map[m] ?? m;
    });
}

/** 解析多选题答案集合，如 "ABD" -> ["a","b","d"] */
function parseOptions(value: string): string[] {
  return normalize(value).split("").filter((ch) => /[a-z]/.test(ch));
}

/**
 * 对单道题目进行判分。
 * 返回 { isCorrect, score, maxScore, detail }。
 */
export function gradeAnswer(question: GradingQuestion, userAnswer: string): GradeResult {
  const maxScore = Math.max(0, Number(question.score) || 0);
  const raw = userAnswer ?? "";
  const norm = normalize(raw);

  switch (question.type) {
    case "single": {
      const correct = normalize(question.answer);
      const isCorrect = norm === correct && norm.length > 0;
      return {
        isCorrect,
        score: isCorrect ? maxScore : 0,
        maxScore,
        detail: isCorrect ? "答案正确" : `正确答案：${question.answer}`,
      };
    }

    case "multiple": {
      const correctSet = new Set(parseOptions(question.answer));
      const userSet = new Set(parseOptions(norm));
      if (correctSet.size === 0) {
        return { isCorrect: false, score: 0, maxScore, detail: "未录入标准答案" };
      }

      const selected = [...userSet].sort();
      const correct = [...correctSet].sort();

      // 完全匹配：满分
      if (selected.length === correct.length && selected.every((c) => correctSet.has(c))) {
        return { isCorrect: true, score: maxScore, maxScore, detail: "答案正确" };
      }

      // 部分得分：按选对比例得分，选错扣分，最低 0
      const correctCount = selected.filter((c) => correctSet.has(c)).length;
      const wrongCount = selected.length - correctCount;
      const missedCount = correct.length - correctCount;

      let score = 0;
      if (correct.length > 0) {
        score = Math.round((correctCount / correct.length) * maxScore);
        const penalty = Math.round((wrongCount / correct.length) * maxScore);
        score = Math.max(0, score - penalty);
      }

      return {
        isCorrect: score === maxScore,
        score,
        maxScore,
        detail: `正确答案：${question.answer}，你选了：${selected.join("") || "未作答"}`,
      };
    }

    case "fill": {
      const correct = normalize(question.answer);
      const isCorrect = norm === correct && norm.length > 0;
      const partial = correct.length > 0 && norm.includes(correct);
      return {
        isCorrect: isCorrect || partial,
        score: (isCorrect || partial) ? maxScore : 0,
        maxScore,
        detail: isCorrect ? "答案正确" : partial ? "关键词匹配" : `正确答案：${question.answer}`,
      };
    }

    case "answer": {
      // 解答题暂不支持自动判分，标记为待人工评分，不计入自动得分
      return {
        isCorrect: false,
        score: 0,
        maxScore,
        detail: "解答题需人工批改",
      };
    }

    default:
      return { isCorrect: false, score: 0, maxScore, detail: "未知题型" };
  }
}
