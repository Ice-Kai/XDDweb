export type AiSafetyCategory = 'politics' | 'sexual' | 'violence';

export type AiSafetyResult = {
  allowed: boolean;
  category?: AiSafetyCategory;
  message?: string;
};

const RULES: Array<{ category: AiSafetyCategory; terms: RegExp[]; message: string }> = [
  {
    category: 'politics',
    message: '该提示词包含政治或敏感公共事件内容，当前 AI 创作不支持提交。',
    terms: [
      /(?:国家领导人|现任主席|政治宣传|政治运动|敏感事件|政治人物|政治选举|政治口号)/i,
      /(?:六四|天安门事件|法轮功|疆独|藏独|台独)/i,
    ],
  },
  {
    category: 'sexual',
    message: '该提示词包含色情、裸露或性交易内容，当前 AI 创作不支持提交。',
    terms: [
      /(?:色情|裸照|裸体|性行为|性爱|性交|成人视频|成人影片|色情网|约炮|性交易|援交|强奸)/i,
      /\b(?:porn|nude|nudity|sex\s*scene|explicit\s*sex|onlyfans)\b/i,
    ],
  },
  {
    category: 'violence',
    message: '该提示词包含血腥、伤害或暴力内容，当前 AI 创作不支持提交。',
    terms: [
      /(?:血腥|虐杀|肢解|斩首|爆炸袭击|恐怖袭击|自杀|屠杀|枪杀|杀人现场|暴力伤害)/i,
      /\b(?:gore|dismemberment|beheading|terrorist attack|massacre)\b/i,
    ],
  },
];

export function checkAiPromptSafety(value: unknown): AiSafetyResult {
  const prompt = typeof value === 'string' ? value.trim() : '';
  for (const rule of RULES) {
    if (rule.terms.some((term) => term.test(prompt))) {
      return { allowed: false, category: rule.category, message: rule.message };
    }
  }
  return { allowed: true };
}
