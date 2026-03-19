import React from "react";
import { motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";

interface Props {
  command: string;
  reason: string;
  onApprove: () => void;
  onDeny: () => void;
}

export function ConfirmDialog({ command, reason, onApprove, onDeny }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto mb-3"
    >
      <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-amber-300">
            Agent needs approval
          </span>
        </div>

        <p className="text-xs text-zinc-400 mb-3">{reason}</p>

        <code className="block px-3 py-2 bg-zinc-950 rounded-lg text-[13px] font-mono text-zinc-100 mb-4 overflow-x-auto">
          {command}
        </code>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onDeny}
            className="px-4 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Deny
          </button>
          <button
            onClick={onApprove}
            className="px-4 py-1.5 bg-green-600 rounded-lg text-xs font-semibold text-white hover:bg-green-500 transition-colors"
          >
            Approve
          </button>
        </div>
      </div>
    </motion.div>
  );
}
