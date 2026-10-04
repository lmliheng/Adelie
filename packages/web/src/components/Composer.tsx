// src/components/Composer.tsx
//
// 输入框。三条硬要求：
//   1. **输入法安全**：中文/日文输入法里 Enter 是「确认候选词」，不是「发送」。
//      keydown 上必须看 event.isComposing（老浏览器退回 keyCode === 229），
//      否则会把半截拼音发出去。Shift+Enter 换行。
//   2. 手机软键盘弹出时不能把输入框顶走：文本域自增高、外层用 dvh 与安全区。
//   3. 运行中按钮变「停止」；文本域仍可输入下一条，只是发送被禁用。

import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

const MAX_HEIGHT = 176 // 11rem，与 .composer textarea 的 max-height 对齐

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  stopRequested,
  disabled,
  placeholder,
}: {
  value: string
  onChange: (next: string) => void
  onSend: (text: string) => void
  onStop: () => void
  streaming: boolean
  stopRequested: boolean
  disabled: boolean
  placeholder: string
}): ReactNode {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const composing = useRef(false)

  // 自增高：先归零再按 scrollHeight 撑开，超过上限交给内部滚动
  useEffect(() => {
    const node = textareaRef.current
    if (node === null) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, MAX_HEIGHT)}px`
  }, [value])

  const submit = () => {
    const text = value.trim()
    if (text === '' || disabled || streaming) return
    onSend(text)
    onChange('')
  }

  return (
    <div className="composer-wrap">
      <form
        className={`composer${disabled ? ' is-disabled' : ''}`}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <label className="sr-only" htmlFor="composer-input">
          给 Adelie 的任务
        </label>
        <textarea
          id="composer-input"
          ref={textareaRef}
          rows={1}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onCompositionStart={() => {
            composing.current = true
          }}
          onCompositionEnd={() => {
            composing.current = false
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return
            // isComposing 在部分输入法下不置位，keyCode 229 是最后的判据
            if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return
            event.preventDefault()
            submit()
          }}
        />
        <div className="composer-foot">
          <span className="composer-hints">
            <span>
              <kbd>Enter</kbd> 发送
            </span>
            <span>
              <kbd>Shift</kbd>+<kbd>Enter</kbd> 换行
            </span>
          </span>
          <span className="spacer" />
          {streaming ? (
            <button type="button" className="btn btn-secondary" onClick={onStop} disabled={stopRequested}>
              <Icon name="stop" size={14} />
              {stopRequested ? '正在停止…' : '停止'}
            </button>
          ) : (
            <button
              type="submit"
              className="btn btn-primary"
              disabled={disabled || value.trim() === ''}
              aria-label="发送"
              data-testid="send"
            >
              <Icon name="send" size={15} />
            </button>
          )}
        </div>
      </form>
      <p className="disclaimer">
        Adelie 会在工作区里读写文件、执行命令；需要审批的操作会先停下来问你。
      </p>
    </div>
  )
}
