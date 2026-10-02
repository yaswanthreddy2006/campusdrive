import { EventEmitter } from 'events'

// Global event bus surviving HMR across dev reloads
declare global {
  // eslint-disable-next-line no-var
  var __campusRealtimeEmitter: EventEmitter | undefined
}

export const realtimeBus: EventEmitter =
  global.__campusRealtimeEmitter || new EventEmitter()

realtimeBus.setMaxListeners(500)

if (process.env.NODE_ENV !== 'production') {
  global.__campusRealtimeEmitter = realtimeBus
}

export interface RealtimeMessage {
  channel: string
  event: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  timestamp: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function broadcastRealtimeEvent(channel: string, event: string, data: any) {
  try {
    const payload: RealtimeMessage = {
      channel,
      event,
      data,
      timestamp: Date.now(),
    }
    realtimeBus.emit(channel, payload)
    // Also emit to universal wildcard channel for master monitors
    realtimeBus.emit('*', payload)
  } catch (err) {
    console.error('Error emitting realtime event:', err)
  }
}
