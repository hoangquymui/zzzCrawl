import { useState, useCallback, useRef } from 'react';

/**
 * Hook hỗ trợ kéo chuột thay đổi độ rộng cột (drag & resize table columns)
 * - Tự động ghi nhớ kích thước vào localStorage theo key
 * - Đảm bảo độ rộng tối thiểu để không bị bóp nghẹt
 * - Cung cấp handler mousedown mượt mà với event listeners gắn trên window
 */
export function useResizableColumns<T extends string>(
  initialWidths: Record<T, number>,
  storageKey?: string,
  minWidth: number = 50
) {
  const [widths, setWidths] = useState<Record<T, number>>(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(`table_col_widths_${storageKey}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          return { ...initialWidths, ...parsed };
        }
      } catch (err) {
        console.warn('Lỗi đọc độ rộng cột từ localStorage:', err);
      }
    }
    return initialWidths;
  });

  const activeResizeRef = useRef<{
    col: T;
    startX: number;
    startWidth: number;
  } | null>(null);

  const handleMouseDown = useCallback(
    (col: T, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      activeResizeRef.current = {
        col,
        startX: e.clientX,
        startWidth: widths[col] || initialWidths[col] || minWidth,
      };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!activeResizeRef.current) return;
        const { col: activeCol, startX, startWidth } = activeResizeRef.current;
        const delta = ev.clientX - startX;
        const newWidth = Math.max(minWidth, startWidth + delta);

        setWidths((prev) => ({
          ...prev,
          [activeCol]: newWidth,
        }));
      };

      const handleMouseUp = () => {
        if (activeResizeRef.current && storageKey) {
          setWidths((latest) => {
            try {
              localStorage.setItem(
                `table_col_widths_${storageKey}`,
                JSON.stringify(latest)
              );
            } catch (err) {
              console.warn('Lỗi lưu độ rộng cột:', err);
            }
            return latest;
          });
        }

        activeResizeRef.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [widths, initialWidths, storageKey, minWidth]
  );

  const resetWidths = useCallback(() => {
    setWidths(initialWidths);
    if (storageKey) {
      try {
        localStorage.removeItem(`table_col_widths_${storageKey}`);
      } catch {}
    }
  }, [initialWidths, storageKey]);

  return {
    widths,
    handleMouseDown,
    resetWidths,
  };
}
