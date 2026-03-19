import React from "react";
import { motion } from "framer-motion";
import { Server, ArrowRight } from "lucide-react";

interface Props {
  onSelectExample: (text: string) => void;
}

const examples = [
  { text: "Check disk usage and clean up if needed", icon: "💾" },
  { text: "Install nginx and set up a reverse proxy", icon: "🌐" },
  { text: "Find all log files larger than 100MB", icon: "📋" },
  { text: "Deploy the app from a git repo", icon: "🚀" },
];

export function EmptyState({ onSelectExample }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8 pb-16">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center"
      >
        <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5">
          <Server className="w-7 h-7 text-green-500" />
        </div>

        <h2 className="text-lg font-semibold text-zinc-100 mb-2">
          Your cloud computer is ready
        </h2>
        <p className="text-sm text-zinc-500 text-center max-w-sm mb-8">
          Tell it what to do. It will execute commands, manage files, and
          complete tasks on your server.
        </p>

        <div className="grid grid-cols-2 gap-2.5 w-full max-w-md">
          {examples.map((example) => (
            <button
              key={example.text}
              onClick={() => onSelectExample(example.text)}
              className="group flex items-start gap-2.5 p-3.5 bg-zinc-900/50 border border-zinc-800 rounded-xl text-left hover:bg-zinc-800/60 hover:border-zinc-700 transition-all"
            >
              <span className="text-base mt-0.5 shrink-0">{example.icon}</span>
              <span className="text-xs text-zinc-400 group-hover:text-zinc-300 transition-colors leading-relaxed">
                {example.text}
              </span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
