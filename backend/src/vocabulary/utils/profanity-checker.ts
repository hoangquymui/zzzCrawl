import * as fs from 'fs';
import * as path from 'path';

export interface ViolationResult {
  isViolation: boolean;
  reason?: string;
  matchedWords: string[];
}

export interface ViolationRule {
  id: string;
  category: string;
  description?: string;
  enabled: boolean;
  severity?: 'HIGH' | 'MEDIUM' | 'LOW';
  words: string[];
  patterns?: string[];
}

interface CompiledRule {
  id: string;
  category: string;
  enabled: boolean;
  compiledWordPatterns: Array<{ word: string; regex: RegExp }>;
  compiledRegexPatterns: RegExp[];
}

const DEFAULT_RULES: ViolationRule[] = [
  {
    id: 'tho-tuc',
    category: 'Từ ngữ thô tục / chửi thề',
    description: 'Các từ ngữ thô tục, chửi thề, tiếng lóng bậy bạ',
    enabled: true,
    severity: 'HIGH',
    words: [
      'đụ', 'đù', 'đú', 'đụ má', 'đụ mẹ', 'đụ cha', 'đụ mày',
      'địt', 'địt mẹ', 'địt con mẹ', 'địt cụ', 'địt bố', 'địt nhau',
      'đéo', 'đếch', 'đết', 'đéo mẹ', 'đéo cần', 'đéo biết', 'đéo care',
      'lồn', 'lồnn', 'lìn', 'bướm lồn', 'rách lồn', 'hãm lồn', 'mặt lồn', 'con lồn', 'lồn què',
      'cặc', 'buồi', 'dái', 'căk', 'concak', 'cu cặc', 'đầu buồi', 'con buồi', 'bú cặc', 'bú buồi', 'liếm cặc', 'mút cặc', 'mút buồi', 'cắt dái',
      'đm', 'đcm', 'dcm', 'dm', 'vcl', 'vcll', 'vkl', 'vl', 'vcc', 'clmm', 'cmn', 'clgt', 'dkm', 'đkm', 'đmm', 'dmm', 'cc', 'vlon',
      'mẹ kiếp', 'đậu má', 'đậu mè', 'tiên sư cha', 'tiên sư', 'tổ cha'
    ],
    patterns: [
      '\\b(?:đụ|đù|đú|du)\\s*(?:má|mẹ|mạ|mợ|cha|bà|con|nát|dạo|nhau|bitch|mày)?\\b',
      '\\b(?:đ|d)[\\.\\-_\\*!@]+(?:ụ|u)(?:\\s*[\\.\\-_\\*!@]*\\s*(?:má|me|mẹ))?\\b',
      '\\b(?:địt|đit|dit)\\s*(?:mẹ|con\\s*mẹ|cụ|bố|nhau|bà|cha|mày|buồi)?\\b',
      '\\b(?:đ|d)[\\.\\-_\\*!@]+(?:ị|i)[\\.\\-_\\*!@]*t(?:\\s*(?:mẹ|me))?\\b',
      '\\b(?:đéo|đếch|đết|deo)\\s*(?:mẹ|cần|biết|thèm|care|thích|hiểu|nghe|làm|nói|phải)?\\b',
      '\\b(?:đ|d)[\\.\\-_\\*!@]+(?:é|e)[\\.\\-_\\*!@]*o\\b',
      '\\b(?:lồn|lồnn+|lìn|bướm\\s*lồn|rách\\s*lồn|nước\\s*lồn|nứng\\s*lồn|hãm\\s*lồn|mặt\\s*lồn|banh\\s*lồn|con\\s*lồn|lồn\\s*mẹ|lồn\\s*què)\\b',
      '\\b(?:ham\\s*lon|mat\\s*lon|lon\\s*me|con\\s*lon|lon\\s*que)\\b',
      '\\bl[\\.\\-_\\*!@]+(?:ồ|o)[\\.\\-_\\*!@]*n\\b',
      '\\b(?:cặc|buồi|dái|căk|concak|cu\\s*cặc|đầu\\s*buồi|con\\s*buồi|bú\\s*cặc|bú\\s*buồi|liếm\\s*cặc|mút\\s*cặc|mút\\s*buồi|cắt\\s*dái|mút\\s*dái)\\b',
      '\\b(?:con\\s*cac|bu\\s*cac|dau\\s*buoi|con\\s*buoi)\\b',
      '\\bc[\\.\\-_\\*!@]+(?:ặ|a)[\\.\\-_\\*!@]*c\\b',
      '\\bb[\\.\\-_\\*!@]+(?:u)[\\.\\-_\\*!@]*(?:ồ|o)[\\.\\-_\\*!@]*i\\b',
      '\\b(?:đm|đcm|dcm|dm|vcl|vcll|vkl|vl|vcc|clmm|cmn|clgt|dkm|đkm|đmm|dmm|cc|vlon)\\b',
      '\\b(?:đ|d)\\s*[\\.\\-_/]\\s*(?:m|cm|km)\\b',
      '\\bv\\s*[\\.\\-_/]\\s*(?:l|cl|cc)\\b'
    ]
  },
  {
    id: 'lang-ma',
    category: 'Từ ngữ xúc phạm / lăng mạ',
    description: 'Các từ ngữ xúc phạm danh dự, miệt thị nhân phẩm',
    enabled: true,
    severity: 'HIGH',
    words: [
      'chó đẻ', 'thằng chó', 'đồ chó', 'ngu như chó', 'óc chó', 'đồ súc vật', 'thằng súc sinh',
      'con đĩ', 'đĩ mẹ', 'đĩ điếm', 'làm đĩ', 'con phò', 'gái ngành', 'gái bao', 'cave', 'con di'
    ],
    patterns: [
      '\\b(?:chó\\s*đẻ|thằng\\s*chó|đồ\\s*chó|ngu\\s*như\\s*chó|óc\\s*chó|đồ\\s*súc\\s*vật|thằng\\s*súc\\s*sinh)\\b',
      '\\b(?:con\\s*đĩ|đĩ\\s*mẹ|đĩ\\s*điếm|làm\\s*đĩ|con\\s*phò|gái\\s*ngành|gái\\s*bao|cave|con\\s*di)\\b'
    ]
  },
  {
    id: 'bao-luc',
    category: 'Nội dung bạo lực / đe dọa',
    description: 'Đe dọa bạo lực, giết người, gây thương tích',
    enabled: true,
    severity: 'HIGH',
    words: [
      'chém chết', 'giết chết', 'giết mẹ', 'đánh chết', 'xử chết', 'đâm chết', 'chém nhau', 'thanh trừng'
    ],
    patterns: [
      '\\b(?:chém\\s*chết|giết\\s*chết|giết\\s*mẹ|đánh\\s*chết|xử\\s*chết|đâm\\s*chết|chém\\s*nhau|thanh\\s*trừng)\\b'
    ]
  },
  {
    id: 'co-bac',
    category: 'Quảng bá cờ bạc / cá độ',
    description: 'Cá cược, cờ bạc trực tuyến, lô đề, tài xỉu trái phép',
    enabled: true,
    severity: 'HIGH',
    words: [
      'tài xỉu', 'nổ hũ', 'nhà cái', 'cá độ bóng đá', 'kèo bóng', 'game bài đổi thưởng', 'xóc đĩa online', 'đánh bạc online'
    ],
    patterns: [
      '\\b(?:tài\\s*xỉu|nổ\\s*hũ|nhà\\s*cái|cá\\s*độ\\s*bóng\\s*đá|kèo\\s*bóng|game\\s*bài\\s*đổi\\s*thưởng|xóc\\s*đĩa\\s*online|đánh\\s*bạc\\s*online)\\b'
    ]
  },
  {
    id: 'chat-cam',
    category: 'Chất cấm / Khiêu dâm',
    description: 'Nội dung khiêu dâm 18+, mại dâm, mua bán và sử dụng ma túy, chất kích thích',
    enabled: true,
    severity: 'HIGH',
    words: [
      'bay lắc', 'cỏ mỹ', 'bóng cười', 'hút cần', 'ke kẹo', 'hàng trắng',
      'clip sex', 'phim sex', 'chat sex', 'gái gọi', 'massage kích dục', 'massage từ a đến z'
    ],
    patterns: [
      '\\b(?:bay\\s*lắc|cỏ\\s*mỹ|bóng\\s*cười|hút\\s*cần|ke\\s*kẹo|hàng\\s*trắng)\\b',
      '\\b(?:clip\\s*sex|phim\\s*sex|chat\\s*sex|gái\\s*gọi|massage\\s*kích\\s*dục|massage\\s*từ\\s*a\\s*đến\\s*z)\\b'
    ]
  }
];

