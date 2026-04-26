/**
 * STT 流式 WebSocket 路由测试
 *
 * 策略：
 * 1. vi.hoisted + vi.mock 拦截 buildWsAuthUrl，返回本地假讯飞服务器地址
 * 2. 每个 describe 块内启动 fakeIat（模拟讯飞 IAT）+ sttServer（承载 handleSttStream）
 * 3. 客户端连接 sttServer → 发 PCM binary → 等待 iatWs 建立后发 'done' → 验证返回
 *
 * 关键时序：
 * - stt.ts 创建 iatWs 后，PCM 先进 pending buffer（iatWs 还在 CONNECTING）
 * - iatWs.on('open') 时 flush pending 并设置 firstSent=true
 * - 必须在 iatWs.on('open') 执行后才发 'done'，否则走快速松手分支返回 {text: ""}
 * - 使用 fakeIat.waitForFirstMessage() 等待 fake IAT 收到第一帧作为信号：
 *   此时 stt.ts 的 iatWs.on('open') 必然已执行，firstSent=true，无 race condition
 * - 注意：不能用 waitForConnection()（服务端 connection 事件比客户端 open 事件早，
 *   在 CI 上 done 会在 open 之前被处理，导致 {text:''} 的 flaky 失败）
 */
import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleSttStream } from './stt'

// ── Mock ─────────────────────────────────────────────────────────
const mockConfig = vi.hoisted(() => ({ fakeIatPort: 0 }))
vi.mock('../services/xunfei/auth', () => ({
  buildWsAuthUrl: () => `ws://127.0.0.1:${mockConfig.fakeIatPort}/`,
  buildAuthUrl:   () => ({ toString: () => '' }),
}))

// ── 假讯飞 IAT 服务器工厂 ─────────────────────────────────────────
type IatHandler = (ws: WebSocket, messages: string[]) => void

interface FakeIat {
  port: number
  /**
   * 等待 fake IAT 服务器收到 stt.ts 发来的第一条消息。
   * 此时 stt.ts 的 iatWs.on('open') 必然已执行，firstSent=true，
   * 再发 'done' 不会走快速松手分支。比 TCP connection 事件晚，无 race。
   */
  waitForFirstMessage: () => Promise<void>
  close: () => Promise<void>
}

function createFakeIat(handler: IatHandler): Promise<FakeIat> {
  return new Promise(resolve => {
    const srv = http.createServer()
    const wss = new WebSocketServer({ server: srv })
    let firstMsgReceived = false
    let firstMsgWaiters: Array<() => void> = []
    let activeWs: WebSocket | null = null

    wss.on('connection', ws => {
      activeWs = ws
      const msgs: string[] = []
      ws.on('message', (data) => {
        msgs.push(data.toString())
        // 第一条消息到达 → stt.ts 的 iatWs.on('open') 已执行，firstSent=true
        if (!firstMsgReceived) {
          firstMsgReceived = true
          const fns = firstMsgWaiters.splice(0)
          for (const fn of fns) fn()
        }
        try { handler(ws, msgs) } catch { /* ignore */ }
      })
    })

    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port
      resolve({
        port,
        waitForFirstMessage: () => {
          if (firstMsgReceived) return Promise.resolve()
          return new Promise<void>(res => firstMsgWaiters.push(res))
        },
        close: () => new Promise<void>(res => {
          if (activeWs) { try { activeWs.terminate() } catch { /* ignore */ } }
          wss.close(() => srv.close(() => res()))
        }),
      })
    })
  })
}

// ── 被测服务器工厂 ────────────────────────────────────────────────
interface SttServer { port: number; close: () => Promise<void> }

function createSttServer(): Promise<SttServer> {
  return new Promise(resolve => {
    const srv = http.createServer()
    const wss = new WebSocketServer({ noServer: true })
    const activeClients = new Set<WebSocket>()

    srv.on('upgrade', (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, ws => {
        activeClients.add(ws)
        ws.on('close', () => activeClients.delete(ws))
        handleSttStream(ws, req)
      })
    })
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port
      resolve({
        port,
        close: () => new Promise<void>(res => {
          for (const ws of activeClients) { try { ws.terminate() } catch { /* ignore */ } }
          wss.close(() => srv.close(() => res()))
        }),
      })
    })
  })
}

