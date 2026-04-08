declare module 'node-pty' {
  export interface IPty {
    pid: number
    cols: number
    rows: number
    process: string
    onData: IEvent<string>
    onExit: IEvent<{ exitCode: number; signal?: number }>
    write(data: string): void
    resize(cols: number, rows: number): void
    kill(signal?: string): void
  }

  export type IEvent<T> = (listener: (e: T) => void) => IDisposable

  export interface IDisposable {
    dispose(): void
  }

  export function spawn(
    file: string,
    args: string[] | string,
    options: {
      name?: string
      cols?: number
      rows?: number
      cwd?: string
      env?: Record<string, string | undefined>
    },
  ): IPty
}