function getRulesFilePath(): string {
  const baseDir = process.cwd().endsWith('backend')
    ? process.cwd()
    : fs.existsSync(path.join(process.cwd(), 'backend'))
    ? path.join(process.cwd(), 'backend')
    : process.cwd();

  const dataPath = path.join(baseDir, 'data', 'violation_rules.json');
  if (fs.existsSync(dataPath)) return dataPath;

  const legacyPath = path.join(baseDir, 'violation_rules.json');
  if (fs.existsSync(legacyPath)) return legacyPath;

  const rootPath = path.join(process.cwd(), 'violation_rules.json');
  if (fs.existsSync(rootPath)) return rootPath;

  const dataDir = path.join(baseDir, 'data');
  if (!fs.existsSync(dataDir)) {
    try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
  }
  return dataPath;
}

let inMemoryRules: ViolationRule[] = [];
let inMemoryCompiled: CompiledRule[] = [];

function createWordRegex(word: string): RegExp {
  const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?:^|[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF])${escaped}(?:[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]|$)`,
    'i'
  );
}

function compileRules(rules: ViolationRule[]): CompiledRule[] {
  return rules.map((r) => {
    const wordList = Array.isArray(r.words) ? r.words : [];
    const patternList = Array.isArray(r.patterns) ? r.patterns : [];

    const compiledWordPatterns = wordList
      .filter((w) => w && w.trim())
      .map((w) => ({
        word: w.trim(),
        regex: createWordRegex(w),
      }));

    const compiledRegexPatterns: RegExp[] = [];
    for (const p of patternList) {
      if (!p || !p.trim()) continue;
      try {
        compiledRegexPatterns.push(new RegExp(p.trim(), 'i'));
      } catch (err) {
        // Bỏ qua regex lỗi cú pháp
      }
    }

    return {
      id: r.id,
      category: r.category,
      enabled: r.enabled !== false,
      compiledWordPatterns,
      compiledRegexPatterns,
    };
  });
}

export function reloadRules(): ViolationRule[] {
  const filePath = getRulesFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8').trim();
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          inMemoryRules = parsed;
          inMemoryCompiled = compileRules(inMemoryRules);
          return inMemoryRules;
        }
      }
    }
  } catch {}

  // Khởi tạo từ danh sách mặc định
  inMemoryRules = JSON.parse(JSON.stringify(DEFAULT_RULES));
  try {
    fs.writeFileSync(filePath, JSON.stringify(inMemoryRules, null, 2), 'utf8');
  } catch {}
  inMemoryCompiled = compileRules(inMemoryRules);
  return inMemoryRules;
}

// Nạp rules ngay khi module được import
reloadRules();

export function getViolationRules(): ViolationRule[] {
  if (!inMemoryRules || inMemoryRules.length === 0) {
    reloadRules();
  }
  return inMemoryRules;
}

export function saveViolationRules(rules: ViolationRule[]): boolean {
  if (!Array.isArray(rules)) return false;
  inMemoryRules = rules;
  inMemoryCompiled = compileRules(inMemoryRules);
  const filePath = getRulesFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(inMemoryRules, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

export function getRawRulesJson(): string {
  return JSON.stringify(getViolationRules(), null, 2);
}

export function updateRawRulesJson(jsonStr: string): { success: boolean; error?: string } {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) {
      return { success: false, error: 'Dữ liệu JSON phải là một mảng (Array) các nhóm quy tắc.' };
    }
    const validated: ViolationRule[] = parsed.map((item, idx) => ({
      id: item.id || `rule_${idx + 1}`,
      category: String(item.category || `Nhóm ${idx + 1}`).trim(),
      description: item.description ? String(item.description).trim() : '',
      enabled: item.enabled !== false,
      severity: item.severity || 'HIGH',
      words: Array.isArray(item.words) ? item.words.map((w: any) => String(w).trim()).filter(Boolean) : [],
      patterns: Array.isArray(item.patterns) ? item.patterns.map((p: any) => String(p).trim()).filter(Boolean) : [],
    }));

    const saved = saveViolationRules(validated);
    if (!saved) {
      return { success: false, error: 'Không thể ghi file JSON.' };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: `Cú pháp JSON không hợp lệ: ${e?.message}` };
  }
}

export function addViolationWord(categoryKey: string, wordToAdd: string): { success: boolean; message: string } {
  const cleanWord = (wordToAdd || '').trim();
  if (!cleanWord) {
    return { success: false, message: 'Từ ngữ không được để trống.' };
  }

  const rules = getViolationRules();
  const rule = rules.find((r) => r.id === categoryKey || r.category.toLowerCase() === categoryKey.toLowerCase());
  if (!rule) {
    return { success: false, message: `Không tìm thấy nhóm quy tắc "${categoryKey}".` };
  }

  if (!Array.isArray(rule.words)) {
    rule.words = [];
  }

  const exists = rule.words.some((w) => w.toLowerCase() === cleanWord.toLowerCase());
  if (exists) {
    return { success: false, message: `Từ "${cleanWord}" đã tồn tại trong nhóm "${rule.category}".` };
  }

  rule.words.push(cleanWord);
  saveViolationRules(rules);
  return { success: true, message: `Đã thêm từ "${cleanWord}" vào nhóm "${rule.category}".` };
}

export function removeViolationWord(categoryKey: string, wordToRemove: string): { success: boolean; message: string } {
  const cleanWord = (wordToRemove || '').trim().toLowerCase();
  const rules = getViolationRules();
  const rule = rules.find((r) => r.id === categoryKey || r.category.toLowerCase() === categoryKey.toLowerCase());
  if (!rule) {
    return { success: false, message: `Không tìm thấy nhóm "${categoryKey}".` };
  }

  const prevLen = rule.words.length;
  rule.words = rule.words.filter((w) => w.trim().toLowerCase() !== cleanWord);
  if (rule.words.length === prevLen) {
    return { success: false, message: `Không tìm thấy từ "${wordToRemove}" trong nhóm.` };
  }

  saveViolationRules(rules);
  return { success: true, message: `Đã xóa từ "${wordToRemove}".` };
}

export function addViolationCategory(dto: { name: string; description?: string; severity?: 'HIGH' | 'MEDIUM' | 'LOW' }): { success: boolean; rule?: ViolationRule; message: string } {
  const cleanName = (dto.name || '').trim();
  if (!cleanName) {
    return { success: false, message: 'Tên nhóm quy tắc không được để trống.' };
  }

  const rules = getViolationRules();
  if (rules.some((r) => r.category.toLowerCase() === cleanName.toLowerCase())) {
    return { success: false, message: `Nhóm quy tắc "${cleanName}" đã tồn tại.` };
  }

  const id = `cat_${Date.now()}`;
  const newRule: ViolationRule = {
    id,
    category: cleanName,
    description: dto.description?.trim() || '',
    enabled: true,
    severity: dto.severity || 'HIGH',
    words: [],
    patterns: [],
  };

  rules.push(newRule);
  saveViolationRules(rules);
  return { success: true, rule: newRule, message: `Đã tạo nhóm "${cleanName}".` };
}

export function deleteViolationCategory(categoryKey: string): { success: boolean; message: string } {
  const rules = getViolationRules();
  const index = rules.findIndex((r) => r.id === categoryKey || r.category.toLowerCase() === categoryKey.toLowerCase());
  if (index === -1) {
    return { success: false, message: 'Không tìm thấy nhóm quy tắc cần xóa.' };
  }

  const removed = rules.splice(index, 1);
  saveViolationRules(rules);
  return { success: true, message: `Đã xóa nhóm "${removed[0].category}".` };
}

export function toggleViolationCategory(categoryKey: string): { success: boolean; enabled: boolean } {
  const rules = getViolationRules();
  const rule = rules.find((r) => r.id === categoryKey || r.category.toLowerCase() === categoryKey.toLowerCase());
  if (!rule) {
    return { success: false, enabled: false };
  }

  rule.enabled = !rule.enabled;
  saveViolationRules(rules);
  return { success: true, enabled: rule.enabled };
}

/**
 * Kiểm tra xem caption có chứa từ bậy bạ, chửi thề, nhạy cảm hay không
 */
export function checkCaptionViolation(caption?: string | null): ViolationResult {
  if (!caption || !caption.trim()) {
    return { isViolation: false, matchedWords: [] };
  }

  if (inMemoryCompiled.length === 0) {
    reloadRules();
  }

  const cleanCaption = caption.trim();
  const matchedWordsSet = new Set<string>();
  const categoryReasonsSet = new Set<string>();

  for (const rule of inMemoryCompiled) {
    if (!rule.enabled) continue;

    // 1. Kiểm tra danh sách từ đơn / cụm từ (words)
    for (const item of rule.compiledWordPatterns) {
      if (item.regex.test(cleanCaption)) {
        matchedWordsSet.add(item.word);
        categoryReasonsSet.add(rule.category);
      }
    }

    // 2. Kiểm tra các mẫu regex phức tạp (patterns)
    for (const pattern of rule.compiledRegexPatterns) {
      const match = cleanCaption.match(pattern);
      if (match) {
        matchedWordsSet.add(match[0].trim());
        categoryReasonsSet.add(rule.category);
      }
    }
  }

  if (matchedWordsSet.size > 0) {
    const matchedWords = Array.from(matchedWordsSet);
    const categories = Array.from(categoryReasonsSet).join(', ');
    const reason = `${categories}: "${matchedWords.join('", "')}"`;
    return {
      isViolation: true,
      reason,
      matchedWords,
    };
  }

  return {
    isViolation: false,
    matchedWords: [],
  };
}
