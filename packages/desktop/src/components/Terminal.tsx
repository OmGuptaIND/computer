import { Channel } from '@anton/protocol'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal as XTerm } from '@xterm/xterm'
import { useEffect, useRef } from 'react'
import { connection } from '../lib/connection.js'
import '@xterm/xterm/css/xterm.css'

const TERMINAL_ID = 't1'

export function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new XTerm({
      theme: {
        background: '#09090b',
        foreground: '#e4e4e7',
        cursor: '#22c55e',
        cursorAccent: '#09090b',
        selectionBackground: '#27272a',
        black: '#09090b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e4e7',
        brightBlack: '#52525b',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#fafafa',
      },
      fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', Menlo, monospace",
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    termRef.current = term
    fitRef.current = fitAddon

    const { cols, rows } = term
    connection.sendTerminalSpawn(TERMINAL_ID, cols, rows)

    term.onData((data) => {
      connection.sendTerminalData(TERMINAL_ID, btoa(data))
    })

    const unsub = connection.onMessage((channel, msg) => {
      if (channel === Channel.TERMINAL && msg.type === 'pty_data' && msg.id === TERMINAL_ID) {
        try {
          term.write(atob(msg.data))
        } catch {
          term.write(msg.data)
        }
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      connection.sendTerminalResize(TERMINAL_ID, term.cols, term.rows)
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      unsub()
      resizeObserver.disconnect()
      term.dispose()
    }
  }, [])

  return (
    <div className="h-full bg-transparent p-6">
      <div className="h-full overflow-hidden rounded-[28px] border border-white/8 bg-[#171615]">
        <div className="flex items-center justify-between border-b border-white/8 bg-[#1f1d1c] px-4 py-3">
          <span className="text-xs text-zinc-300 font-medium">Live Terminal</span>
          <span className="text-[11px] text-zinc-500 font-mono">Session {TERMINAL_ID}</span>
        </div>
        <div ref={containerRef} className="h-[calc(100%-37px)] w-full" />
      </div>
    </div>
  )
}
