import React from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { ToastItem } from "../types/video";

interface ToastProps {
  toast: ToastItem | null;
  onDismiss: () => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  if (!toast) return null;

  let style =
    "bg-slate-900/95 border-slate-700 text-slate-100 shadow-slate-950/60";
  let icon = <Info className="w-4 h-4 text-blue-400 shrink-0" />;

  if (toast.type === "success") {
    style =
      "bg-emerald-950/95 border-emerald-700/80 text-emerald-100 shadow-emerald-950/40";
    icon = <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
  } else if (toast.type === "error") {
    style =
      "bg-rose-950/95 border-rose-700/80 text-rose-100 shadow-rose-950/40";
    icon = <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />;
  }

  return (
    <div className="fixed z-50 max-w-sm pointer-events-auto bottom-5 right-5">
      <div
        key={toast.id}
        className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-3 ${style}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {icon}
          <span className="text-xs font-medium leading-tight">
            {toast.message}
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 transition rounded-lg cursor-pointer hover:bg-white/10 text-slate-400 hover:text-slate-200 shrink-0"
          title="Đóng thông báo"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
