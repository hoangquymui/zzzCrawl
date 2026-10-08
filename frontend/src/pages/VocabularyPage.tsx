import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  FileCode,
  CheckCircle,
  AlertCircle,
  X,
  Copy,
  Check,
  Tag,
  FolderPlus,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Eye,
  Play,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  ViolationRule,
  VocabularyStats,
  TestResult,
  RescanResult,
  vocabularyApi,
} from '../services/vocabulary.service';

export const VocabularyPage: React.FC = () => {
  const { isAdmin } = useAuth();

  const [rules, setRules] = useState<ViolationRule[]>([]);
  const [stats, setStats] = useState<VocabularyStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Inline Word Add States per category (category id/name -> string)
  const [newWordsInput, setNewWordsInput] = useState<Record<string, string>>({});

  // Rescan state
  const [isRescanning, setIsRescanning] = useState(false);
  const [rescanResult, setRescanResult] = useState<RescanResult | null>(null);

  // Modals
  const [isAddCatModalOpen, setIsAddCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatSeverity, setNewCatSeverity] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('HIGH');

  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
  const [rawJsonText, setRawJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isCopiedJson, setIsCopiedJson] = useState(false);
  const [isSavingJson, setIsSavingJson] = useState(false);

  // Quick Test State
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isTestBoxOpen, setIsTestBoxOpen] = useState(false);

  // Expanded advanced patterns per category
  const [expandedPatterns, setExpandedPatterns] = useState<Record<string, boolean>>({});

  const showToast = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await vocabularyApi.getVocabulary();
      setRules(data.rules || []);
      setStats(data.stats || null);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Không thể tải danh sách từ vựng.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered Rules by Category and Search Query
  const filteredRules = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return rules.filter((r) => {
      const matchCat = selectedCategory === 'all' || r.id === selectedCategory || r.category === selectedCategory;
      if (!matchCat) return false;
      if (!query) return true;

      const inCatName = r.category.toLowerCase().includes(query);
      const inWords = r.words.some((w) => w.toLowerCase().includes(query));
      return inCatName || inWords;
    });
  }, [rules, selectedCategory, searchQuery]);

  // Quick Add Word to a Category
  const handleAddWord = async (categoryKey: string) => {
    const word = (newWordsInput[categoryKey] || '').trim();
    if (!word) return;

    try {
      await vocabularyApi.addWord(categoryKey, word);
      showToast(`Đã thêm từ "${word}" thành công!`);
      setNewWordsInput((prev) => ({ ...prev, [categoryKey]: '' }));
      loadData();
    } catch (err: unknown) {
      alert((err as Error)?.message || 'Lỗi thêm từ ngữ.');
    }
  };

  // Remove Word
  const handleRemoveWord = async (categoryKey: string, word: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa từ "${word}" khỏi danh mục?`)) return;
    try {
      await vocabularyApi.removeWord(categoryKey, word);
      showToast(`Đã xóa từ "${word}".`);
      loadData();
    } catch (err: unknown) {
      alert((err as Error)?.message || 'Lỗi xóa từ.');
    }
  };

  // Toggle Category
  const handleToggleCategory = async (categoryKey: string) => {
    try {
      const res = await vocabularyApi.toggleCategory(categoryKey);
      setRules((prev) =>
        prev.map((r) => (r.id === categoryKey || r.category === categoryKey ? { ...r, enabled: res.enabled } : r))
      );
      showToast(res.enabled ? 'Đã bật nhóm quy tắc.' : 'Đã tắt nhóm quy tắc.');
    } catch (err: unknown) {
      alert((err as Error)?.message || 'Lỗi bật/tắt nhóm quy tắc.');
    }
  };

  // Delete Category
  const handleDeleteCategory = async (categoryKey: string, catName: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa toàn bộ nhóm quy tắc "${catName}"?`)) return;
    try {
      await vocabularyApi.deleteCategory(categoryKey);
      showToast(`Đã xóa nhóm quy tắc "${catName}".`);
      loadData();
    } catch (err: unknown) {
      alert((err as Error)?.message || 'Lỗi xóa nhóm.');
    }
  };

  // Add Category Modal Submit
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    try {
      await vocabularyApi.addCategory({
        name: newCatName.trim(),
        description: newCatDesc.trim(),
        severity: newCatSeverity,
      });
      showToast(`Đã tạo nhóm "${newCatName.trim()}" thành công!`);
      setIsAddCatModalOpen(false);
      setNewCatName('');
      setNewCatDesc('');
      loadData();
    } catch (err: unknown) {
      alert((err as Error)?.message || 'Lỗi tạo nhóm.');
    }
  };

  // Open Raw JSON Modal
  const handleOpenJsonModal = async () => {
    setJsonError(null);
    setIsCopiedJson(false);
    try {
      const json = await vocabularyApi.getRawJson();
      setRawJsonText(json);
      setIsJsonModalOpen(true);
    } catch (err: unknown) {
      alert((err as Error)?.message || 'Không thể lấy dữ liệu JSON.');
    }
  };

  // Save Raw JSON
  const handleSaveRawJson = async () => {
    setJsonError(null);
    setIsSavingJson(true);
    try {
      await vocabularyApi.updateRawJson(rawJsonText);
      showToast('Đã cập nhật file JSON quy tắc vi phạm thành công!');
      setIsJsonModalOpen(false);
      loadData();
    } catch (err: unknown) {
      setJsonError((err as Error)?.message || 'Lỗi cập nhật JSON.');
    } finally {
      setIsSavingJson(false);
    }
  };

  // Copy JSON
  const handleCopyJson = () => {
    navigator.clipboard.writeText(rawJsonText);
    setIsCopiedJson(true);
    setTimeout(() => setIsCopiedJson(false), 2000);
  };

  // Run Test Check
  const handleRunTest = async () => {
    if (!testText.trim()) return;
    setIsTesting(true);
    try {
      const res = await vocabularyApi.testCaption(testText);
      setTestResult(res);
    } catch (err: unknown) {
      alert((err as Error)?.message || 'Lỗi kiểm tra mẫu.');
    } finally {
      setIsTesting(false);
    }
  };

  // Rescan All Posts
  const handleRescanAll = async () => {
    if (!window.confirm('Hệ thống sẽ duyệt và đối soát lại toàn bộ bài viết trong cơ sở dữ liệu với bộ từ vựng vi phạm mới nhất. Bạn có muốn tiếp tục?')) {
      return;
    }
    setIsRescanning(true);
    setRescanResult(null);
    try {
      const res = await vocabularyApi.rescan();
      setRescanResult(res);
      showToast(
        `Đã quét xong ${res.totalScanned} bài viết: Phát hiện ${res.violationCount} bài vi phạm (+${res.newlyFlagged} mới, -${res.newlyCleared} bỏ gắn cờ).`
      );
      loadData();
    } catch (err: unknown) {
      alert((err as Error)?.message || 'Lỗi quét lại bài viết.');
    } finally {
      setIsRescanning(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg mx-auto mt-12 space-y-4">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Quyền truy cập bị từ chối</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Trang Quản lý từ vựng vi phạm tiêu chuẩn chỉ dành riêng cho tài khoản Quản trị viên (Admin).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Quản trị</span>
            <span>/</span>
            <span className="text-blue-600 dark:text-blue-400 font-medium">Từ ngữ</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-rose-500" />
            <span>Từ ngữ vi phạm tiêu chuẩn</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Quản lý danh sách từ khóa, tiếng lóng, cụm từ thô tục, bạo lực và cờ bạc dùng để tự động nhận diện vi phạm trên file JSON.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Rescan Button */}
          <button
            type="button"
            onClick={handleRescanAll}
            disabled={isRescanning}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-xs disabled:opacity-50 cursor-pointer"
            title="Quét lại toàn bộ bài viết trong database theo bộ từ vựng mới nhất"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin' : ''}`} />
            <span>{isRescanning ? 'Đang quét...' : 'Quét lại bài viết'}</span>
          </button>

          {/* Edit Raw JSON Button */}
          <button
            type="button"
            onClick={handleOpenJsonModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer"
            title="Xem và chỉnh sửa trực tiếp nội dung file JSON"
          >
            <FileCode className="w-3.5 h-3.5 text-blue-500" />
            <span>Sửa JSON</span>
          </button>

          {/* Add Category Button */}
          <button
            type="button"
            onClick={() => setIsAddCatModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition shadow-xs cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Thêm nhóm mới</span>
          </button>
        </div>
      </div>

      {/* Success Notification Alert */}
      {successMessage && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {/* Rescan Result Alert */}
      {rescanResult && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              Kết quả quét lại: Đã quét <strong>{rescanResult.totalScanned}</strong> bài viết | Phát hiện <strong>{rescanResult.violationCount}</strong> bài vi phạm (<strong>+{rescanResult.newlyFlagged}</strong> mới, <strong>-{rescanResult.newlyCleared}</strong> xóa vi phạm).
            </span>
          </div>
          <button
            type="button"
            onClick={() => setRescanResult(null)}
            className="p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900 rounded text-emerald-700 dark:text-emerald-300 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error Notification Alert */}
      {error && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* 2. Overview Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900 dark:text-white">
              {stats?.totalCategories ?? rules.length}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Nhóm quy tắc</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900 dark:text-white">
              {stats?.totalWords ?? rules.reduce((acc, r) => acc + (r.words?.length || 0), 0)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Từ ngữ vi phạm</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900 dark:text-white">
              {stats?.activeCategories ?? rules.filter((r) => r.enabled).length}/{rules.length}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Nhóm đang bật</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900 dark:text-white">
              {stats?.violationPostsCount ?? 0}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Bài viết bị gắn cờ</div>
          </div>
        </div>
      </div>

      {/* 3. Interactive Quick Test Box */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <button
          type="button"
          onClick={() => setIsTestBoxOpen(!isTestBoxOpen)}
          className="w-full flex items-center justify-between p-4 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition cursor-pointer text-left"
        >
          <div className="flex items-center gap-2.5">
            <Eye className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Công cụ thử nghiệm: Kiểm tra nhanh caption / câu từ vi phạm
            </span>
          </div>
          <div className="text-slate-400">
            {isTestBoxOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {isTestBoxOpen && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRunTest()}
                placeholder="Dán hoặc nhập câu văn bản cần kiểm tra (ví dụ: 'địt mẹ thằng chó lừa đảo...')"
                className="flex-1 px-3.5 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleRunTest}
                disabled={isTesting || !testText.trim()}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{isTesting ? 'Đang kiểm tra...' : 'Kiểm tra ngay'}</span>
              </button>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                  testResult.isViolation
                    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                    : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                }`}
              >
                {testResult.isViolation ? (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                ) : (
                  <CheckCircle className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
                )}
                <div>
                  <div className="font-bold">
                    {testResult.isViolation ? 'PHÁT HIỆN VI PHẠM TIÊU CHUẨN' : 'HỢP LỆ (Không vi phạm)'}
                  </div>
                  {testResult.isViolation && (
                    <div className="mt-1 space-y-1">
                      <div>
                        <strong>Lý do:</strong> {testResult.reason}
                      </div>
                      <div>
                        <strong>Từ ngữ trùng khớp:</strong>{' '}
                        {testResult.matchedWords.map((w, i) => (
                          <span
                            key={i}
                            className="inline-block px-1.5 py-0.5 mx-0.5 bg-rose-200 dark:bg-rose-900 font-bold rounded"
                          >
                            {w}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Search and Category Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm từ ngữ vi phạm..."
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer whitespace-nowrap ${
              selectedCategory === 'all'
                ? 'bg-blue-600 text-white font-semibold shadow-xs'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Tất cả ({rules.length})
          </button>
          {rules.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedCategory(r.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                selectedCategory === r.id
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {r.category} ({r.words?.length || 0})
            </button>
          ))}
        </div>
      </div>

      {/* 5. Rules Cards List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-400">Đang tải dữ liệu từ vựng vi phạm...</div>
        ) : filteredRules.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
            Không tìm thấy từ ngữ hoặc nhóm quy tắc nào phù hợp.
          </div>
        ) : (
          filteredRules.map((rule) => {
            const isPatternOpen = Boolean(expandedPatterns[rule.id]);

            return (
              <div
                key={rule.id}
                className={`bg-white dark:bg-slate-900 rounded-2xl border transition-all ${
                  rule.enabled
                    ? 'border-slate-200 dark:border-slate-800 shadow-xs'
                    : 'border-slate-200/60 dark:border-slate-800/40 opacity-70 bg-slate-50/50 dark:bg-slate-900/50'
                }`}
              >
                {/* Card Header */}
                <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">
                        {rule.category}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          rule.severity === 'HIGH'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {rule.severity || 'HIGH'}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {rule.words?.length || 0} từ ngữ
                      </span>
                      {!rule.enabled && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-slate-200 dark:bg-slate-800 text-slate-500">
                          Đã tắt
                        </span>
                      )}
                    </div>
                    {rule.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {rule.description}
                      </p>
                    )}
                  </div>

                  {/* Toggle & Delete Category buttons */}
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {/* Toggle Button */}
                    <button
                      type="button"
                      onClick={() => handleToggleCategory(rule.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                        rule.enabled
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {rule.enabled ? 'Đang hoạt động' : 'Tạm dừng'}
                    </button>

                    {/* Delete Category Button */}
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(rule.id, rule.category)}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                      title="Xóa nhóm quy tắc này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Card Content: Word Badges & Quick Add */}
                <div className="p-4 sm:p-5 space-y-4">
                  {/* Quick Add Inline Form */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newWordsInput[rule.id] || ''}
                      onChange={(e) =>
                        setNewWordsInput((prev) => ({ ...prev, [rule.id]: e.target.value }))
                      }
                      onKeyDown={(e) => e.key === 'Enter' && handleAddWord(rule.id)}
                      placeholder={`Thêm từ/cụm từ mới vào nhóm "${rule.category}" (nhấn Enter)...`}
                      className="flex-1 px-3.5 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddWord(rule.id)}
                      disabled={!newWordsInput[rule.id]?.trim()}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm từ</span>
                    </button>
                  </div>

                  {/* Word Badges Pills */}
                  {rule.words && rule.words.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {rule.words.map((word, wIdx) => (
                        <span
                          key={wIdx}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800/90 text-slate-800 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600 transition group"
                        >
                          <span>{word}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveWord(rule.id, word)}
                            className="text-slate-400 hover:text-rose-500 transition p-0.5 cursor-pointer rounded"
                            title={`Xóa từ "${word}"`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 italic">Chưa có từ ngữ nào trong nhóm này.</div>
                  )}

                  {/* Collapsible Advanced Regex Patterns */}
                  {rule.patterns && rule.patterns.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedPatterns((prev) => ({
                            ...prev,
                            [rule.id]: !prev[rule.id],
                          }))
                        }
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
                      >
                        <FileCode className="w-3 h-3" />
                        <span>Mẫu biểu thức chính quy (Regex: {rule.patterns.length})</span>
                        {isPatternOpen ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {isPatternOpen && (
                        <div className="mt-2.5 p-3 rounded-xl bg-slate-900 text-slate-200 text-[11px] font-mono space-y-1 overflow-x-auto max-h-48 overflow-y-auto">
                          {rule.patterns.map((pat, pIdx) => (
                            <div key={pIdx} className="text-slate-300 py-0.5">
                              {pIdx + 1}. <span className="text-emerald-400">/{pat}/i</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 6. Modal: Add New Category */}
      {isAddCatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-blue-500" />
                <span>Thêm nhóm quy tắc vi phạm</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddCatModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCategory} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tên nhóm quy tắc <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Ví dụ: 'Lừa đảo / Đa cấp', 'Spam bán acc'..."
                  required
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mô tả phân loại
                </label>
                <input
                  type="text"
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  placeholder="Mô tả ngắn gọn mục đích của nhóm vi phạm..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mức độ nghiêm trọng
                </label>
                <select
                  value={newCatSeverity}
                  onChange={(e) => setNewCatSeverity(e.target.value as 'HIGH' | 'MEDIUM' | 'LOW')}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-hidden"
                >
                  <option value="HIGH">Nghiêm trọng (HIGH)</option>
                  <option value="MEDIUM">Trung bình (MEDIUM)</option>
                  <option value="LOW">Nhẹ / Cảnh báo (LOW)</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddCatModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!newCatName.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer disabled:opacity-50"
                >
                  Tạo nhóm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Modal: Raw JSON Editor */}
      {isJsonModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Chỉnh sửa trực tiếp file JSON quy tắc (violation_rules.json)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsJsonModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error in JSON */}
            {jsonError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{jsonError}</span>
              </div>
            )}

            {/* Modal Body: Editor */}
            <div className="p-4 flex-1 overflow-hidden flex flex-col">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                Bạn có thể copy, dán hoặc bổ sung nhanh các từ khóa và mảng patterns tại đây. Đảm bảo cấu trúc JSON hợp lệ trước khi lưu.
              </p>
              <textarea
                value={rawJsonText}
                onChange={(e) => setRawJsonText(e.target.value)}
                className="flex-1 w-full p-3 font-mono text-xs bg-slate-950 text-emerald-400 rounded-xl border border-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 resize-none min-h-[350px]"
                spellCheck={false}
              />
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={handleCopyJson}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                {isCopiedJson ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopiedJson ? 'Đã sao chép' : 'Sao chép JSON'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsJsonModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={handleSaveRawJson}
                  disabled={isSavingJson}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer disabled:opacity-50"
                >
                  {isSavingJson ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