// ── 辅助 ─────────────────────────────────────────────────────────
function connectClient(sttPort: number, lang = 'zh_cn'): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(`ws://127.0.0.1:${sttPort}/api/stt/stream?lang=${lang}`)
    client.on('error', reject)
    client.on('open', () => resolve(client))
  })
}

function collectLastMsg(client: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let last = ''
    client.on('message', d => { last = d.toString() })
    client.on('close', () => resolve(last))
    client.on('error', reject)
  })
}

function makeIatPayload(text: string, sn = 1, status = 2) {
  const resultText = { sn, ws: text.split('').map(c => ({ bg: 0, cw: [{ w: c }] })) }
  return {
    header: { code: 0, message: 'success', status },
    payload: { result: { text: Buffer.from(JSON.stringify(resultText)).toString('base64') } },
  }
}

// ─────────────────────────────────────────────────────────────────
// 正常流程
// ─────────────────────────────────────────────────────────────────
describe('handleSttStream — 正常识别流程', () => {
  let iat: FakeIat
  let stt: SttServer

  beforeEach(async () => {
    iat = await createFakeIat((ws, msgs) => {
      const parsed = JSON.parse(msgs[msgs.length - 1]) as { header?: { status?: number } }
      if (parsed.header?.status === 2) {
        ws.send(JSON.stringify(makeIatPayload('apple苹果', 1, 2)))
      }
    })
    mockConfig.fakeIatPort = iat.port
    stt = await createSttServer()
  })
  afterEach(async () => { await stt.close(); await iat.close() })

  it('发送 PCM + done，收到 {text}', async () => {
    const client = await connectClient(stt.port)
    const msgPromise = collectLastMsg(client)
    client.send(Buffer.from([0x00, 0x01, 0x02]))
    await iat.waitForFirstMessage()  // 等 fake IAT 收到第一帧 → firstSent=true
    client.send('done')
    expect(JSON.parse(await msgPromise)).toMatchObject({ text: 'apple苹果' })
  })

  it('lang=en_us 时结果同样返回', async () => {
    const client = await connectClient(stt.port, 'en_us')
    const msgPromise = collectLastMsg(client)
    client.send(Buffer.from([0x00, 0x01]))
    await iat.waitForFirstMessage()
    client.send('done')
    expect(JSON.parse(await msgPromise)).toHaveProperty('text')
  })
})

// ─────────────────────────────────────────────────────────────────
// 快速松手（未发送任何 PCM）
// ─────────────────────────────────────────────────────────────────
describe('handleSttStream — 快速松手无音频', () => {
  let iat: FakeIat
  let stt: SttServer

  beforeEach(async () => {
    iat = await createFakeIat(() => { /* 不会收到消息 */ })
    mockConfig.fakeIatPort = iat.port
    stt = await createSttServer()
  })
  afterEach(async () => { await stt.close(); await iat.close() })

  it('仅发 done 未发 PCM，返回 {text: ""}', async () => {
    const client = await connectClient(stt.port)
    const msgPromise = collectLastMsg(client)
    client.send('done')   // firstSent=false → 快速松手分支
    expect(JSON.parse(await msgPromise)).toEqual({ text: '' })
  })
})

// ─────────────────────────────────────────────────────────────────
// PCM 在 iatWs OPEN 前积压（pending buffer）
// ─────────────────────────────────────────────────────────────────
describe('handleSttStream — pending buffer 冲刷', () => {
  let iat: FakeIat
  let stt: SttServer

  beforeEach(async () => {
    iat = await createFakeIat((ws, msgs) => {
      const parsed = JSON.parse(msgs[msgs.length - 1]) as { header?: { status?: number } }
      if (parsed.header?.status === 2) {
        ws.send(JSON.stringify(makeIatPayload('test', 1, 2)))
      }
    })
    mockConfig.fakeIatPort = iat.port
    stt = await createSttServer()
  })
  afterEach(async () => { await stt.close(); await iat.close() })

  it('连接建立前积压的 PCM 帧被 flush，最终收到 {text}', async () => {
    const client = await connectClient(stt.port)
    const msgPromise = collectLastMsg(client)
    // 立即发多帧（进 pending buffer），再等 iatWs open 后发 done
    for (let i = 0; i < 3; i++) client.send(Buffer.alloc(32, i))
    await iat.waitForFirstMessage()
    client.send('done')
    expect(JSON.parse(await msgPromise)).toHaveProperty('text')
  })
})

