import React from 'react';

interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  className?: string;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({ onMouseDown, className = '' }) => {
  return (
    <div
      onMouseDown={onMouseDown}
      className={`absolute right-0 top-0 bottom-0 w-3 -mr-1.5 cursor-col-resize select-none flex items-center justify-center z-20 group ${className}`}
      title="Kéo để chỉnh độ rộng cột"
    >
      {/* Đường kẻ phân cách cột rõ ràng để nhận biết và kéo co giãn */}
      <div className="w-[1.5px] h-full bg-slate-300 dark:bg-slate-600 group-hover:w-[3px] group-hover:bg-blue-500 group-active:bg-blue-600 group-active:w-[3px] transition-all shadow-xs" />
    </div>
  );
};
