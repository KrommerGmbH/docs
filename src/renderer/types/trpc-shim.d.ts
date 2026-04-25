declare module '@trpc/client' {
  export function createTRPCProxyClient<T>(opts: unknown): any
}

declare module 'electron-trpc/renderer' {
  export function ipcLink(): any
}

declare module '../../../main/ipc/router' {
  export type AppRouter = any
}
