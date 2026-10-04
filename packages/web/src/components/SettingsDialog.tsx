// src/components/SettingsDialog.tsx
//
// 设置：服务端连接（PWA 的关键） + 运行配置（工作区 / provider / model / 预算 / 密钥）。
//
// apiKey 只写不读（契约第 2 节）：界面永远不回显密钥，只显示「已配置」。
// 连接测试用**输入框里的值**而不是已保存的值，这样「先测再存」是可能的。

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { api, describeApiError, toApiError } from '../api/client'
import { normalizeBaseUrl, parseConnectionInput, type Credentials } from '../lib/credentials'
import { canEditField, permissionHint } from '../lib/permissions'
import { durationZh } from '../lib/format'
import type { ConfigInfo, ConfigPatch, ModelCatalog, ToolInfo } from '../api/types'

export function SettingsDialog({
  open,
  onClose,
  credentials,
  onSaveCredentials,
  config,
  configStatus,
  configError,
  loadConfig,
  saveConfig,
  tools,
  toolsStatus,
  toolsError,
  loadTools,
}: {
  open: boolean
  onClose: () => void
  credentials: Credentials
  onSaveCredentials: (next: Credentials) => void
  config: ConfigInfo | null
  configStatus: 'idle' | 'loading' | 'ready' | 'error'
  configError: string | null
  loadConfig: () => void
  saveConfig: (patch: ConfigPatch) => Promise<boolean>
  tools: ToolInfo[]
  toolsStatus: 'idle' | 'loading' | 'ready' | 'error'
  toolsError: string | null
  loadTools: () => void
}): ReactNode {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const [baseUrlInput, setBaseUrlInput] = useState(credentials.baseUrl)
  const [tokenInput, setTokenInput] = useState(credentials.token)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // 表单字段（打开时用服务端的值初始化）
  const [workspace, setWorkspace] = useState('')
  const [provider, setProvider] = useState('deepseek')
  const [model, setModel] = useState('')
  const [modelBaseUrl, setModelBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [maxIterations, setMaxIterations] = useState('')
  const [maxTokens, setMaxTokens] = useState('')
  // 能选哪些模型：来自 GET /api/models（服务端的模型目录）。拉不到就退回手填
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)

  const group = catalog?.groups.find((item) => item.id === provider) ?? null

  // 哪些字段能改由身份决定（判据在 lib/permissions.ts，与服务端那四条一致）。
  // 置灰而不是隐藏：按钮消失会让人以为功能不存在，置灰加一句原因才对得上
  // 「为什么我不能改」这个问题。
  const identity = config?.identity ?? null
  const mayEdit = (field: 'workspace' | 'baseUrl' | 'provider' | 'apiKey' | 'model' | 'limits'): boolean =>
    canEditField(identity, field)

  // loadConfig / loadTools 是父组件传进来的函数：不放进 effect 依赖，而是用 ref 取最新的一份。
  // 否则父组件每次渲染换一个新的箭头函数就会让这个 effect 反复跑，而 effect 里又 setState，
  // 直接变成「Maximum update depth exceeded」的无限循环（曾经真的踩过）。
  const actionsRef = useRef({ loadConfig, loadTools })
  actionsRef.current = { loadConfig, loadTools }

  useEffect(() => {
    if (!open) return
    setBaseUrlInput(credentials.baseUrl)
    setTokenInput(credentials.token)
    setTestResult(null)
    setSaved(false)
    setApiKey('')
    actionsRef.current.loadConfig()
    actionsRef.current.loadTools()
  }, [credentials.baseUrl, credentials.token, open])

  useEffect(() => {
    if (config === null) return
    setWorkspace(config.workspace)
    setProvider(config.model.provider)
    setModel(config.model.model)
    setModelBaseUrl(config.baseUrl ?? '')
    setMaxIterations(String(config.limits.maxIterations))
    setMaxTokens(config.limits.maxTokens === null ? '' : String(config.limits.maxTokens))
  }, [config])

  // 模型清单跟着配置一起拉。失败不报错：手填模型名一直可用，缺清单只是少几个候选
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    api
      .listModels(credentials, controller.signal)
      .then((data) => setCatalog(data))
      .catch(() => setCatalog(null))
    return () => controller.abort()
  }, [credentials, open])

  // Esc 关闭 + Tab 锁在对话框内 + 关闭后焦点回到触发元素
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const node = dialogRef.current
    const focusables = (): HTMLElement[] =>
      node === null
        ? []
        : [...node.querySelectorAll<HTMLElement>('button, input, select, textarea, [href]')].filter(
            (element) => !element.hasAttribute('disabled'),
          )
    const first = focusables()[0]
    first?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      const head = items[0]
      const tail = items[items.length - 1]
      if (head === undefined || tail === undefined) return
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault()
        tail.focus()
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault()
        head.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previous?.focus()
    }
  }, [onClose, open])

  if (!open) return null

  // 粘贴的若是服务端启动时打印的带 token 的 URL，顺手把 token 拆出来
  const handleBaseUrlChange = (value: string) => {
    const parsed = parseConnectionInput(value)
    if (parsed.token !== null) {
      setBaseUrlInput(parsed.baseUrl)
      setTokenInput(parsed.token)
      return
    }
    setBaseUrlInput(value)
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    const target: Credentials = { baseUrl: normalizeBaseUrl(baseUrlInput), token: tokenInput.trim() }
    try {
      const health = await api.health(target)
      setTestResult({
        ok: true,
        text: `连接成功：${health.name} v${health.version} · 已运行 ${durationZh(health.uptimeMs / 1000)}`,
      })
    } catch (error) {
      setTestResult({ ok: false, text: describeApiError(toApiError(error), target) })
    } finally {
      setTesting(false)
    }
  }

  const save = async () => {
    // 连接凭据先落地：之后的 PATCH 才会打到正确的服务端
    const nextCredentials: Credentials = { baseUrl: normalizeBaseUrl(baseUrlInput), token: tokenInput.trim() }
    const credentialsChanged = nextCredentials.baseUrl !== credentials.baseUrl || nextCredentials.token !== credentials.token
    if (credentialsChanged) {
      onSaveCredentials(nextCredentials)
      setSaved(true)
      return // 换服务端后配置要重新拉，先让用户看到新连接的结果
    }

    // 只提交这个身份**有权改**的字段：把无权字段一起发过去只会换回一个 403，
    // 于是「保存」这个按钮在普通用户手里永远失败 —— 而他明明只改了模型
    const patch: ConfigPatch = {}
    if (mayEdit('workspace')) patch.workspace = workspace
    // 模型与提供方一起提交：它们是一条引用。只给 provider 时服务端会落到那一家的默认模型
    if (mayEdit('provider')) {
      patch.model = model.trim() === '' ? { provider } : { provider, model: model.trim() }
    } else if (mayEdit('model')) {
      // 普通用户只能改型号：provider 原样带上（服务端不拦「同家换型号」）
      patch.model = { provider: config?.model.provider ?? provider, model: model.trim() }
    }
    if (mayEdit('baseUrl') && modelBaseUrl !== (config?.baseUrl ?? '')) {
      patch.baseUrl = modelBaseUrl === '' ? null : modelBaseUrl
    }
    const iterations = Number(maxIterations)
    if (Number.isFinite(iterations) && iterations > 0) patch.maxIterations = Math.floor(iterations)
    const tokens = maxTokens.trim() === '' ? null : Number(maxTokens)
    if (tokens === null || Number.isFinite(tokens)) patch.maxTokens = tokens
    // 密钥只在填了新值时才提交（空 = 不修改）
    if (mayEdit('apiKey') && apiKey.trim() !== '') patch.apiKey = apiKey.trim()

    setSaving(true)
    const ok = await saveConfig(patch)
    setSaving(false)
    setSaved(ok)
    if (ok) setApiKey('')
  }

  return (
    <div
      className="dialog-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
        <div className="dialog-head">
          <Icon name="gear" size={16} />
          <h2 id={titleId}>设置</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="关闭设置">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="dialog-body">
          <section>
            <div className="section-title">服务端连接</div>
            <p className="hint" style={{ color: 'var(--fg-faint)', fontSize: 12, margin: '0 0 12px' }}>
              留空表示同源（服务端就在本机时用它）。手机 PWA 要填局域网地址，
              例如 <code>http://192.168.1.5:7370</code>；服务端要求鉴权时再填 token。
            </p>
            <div className="field">
              <label htmlFor="conn-base">服务端地址</label>
              <input
                id="conn-base"
                className="input"
                value={baseUrlInput}
                placeholder="留空 = 同源，或 http://192.168.1.5:7370"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => handleBaseUrlChange(event.target.value)}
              />
              <span className="hint">粘贴带 token 的地址会自动拆分出 token</span>
            </div>
            <div className="field">
              <label htmlFor="conn-token">访问 token</label>
              <input
                id="conn-token"
                className="input"
                type="password"
                value={tokenInput}
                placeholder="回环地址访问时不需要"
                autoComplete="off"
                onChange={(event) => setTokenInput(event.target.value)}
              />
            </div>
            <div className="errorbox-actions">
              <button type="button" className="btn btn-secondary" onClick={() => void testConnection()} disabled={testing}>
                <Icon name="refresh" size={15} />
                {testing ? '测试中…' : '测试连接'}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
            {testResult !== null && (
              <p
                style={{
                  marginTop: 8,
                  fontSize: 12.5,
                  color: testResult.ok ? 'var(--ok)' : 'var(--danger)',
                }}
                role="status"
              >
                {testResult.text}
              </p>
            )}
            {saved && <p style={{ marginTop: 8, fontSize: 12.5, color: 'var(--ok)' }}>已保存</p>}
          </section>

          <section>
            <div className="section-title">运行配置</div>
            {configStatus === 'loading' && <div className="skeleton sk-line" style={{ width: '60%' }} />}
            {configStatus === 'error' && (
              <div className="errorbox" role="alert">
                <span className="errorbox-title">
                  <Icon name="alert" size={15} />
                  配置读取失败
                </span>
                <span>{configError}</span>
                <span className="errorbox-actions">
                  <button type="button" className="btn btn-secondary" onClick={loadConfig}>
                    重试
                  </button>
                </span>
              </div>
            )}
            {configStatus === 'ready' && config !== null && (
              <>
                <div className="field">
                  <label htmlFor="cfg-workspace">工作区</label>
                  <input
                    id="cfg-workspace"
                    className="input"
                    value={workspace}
                    spellCheck={false}
                    disabled={!mayEdit('workspace')}
                    onChange={(event) => setWorkspace(event.target.value)}
                  />
                  <span className="hint">
                    {mayEdit('workspace')
                      ? '改工作区会切换会话列表（旧会话仍留在旧工作区）'
                      : permissionHint(identity, 'workspace')}
                  </span>
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label htmlFor="cfg-provider">provider</label>
                    <select
                      id="cfg-provider"
                      className="input"
                      value={provider}
                      disabled={!mayEdit('provider')}
                      onChange={(event) => {
                        const next = event.target.value
                        setProvider(next)
                        // 换家时把模型名也换成新家的默认值：旧名字发给别家几乎必然 400。
                        // 默认值由服务端的模型目录给出，界面不自己编。
                        const target = catalog?.groups.find((item) => item.id === next)
                        const fallback = target?.models.find((m) => m.default === true)?.id
                          ?? target?.models[0]?.id
                          ?? ''
                        setModel(fallback)
                      }}
                    >
                      {/* 清单来自服务端；万一没拉到，至少能把当前这一家列出来 */}
                      {(catalog?.groups ?? [{ id: provider, label: provider, envKey: '', hasApiKey: config?.hasApiKey ?? false, models: [] }]).map(
                        (item) => (
                          <option key={item.id} value={item.id}>
                            {item.id} — {item.label}
                          </option>
                        ),
                      )}
                    </select>
                    <span className="hint">
                      {mayEdit('provider') ? (
                        group === null ? (
                          ''
                        ) : (
                          <>
                            密钥读 <code>{group.envKey}</code>
                            {group.hasApiKey ? '（已配置）' : '（尚未配置）'}
                          </>
                        )
                      ) : (
                        permissionHint(identity, 'provider')
                      )}
                    </span>
                  </div>
                  <div className="field">
                    <label htmlFor="cfg-model">model</label>
                    {/* datalist 而不是 select：候选来自目录，但名字仍然可以手填 ——
                        各家的型号迭代很快，界面不该拦着一个还没进目录的新模型 */}
                    <input
                      id="cfg-model"
                      className="input"
                      list="cfg-model-options"
                      value={model}
                      spellCheck={false}
                      placeholder={group?.models[0]?.id ?? '模型名'}
                      onChange={(event) => setModel(event.target.value)}
                    />
                    <datalist id="cfg-model-options">
                      {(group?.models ?? []).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </datalist>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="cfg-baseurl">模型 baseUrl</label>
                  <input
                    id="cfg-baseurl"
                    className="input"
                    value={modelBaseUrl}
                    placeholder="留空 = 用 provider 默认地址"
                    spellCheck={false}
                    disabled={!mayEdit('baseUrl')}
                    onChange={(event) => setModelBaseUrl(event.target.value)}
                  />
                  {!mayEdit('baseUrl') && <span className="hint">{permissionHint(identity, 'baseUrl')}</span>}
                </div>
                <div className="field">
                  <label htmlFor="cfg-key">API key</label>
                  <input
                    id="cfg-key"
                    className="input"
                    type="password"
                    value={apiKey}
                    placeholder={config.hasApiKey ? '已配置（留空 = 不修改）' : '尚未配置'}
                    autoComplete="off"
                    disabled={!mayEdit('apiKey')}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                  <span className="hint">
                    {mayEdit('apiKey')
                      ? '只写不读：服务端不会把密钥回传给浏览器'
                      : permissionHint(identity, 'apiKey')}
                  </span>
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label htmlFor="cfg-iterations">最大迭代数</label>
                    <input
                      id="cfg-iterations"
                      className="input"
                      type="number"
                      min={1}
                      value={maxIterations}
                      onChange={(event) => setMaxIterations(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="cfg-tokens">token 上限</label>
                    <input
                      id="cfg-tokens"
                      className="input"
                      type="number"
                      min={0}
                      placeholder="留空 = 不限制"
                      value={maxTokens}
                      onChange={(event) => setMaxTokens(event.target.value)}
                    />
                  </div>
                </div>
                <div className="errorbox-actions">
                  <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
                    {saving ? '保存中…' : '保存运行配置'}
                  </button>
                </div>
              </>
            )}
          </section>

          <section>
            <div className="section-title">可用工具</div>
            {toolsStatus === 'loading' && <div className="skeleton sk-line" style={{ width: '50%' }} />}
            {toolsStatus === 'error' && <p style={{ fontSize: 12.5, color: 'var(--danger)' }}>{toolsError}</p>}
            {toolsStatus === 'ready' && (
              <div className="tool-list listbox">
                {tools.map((tool) => (
                  <div className="tool-row" key={tool.name}>
                    <code>{tool.name}</code>
                    {tool.requiresApproval && <span className="chip chip-brand">需审批</span>}
                    <span>{tool.description}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