// ─────────────────────────────────────────────────────────────────
// 讯飞返回错误码
// ─────────────────────────────────────────────────────────────────
describe('handleSttStream — 讯飞返回错误码', () => {
  let iat: FakeIat
  let stt: SttServer

  beforeEach(async () => {
    iat = await createFakeIat((ws, msgs) => {
      const parsed = JSON.parse(msgs[msgs.length - 1]) as { header?: { status?: number } }
      if (parsed.header?.status === 2) {
        ws.send(JSON.stringify({ header: { code: 10165, message: '无效签名', status: 2 } }))
      }
    })
    mockConfig.fakeIatPort = iat.port
    stt = await createSttServer()
  })
  afterEach(async () => { await stt.close(); await iat.close() })

  it('讯飞返回非 0 code，客户端收到 {error}', async () => {
    const client = await connectClient(stt.port)
    const msgPromise = collectLastMsg(client)
    client.send(Buffer.from([0x00]))
    await iat.waitForFirstMessage()
    client.send('done')
    const msg = JSON.parse(await msgPromise) as { error?: string }
    expect(msg.error).toMatch('10165')
  })
})

// ─────────────────────────────────────────────────────────────────
// 客户端提前断开
// ─────────────────────────────────────────────────────────────────
describe('handleSttStream — 客户端提前断开', () => {
  let iat: FakeIat
  let stt: SttServer

  beforeEach(async () => {
    iat = await createFakeIat((ws, msgs) => {
      const parsed = JSON.parse(msgs[msgs.length - 1]) as { header?: { status?: number } }
      if (parsed.header?.status === 2) {
        setTimeout(() => {
          try { ws.send(JSON.stringify(makeIatPayload('late', 1, 2))) } catch { /* ignore */ }
        }, 80)
      }
    })
    mockConfig.fakeIatPort = iat.port
    stt = await createSttServer()
  })
  afterEach(async () => { await stt.close(); await iat.close() })

  it('客户端断开后服务端不崩溃，仍可接受新连接', async () => {
    const client = await connectClient(stt.port)
    client.send(Buffer.from([0x00]))
    await iat.waitForFirstMessage()
    client.send('done')
    client.terminate()   // 立即断开

    await new Promise(res => setTimeout(res, 200))

    const client2 = await connectClient(stt.port)
    const msgPromise = collectLastMsg(client2)
    client2.send('done')
    expect(await msgPromise).toContain('text')
  })
})

// ─────────────────────────────────────────────────────────────────
// 多段结果合并（rpl 覆盖）
// ─────────────────────────────────────────────────────────────────
describe('handleSttStream — 多段结果合并', () => {
  let iat: FakeIat
  let stt: SttServer

  beforeEach(async () => {
    iat = await createFakeIat((ws, msgs) => {
      const parsed = JSON.parse(msgs[msgs.length - 1]) as { header?: { status?: number } }
      if (parsed.header?.status === 2) {
        const r1 = { sn: 1, ws: [{ bg: 0, cw: [{ w: '苹' }] }] }
        const r2 = { sn: 2, pgs: 'rpl', rg: [1, 1], ws: [{ bg: 0, cw: [{ w: 'apple' }] }] }
        const toMsg = (r: object, status: number) => JSON.stringify({
          header: { code: 0, message: 'success', status },
          payload: { result: { text: Buffer.from(JSON.stringify(r)).toString('base64') } },
        })
        ws.send(toMsg(r1, 1))
        ws.send(toMsg(r2, 2))
      }
    })
    mockConfig.fakeIatPort = iat.port
    stt = await createSttServer()
  })
  afterEach(async () => { await stt.close(); await iat.close() })

  it('rpl 替换后最终文本为 apple', async () => {
    const client = await connectClient(stt.port)
    const msgPromise = collectLastMsg(client)
    client.send(Buffer.from([0x00]))
    await iat.waitForFirstMessage()
    client.send('done')
    expect(JSON.parse(await msgPromise)).toMatchObject({ text: 'apple' })
  })
})
