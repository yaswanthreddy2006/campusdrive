import { realtimeBus, RealtimeMessage } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const channelsParam = searchParams.get('channel') || searchParams.get('channels') || '*'
  const targetChannels = channelsParam.split(',').map((c) => c.trim()).filter(Boolean)

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection ACK
      const initData = `data: ${JSON.stringify({ type: 'connected', channels: targetChannels })}\n\n`
      controller.enqueue(encoder.encode(initData))

      const listener = (msg: RealtimeMessage) => {
        try {
          const chunk = `data: ${JSON.stringify(msg)}\n\n`
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // Stream closed or controller unavailable
        }
      }

      // Subscribe to requested channels
      targetChannels.forEach((ch) => {
        realtimeBus.on(ch, listener)
      })

      // Send periodic keep-alive comment every 15s to keep connection alive
      const keepAliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'))
        } catch {
          clearInterval(keepAliveInterval)
        }
      }, 15000)

      req.signal.addEventListener('abort', () => {
        clearInterval(keepAliveInterval)
        targetChannels.forEach((ch) => {
          realtimeBus.off(ch, listener)
        })
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
